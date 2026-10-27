// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCard, updateCard, type DeckCard } from './deck';
import { readMindmap } from './mindmap';
import { updateTextFile } from './files-write';
import { locateNode, serializeMindmap } from './mindmap-core';
import { checklistProgress, projectDeckChecklist } from './mindmap-deck-core';
import { cardMindmapBinding, deckProgressTitle, normalizeCardWorkflow, workflowItems, workflowLists } from './mindmap-workflow-core';
import { reconcileTaskContent, writeTaskDescription } from './shared-task-content';
import { sameCard } from './deck-card-snapshot';
import { planningVersion } from './planning-json';
export { cardMindmapBinding, deckProgressTitle, normalizeWorkflowChecklist, type CardMindmapBinding } from './mindmap-workflow-core';
type Update = Parameters<typeof updateCard>[0] & { taskDescription?: string; syncTaskContent?: true; expectedVersion?: string; expectedMapEtag?: string };

/** Called only by our foreground card edit. No timer, worker or external UI observer. */
export async function updateCardInMindmapWorkflow(input: Update, scopes: string[]) {
  const { taskDescription, syncTaskContent, expectedVersion, expectedMapEtag, ...nativeInput } = input;
  if (taskDescription !== undefined && input.description !== undefined) throw Error('Gemeinsame Aufgabenbeschreibung und vollständige Kartenbeschreibung getrennt bearbeiten.');
  if (taskDescription !== undefined && (!expectedVersion || !expectedMapEtag)) throw Error('Gemeinsame Aufgabenbeschreibung benötigt frische Kartenversion und Mindmap-ETag.');
  const current = await getCard(input.boardId, input.stackId, input.cardId);
  if (expectedVersion !== undefined && await planningVersion(current) !== expectedVersion) throw Error('Gelesene Kartenversion ist veraltet. Neu lesen; keine Änderung.');
  const oldBinding = cardMindmapBinding(current.description ?? '');
  const binding = cardMindmapBinding(input.description ?? current.description ?? '');
  if (!oldBinding && !binding) {
    if (taskDescription !== undefined || syncTaskContent || expectedMapEtag !== undefined) throw Error('Gemeinsamer Aufgabeninhalt benötigt eine bestätigte Mindmap-Zuordnung.');
    return { card: await updateCard(nativeInput, expectedVersion === undefined ? undefined : current) };
  }
  if (!binding || (oldBinding && JSON.stringify(oldBinding) !== JSON.stringify(binding))) throw new Error('Mindmap-Zuordnung darf bei einer Kartenbearbeitung nicht entfernt oder geändert werden.');
  for (const scope of ['deck:read', 'files:read', 'files:write']) if (!scopes.includes(scope)) throw new Error(`Für diese ausdrücklich verbundene Karte fehlt ${scope}. Keine Änderung.`);
  if (current.deletedAt) throw new Error('Gelöschte Karte nicht bearbeiten.');
  const snapshot = await readMindmap(binding.path);
  if (snapshot.fileId !== binding.fileId) throw new Error('Die zugeordnete Mindmap-Datei hat eine andere Kennung. Keine Änderung.');
  if (expectedMapEtag !== undefined && snapshot.etag !== expectedMapEtag) throw Error('Gelesene Mindmap-Version ist veraltet. Neu lesen; keine Änderung.');
  if (!snapshot.permissions.includes('W')) throw Error('Die zugeordnete Mindmap ist nicht nativ beschreibbar. Keine Änderung.');
  const node = locateNode(snapshot.mindmap, binding.nodeId).node;
  const state = node.data.nfDeckSync as Record<string, unknown> | undefined;
  if (!state || state.version !== 1 || state.boardId !== input.boardId || state.cardId !== input.cardId || state.checklistId !== binding.checklistId) throw new Error('Die Mindmap bestätigt diese Kartenzuordnung nicht. Keine Änderung.');
  // An incoming edit must never conceal an already conflicting saved pair.
  reconcileTaskContent(snapshot.mindmap, binding.nodeId, current.title, current.description ?? '');
  let requested = normalizeCardWorkflow(input.description ?? current.description ?? '', binding, current.description ?? '');
  if (taskDescription !== undefined) requested = writeTaskDescription(requested, taskDescription);
  const shared = reconcileTaskContent(snapshot.mindmap, binding.nodeId, input.title ?? current.title, requested);
  const description = shared.description;
  const items = workflowItems(description, binding);
  const progress = checklistProgress(items);
  const title = deckProgressTitle(shared.content.title, progress.total, progress.completed);
  // Validate all target changes before modifying the leading Deck source.
  const projected = projectDeckChecklist(shared.map, binding.nodeId, { boardId: input.boardId, cardId: input.cardId, checklistId: binding.checklistId }, items, node.data.hyperlink as string, !!(input.done === undefined ? current.done : input.done), workflowLists(description, binding));
  const changed = serializeMindmap(projected.map) !== serializeMindmap(snapshot.mindmap);
  const latest = await getCard(input.boardId, input.stackId, input.cardId);
  if (!sameCard(current, latest)) throw new Error('Karte wurde während der Vorbereitung geändert. Keine Änderung.');
  const patch = { ...nativeInput, title, description };
  const unchanged = Object.entries(patch).filter(([key, value]) => !['boardId', 'stackId', 'cardId'].includes(key) && value !== undefined).every(([key, value]) => (current as unknown as Record<string, unknown>)[key] === value);
  const card: DeckCard = unchanged ? current : await updateCard(patch, current);
  try {
    const checked = await getCard(input.boardId, input.stackId, input.cardId);
    if (!sameCard(card, checked)) throw new Error('Deck-Quelle wurde nach dem Speichern geändert.');
    if (!changed) return { card, taskContent: shared.content, mindmap: { verified: true, unchanged: true, ...progress } };
    const newState = locateNode(projected.map, binding.nodeId).node.data.nfDeckSync as Record<string, unknown>;
    newState.syncedAt = new Date().toISOString();
    newState.sourceFingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(description)))).map(b => b.toString(16).padStart(2, '0')).join('');
    newState.sourceLastModified = card.lastModified ?? null;
    const written = await updateTextFile(binding.path, snapshot.etag, serializeMindmap(projected.map), binding.fileId);
    if (!written.verified || !('fileId' in written) || !('etag' in written)) throw new Error('Die Mindmap-Rücklesung wurde nicht bestätigt.');
    return { card, taskContent: shared.content, mindmap: { verified: true, fileId: written.fileId, etag: written.etag, ...progress } };
  } catch (error) {
    // The card is already saved. Be explicit so callers don't replay the edit.
    return { card, mindmap: { verified: false, pending: true, error: error instanceof Error ? error.message : 'Mindmap-Abgleich offen.', ...progress }, note: 'Deck ist gespeichert. Nur den Abgleich prüfen; die Kartenänderung nicht erneut ausführen.' };
  }
}
