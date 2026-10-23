// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCard, updateCard, type DeckCard } from './deck';
import { readMindmap } from './mindmap';
import { updateTextFile } from './files-write';
import { locateNode, serializeMindmap } from './mindmap-core';
import { checklistProgress, parseDeckChecklist, projectDeckChecklist } from './mindmap-deck-core';
import { cardMindmapBinding, deckProgressTitle, normalizeCardWorkflow, workflowItems, workflowLists } from './mindmap-workflow-core';
export { cardMindmapBinding, deckProgressTitle, normalizeWorkflowChecklist, type CardMindmapBinding } from './mindmap-workflow-core';
type Update = Parameters<typeof updateCard>[0];

/** Called only by our foreground card edit. No timer, worker or external UI observer. */
export async function updateCardInMindmapWorkflow(input: Update, scopes: string[]) {
  const current = await getCard(input.boardId, input.stackId, input.cardId);
  const oldBinding = cardMindmapBinding(current.description ?? '');
  const binding = cardMindmapBinding(input.description ?? current.description ?? '');
  if (!oldBinding && !binding) return { card: await updateCard(input) };
  if (!binding || (oldBinding && JSON.stringify(oldBinding) !== JSON.stringify(binding))) throw new Error('Mindmap-Zuordnung darf bei einer Kartenbearbeitung nicht entfernt oder geändert werden.');
  for (const scope of ['deck:read', 'files:read', 'files:write']) if (!scopes.includes(scope)) throw new Error(`Für diese ausdrücklich verbundene Karte fehlt ${scope}. Keine Änderung.`);
  if (current.deletedAt) throw new Error('Gelöschte Karte nicht bearbeiten.');
  const snapshot = await readMindmap(binding.path);
  if (snapshot.fileId !== binding.fileId) throw new Error('Die zugeordnete Mindmap-Datei hat eine andere Kennung. Keine Änderung.');
  const node = locateNode(snapshot.mindmap, binding.nodeId).node;
  const state = node.data.nfDeckSync as Record<string, unknown> | undefined;
  if (!state || state.version !== 1 || state.boardId !== input.boardId || state.cardId !== input.cardId || state.checklistId !== binding.checklistId) throw new Error('Die Mindmap bestätigt diese Kartenzuordnung nicht. Keine Änderung.');
  const description = normalizeCardWorkflow(input.description ?? current.description ?? '', binding, current.description ?? '');
  const items = workflowItems(description, binding);
  const progress = checklistProgress(items);
  const title = deckProgressTitle(input.title ?? current.title, progress.total, progress.completed);
  // Validate all target changes before modifying the leading Deck source.
  const projected = projectDeckChecklist(snapshot.mindmap, binding.nodeId, { boardId: input.boardId, cardId: input.cardId, checklistId: binding.checklistId }, items, node.data.hyperlink as string, !!(input.done === undefined ? current.done : input.done), workflowLists(description, binding));
  const latest = await getCard(input.boardId, input.stackId, input.cardId);
  if (latest.description !== current.description || latest.title !== current.title || latest.done !== current.done || latest.deletedAt) throw new Error('Karte wurde während der Vorbereitung geändert. Keine Änderung.');
  const patch = { ...input, title, description };
  const unchanged = Object.entries(patch).filter(([key, value]) => !['boardId', 'stackId', 'cardId'].includes(key) && value !== undefined).every(([key, value]) => (current as unknown as Record<string, unknown>)[key] === value);
  const card: DeckCard = unchanged ? current : await updateCard(patch);
  try {
    const checked = await getCard(input.boardId, input.stackId, input.cardId);
    if (checked.description !== description || checked.title !== title || checked.done !== card.done || checked.deletedAt) throw new Error('Deck-Quelle wurde nach dem Speichern geändert.');
    if (!projected.changed) return { card, mindmap: { verified: true, unchanged: true, ...progress } };
    const newState = locateNode(projected.map, binding.nodeId).node.data.nfDeckSync as Record<string, unknown>;
    newState.syncedAt = new Date().toISOString();
    newState.sourceFingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(description)))).map(b => b.toString(16).padStart(2, '0')).join('');
    newState.sourceLastModified = card.lastModified ?? null;
    const written = await updateTextFile(binding.path, snapshot.etag, serializeMindmap(projected.map), binding.fileId);
    if (!written.verified || !('fileId' in written) || !('etag' in written)) throw new Error('Die Mindmap-Rücklesung wurde nicht bestätigt.');
    return { card, mindmap: { verified: true, fileId: written.fileId, etag: written.etag, ...progress } };
  } catch (error) {
    // The card is already saved. Be explicit so callers don't replay the edit.
    return { card, mindmap: { verified: false, pending: true, error: error instanceof Error ? error.message : 'Mindmap-Abgleich offen.', ...progress }, note: 'Deck ist gespeichert. Nur den Abgleich prüfen; die Kartenänderung nicht erneut ausführen.' };
  }
}
