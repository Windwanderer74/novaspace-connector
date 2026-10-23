// SPDX-License-Identifier: AGPL-3.0-or-later
import { changeMindmap, locateNode, mindmapPath, parseMindmap, serializeMindmap, type Mindmap } from './mindmap-core';
import { projectDeckChecklist, registerMindmapProgress } from './mindmap-deck-core';
import { cardMindmapBinding, deckProgressTitle, newConditionDescription, workflowItems, workflowLists } from './mindmap-workflow-core';

export type WorkStepInput = { path: string; fileId: string; etag: string; parentId: string; nodeId: string; title: string; boardId: number; stackId: number; conditions: string[] };
export type WorkCard = { id: number; stackId: number; title: string; description?: string | null; done?: string | null; deletedAt?: number };
export type WorkMap = { text: string; fileId: string; etag: string };
export type WorkStepClient = {
  map(path: string): Promise<WorkMap>;
  saveMap(path: string, etag: string, fileId: string, text: string): Promise<void>;
  target(boardId: number, stackId: number): Promise<void>;
  cards(boardId: number): Promise<WorkCard[]>;
  createCard(boardId: number, stackId: number, title: string, description: string): Promise<WorkCard>;
  card(boardId: number, stackId: number, cardId: number): Promise<WorkCard>;
  saveCard(boardId: number, card: WorkCard, title: string, description: string): Promise<WorkCard>;
};
type Intent = { version: 1; parentId: string; boardId: number; stackId: number; title: string; phase: 'reserved' | 'linked'; items: { id: string; text: string; done: boolean }[] };
export function workStepIntent(map: Mindmap, nodeId: string): Intent | undefined {
  const value = locateNode(map, nodeId).node.data.nfWorkStep as Intent | undefined;
  if (!value) return;
  if (value.version !== 1 || !['reserved', 'linked'].includes(value.phase) || !Array.isArray(value.items) || !value.items.length) throw Error('Unvollständige Arbeitsschritt-Zuordnung. Bitte prüfen.');
  return value;
}
export function prepareWorkStep(source: Mindmap, input: WorkStepInput) {
  mindmapPath(input.path);
  if (!/^\d+$/.test(input.fileId) || !/^"[^"\s]+"$/.test(input.etag) || !/^[a-zA-Z0-9_-]{1,48}$/.test(input.nodeId) || !input.title.trim() || input.title.trim().length > 240 || ![input.boardId, input.stackId].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('Ungültiger Arbeitsschritt oder Karten-Ziel.');
  if (!Array.isArray(input.conditions) || !input.conditions.length || input.conditions.length > 100 || input.conditions.some(t => typeof t !== 'string' || !t.trim() || t.length > 9000 || /[\r\n]|<!--/.test(t))) throw Error('Bitte mindestens eine und höchstens 100 einfache Bedingungen formulieren.');
  let existing;
  try { existing = locateNode(source, input.nodeId); } catch { /* new explicit identity */ }
  if (existing) {
    const intent = workStepIntent(source, input.nodeId);
    if (!intent || existing.parent?.data.id !== input.parentId || intent.parentId !== input.parentId || intent.boardId !== input.boardId || intent.stackId !== input.stackId) throw Error('Arbeitsschritt-Kennung ist bereits anders zugeordnet.');
    return { map: parseMindmap(serializeMindmap(source)), intent, existing: true };
  }
  const parent = locateNode(source, input.parentId).node;
  if (parent.data.nfDeckSync || parent.data.nfDeckChecklistOwner || parent.data.nfSource || parent.data.nfWorkStep || parent.data.hyperlink) throw Error('Bitte die Grundkapsel als Ausgangspunkt auswählen.');
  const intent: Intent = { version: 1, parentId: input.parentId, boardId: input.boardId, stackId: input.stackId, title: input.title.trim(), phase: 'reserved', items: input.conditions.map((text, i) => ({ id: `${input.nodeId}_condition_${i + 1}`, text: text.trim(), done: false })) };
  let map = changeMindmap(source, [{ action: 'add', parentId: input.parentId, nodeId: input.nodeId, text: intent.title }]);
  locateNode(map, input.nodeId).node.data.nfWorkStep = intent;
  map = registerMindmapProgress(map, [...new Set([map.root.data.id, input.parentId])]);
  map.root.data.nfDeckAutoNodes = 1;
  map.root.data.nfDeckTarget = { version: 1, boardId: input.boardId, stackId: input.stackId };
  // Check the complete projection before reserving or making a Deck request.
  attachWorkStep(map, input, intent, { id: 1, stackId: input.stackId, title: intent.title, description: workStepDescription(input, intent) }, 'https://validation.invalid');
  return { map, intent, existing: false };
}
function binding(input: WorkStepInput) { return { version: 1 as const, path: input.path, fileId: input.fileId, nodeId: input.nodeId, checklistId: 'work' }; }
function workStepDescription(input: WorkStepInput, intent: Intent) { return newConditionDescription(binding(input), intent.items); }
function matches(card: WorkCard, input: WorkStepInput) {
  const found = cardMindmapBinding(card.description ?? '');
  return !card.deletedAt && found?.path === input.path && found.fileId === input.fileId && found.nodeId === input.nodeId && found.checklistId === 'work';
}
function attachWorkStep(map: Mindmap, input: WorkStepInput, intent: Intent, card: WorkCard, origin: string) {
  if (!matches(card, input)) throw Error('Die Karte bestätigt den Arbeitsschritt nicht. Keine neue Anlage.');
  const description = card.description ?? '', b = binding(input);
  const out = projectDeckChecklist(map, input.nodeId, { boardId: intent.boardId, cardId: card.id, checklistId: 'work' }, workflowItems(description, b), `${origin}/index.php/apps/deck/card/${card.id}`, !!card.done, workflowLists(description, b));
  locateNode(out.map, input.nodeId).node.data.nfWorkStep = { ...intent, phase: 'linked' };
  return out;
}
/** One foreground operation for browser and MCP. Reservation prevents a blind
 * second POST after uncertainty; existing bindings are recovered read-first.
 * Deck and DAV are separate stores, so interrupted operations remain visible. */
