// SPDX-License-Identifier: AGPL-3.0-or-later
import { getCard, deckBoardUrl } from './deck';
import { readMindmap } from './mindmap';
import { updateTextFile } from './files-write';
import { serializeMindmap, mindmapSummary, locateNode } from './mindmap-core';
import { cardMindmapBinding, workflowItems, workflowLists } from './mindmap-workflow-core';
import { parseDeckChecklist, projectDeckChecklist } from './mindmap-deck-core';
import { reconcileTaskContent, taskTitle } from './shared-task-content';
import { sameCard } from './deck-card-snapshot';

export async function syncMindmapCard(input: { path: string; fileId: string; etag: string; nodeId: string; boardId: number; stackId: number; cardId: number; checklistId: string }) {
  const current = await readMindmap(input.path);
  if (current.fileId !== input.fileId || current.etag !== input.etag) throw new Error('Mindmap-Identität oder Version geändert. Neu lesen; kein Schreibversuch.');
  const card = await getCard(input.boardId, input.stackId, input.cardId);
  if (card.deletedAt) throw new Error('Gelöschte Karte nicht abgleichen.');
  const binding = cardMindmapBinding(card.description ?? '');
  const conditions = binding ? workflowLists(card.description ?? '', binding) : undefined;
  if (binding && (binding.path !== input.path || binding.fileId !== input.fileId || binding.nodeId !== input.nodeId || binding.checklistId !== input.checklistId)) throw Error('Kartenbindung stimmt nicht mit dem Auftrag überein.');
  const items = conditions ? workflowItems(card.description ?? '', binding!) : parseDeckChecklist(card.description ?? '', input.checklistId);
  const cardUrl = new URL(`/index.php/apps/deck/card/${input.cardId}`, deckBoardUrl(input.boardId)).href;
  const node = locateNode(current.mindmap, input.nodeId).node;
  if (!binding && (node.data.nfDeckSync as any)?.content !== undefined) throw Error('Gemeinsamer Aufgabeninhalt benötigt die bestätigte Kartenbindung.');
  const shared = binding && node.data.nfDeckSync !== undefined ? reconcileTaskContent(current.mindmap, input.nodeId, card.title, card.description ?? '') : undefined;
  if (shared && (shared.content.title !== taskTitle(card.title) || shared.description !== (card.description ?? ''))) throw Error('Gemeinsamer Aufgabeninhalt benötigt eine Deck-Änderung. Karte frisch lesen und update_card mit syncTaskContent=true verwenden; kein Schreibversuch.');
  const projected = projectDeckChecklist(shared?.map ?? current.mindmap, input.nodeId, { boardId: input.boardId, cardId: input.cardId, checklistId: input.checklistId }, items, cardUrl, !!card.done, conditions);
  const changed = serializeMindmap(projected.map) !== serializeMindmap(current.mindmap);
  // Re-read the source immediately before the target write. This is a snapshot
  // projection, not an atomic transaction across the two Nextcloud applications.
  const latest = await getCard(input.boardId, input.stackId, input.cardId);
  if (!sameCard(card, latest)) throw new Error('Deck-Quelle wurde während des Abgleichs geändert. Kein Schreibversuch.');
  const sourceReadAt = new Date().toISOString();
  const sourceFingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(card.description ?? '')))).map(b => b.toString(16).padStart(2, '0')).join('');
  if (changed) {
    const state = locateNode(projected.map, input.nodeId).node.data.nfDeckSync as Record<string, unknown>;
    state.syncedAt = sourceReadAt; state.sourceFingerprint = sourceFingerprint; state.sourceLastModified = card.lastModified ?? null;
  }
  const result = changed
    ? await updateTextFile(input.path, input.etag, serializeMindmap(projected.map), input.fileId)
    : { ...current, verified: true, unchanged: true, writeAccepted: false };
  return { ...result, cardId: input.cardId, nodeId: input.nodeId, checklistId: input.checklistId, sourceReadAt, sourceFingerprint, sourceLastModified: card.lastModified ?? null, progress: projected.progress, statusConflict: projected.statusConflict, items, ...(result.verified ? mindmapSummary(projected.map) : {}), note: 'Gezielter Abgleich einer führenden Deck-Checkliste. Nur der gewählte Block und seine verwaltete Checklistenansicht werden geändert. Keine Deck-Änderung, kein Hintergrunddienst. Native Fortschrittsanzeige in Achtelschritten; Prozentzahl ist exakt gerundet. Bei unklarer Rücklesung nur denselben Pfad prüfen.' };
}