export async function createWorkStep(client: WorkStepClient, input: WorkStepInput, origin: string) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin) throw Error('Eindeutige HTTPS-Instanz erforderlich.');
  let snapshot = await client.map(input.path);
  if (snapshot.fileId !== input.fileId || snapshot.etag !== input.etag) throw Error('Mindmap-Version geändert. Bitte neu öffnen; keine Anlage.');
  const prepared = prepareWorkStep(parseMindmap(snapshot.text), input), intent = prepared.intent;
  await client.target(intent.boardId, intent.stackId);
  const candidates = (await client.cards(intent.boardId)).filter(c => matches(c, input));
  if (candidates.length > 1) throw Error('Mehrere Karten bestätigen diesen Arbeitsschritt. Bitte prüfen; keine Anlage.');
  const node = locateNode(prepared.map, input.nodeId).node;
  const sync = node.data.nfDeckSync as { cardId: number; boardId: number } | undefined;
  if (prepared.existing && intent.phase === 'linked') {
    if (!sync || sync.boardId !== intent.boardId || candidates.length !== 1 || candidates[0].id !== sync.cardId) throw Error('Bestehende Kartenverbindung nicht bestätigt. Bitte prüfen; keine Anlage.');
    return { ...snapshot, map: prepared.map, card: candidates[0], nodeId: input.nodeId, reused: true, verified: true };
  }
  let card = candidates[0];
  if (prepared.existing && !card) throw Error('Dieser Arbeitsschritt hat einen offenen Anlageversuch. Keine passende Karte gefunden. Bitte das Board prüfen; nicht erneut anlegen.');
  if (!prepared.existing && card) throw Error('Kartenbindung ohne zugehörige Reservierung gefunden. Bitte prüfen; keine Anlage.');
  const description = workStepDescription(input, intent), title = deckProgressTitle(intent.title, intent.items.length, 0);
  if (!prepared.existing) {
    await client.saveMap(input.path, snapshot.etag, snapshot.fileId, serializeMindmap(prepared.map));
    snapshot = await client.map(input.path);
    if (snapshot.fileId !== input.fileId || snapshot.text !== serializeMindmap(prepared.map)) throw Error('Reservierung nicht bestätigt. Keine Kartenanlage.');
    try {
      card = await client.createCard(intent.boardId, intent.stackId, title, description);
      if (!Number.isSafeInteger(card.id) || card.id < 1 || card.stackId !== intent.stackId) throw Error('Kartenkennung nicht bestätigt.');
      card = await client.card(intent.boardId, card.stackId, card.id);
      if ((card.description ?? '') !== description && !(card.description ?? '').trim()) card = await client.saveCard(intent.boardId, card, title, description);
      if (!matches(card, input) || card.description !== description || card.title !== title) throw Error('Kartenrücklesung nicht bestätigt.');
    } catch (e) { throw Error(`Arbeitsschritt reserviert; Kartenanlage offen: ${e instanceof Error ? e.message : 'Bitte prüfen.'} Den gespeicherten Arbeitsschritt erneut öffnen, keine zweite Anlage starten.`); }
  }
  const fresh = await client.map(input.path);
  if (fresh.fileId !== snapshot.fileId || fresh.etag !== snapshot.etag) throw Error(`Karte ${card.id} vorhanden; Mindmap inzwischen geändert. Den gespeicherten Arbeitsschritt zur Wiederaufnahme öffnen.`);
  const finalCard = await client.card(intent.boardId, card.stackId, card.id);
  if (!matches(finalCard, input) || finalCard.description !== card.description || finalCard.title !== card.title || finalCard.done !== card.done) throw Error('Karte inzwischen geändert; Zuordnung offen. Bitte wieder aufnehmen.');
  const projected = attachWorkStep(parseMindmap(fresh.text), input, intent, finalCard, origin);
  try { await client.saveMap(input.path, fresh.etag, fresh.fileId, serializeMindmap(projected.map)); }
  catch (e) { throw Error(`Karte ${card.id} vorhanden; Zuordnung offen: ${e instanceof Error ? e.message : 'Bitte prüfen.'} Den gespeicherten Arbeitsschritt erneut öffnen; keine zweite Karte anlegen.`); }
  const saved = await client.map(input.path);
  if (saved.fileId !== input.fileId || saved.text !== serializeMindmap(projected.map)) throw Error('Gespeicherte Zuordnung noch nicht bestätigt. Bitte nur neu lesen.');
  return { ...saved, map: projected.map, card: finalCard, nodeId: input.nodeId, reused: prepared.existing, verified: true };
}
