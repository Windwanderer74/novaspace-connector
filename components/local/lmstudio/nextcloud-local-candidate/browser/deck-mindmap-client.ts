// SPDX-License-Identifier: AGPL-3.0-or-later
import { cardMindmapBinding, deckProgressTitle, normalizeCardWorkflow, workflowItems, workflowLists, conditionSection } from '../lib/mindmap-workflow-core';
import { checklistProgress, parseDeckChecklist, projectDeckChecklist } from '../lib/mindmap-deck-core';
import { locateNode, parseMindmap, serializeMindmap } from '../lib/mindmap-core';
import { reconcileTaskContent } from '../lib/shared-task-content';
import { sameCard } from '../lib/deck-card-snapshot';
export { sameCard } from '../lib/deck-card-snapshot';

export type CardRef = { boardId: number; stackId: number; cardId: number };
export function savedLinkedCardId(url: string, method: string, origin: string): number | null {
  let parsed: URL; try { parsed = new URL(url, origin); } catch { return null; }
  if (parsed.origin !== origin || !['PUT', 'PATCH'].includes(method.toUpperCase())) return null;
  const match = /^\/ocs\/v2\.php\/apps\/deck\/api\/v1\.0\/cards\/(\d+)\/?$/.exec(parsed.pathname);
  const id = Number(match?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
export type BrowserCard = { id: number; stackId: number; title: string; description?: string | null; done?: string | null; deletedAt?: number; [key: string]: unknown };
export type Client = {
  card(ref: CardRef): Promise<BrowserCard>;
  saveCard(ref: CardRef, current: BrowserCard, title: string, description: string): Promise<BrowserCard>;
  map(path: string): Promise<{ text: string; etag: string; fileId: string }>;
  saveMap(path: string, etag: string, fileId: string, text: string): Promise<void>;
  locateCard?(boardId: number, cardId: number): Promise<CardRef>;
};
export function savedCardRef(url: string, method: string, origin: string): CardRef | null {
  let parsed: URL; try { parsed = new URL(url, origin); } catch { return null; }
  if (parsed.origin !== origin || !['PUT', 'PATCH'].includes(method.toUpperCase())) return null;
  const match = /^\/index\.php\/apps\/deck\/api\/v1\.0\/boards\/(\d+)\/stacks\/(\d+)\/cards\/(\d+)\/?$/.exec(parsed.pathname);
  if (!match || match.slice(1).some(n => !Number.isSafeInteger(Number(n)) || Number(n) < 1)) return null;
  return { boardId: Number(match[1]), stackId: Number(match[2]), cardId: Number(match[3]) };
}
export async function currentCardRef(client:Client,ref:CardRef):Promise<CardRef> {
  if(!client.locateCard)return ref;
  const current=await client.locateCard(ref.boardId,ref.cardId);
  if(current.boardId!==ref.boardId || current.cardId!==ref.cardId || !Number.isSafeInteger(current.stackId) || current.stackId<1)throw Error('Aktuelle Kartenposition ist nicht eindeutig.');
  return current;
}
/** Respond to a completed user edit. Never choose or toggle a checkbox. */
export async function syncSavedDeckCard(client: Client, ref: CardRef) {
  ref=await currentCardRef(client,ref);
  const current = await client.card(ref);
  const binding = cardMindmapBinding(current.description ?? '');
  if (!binding) return { linked: false as const };
  if (current.id !== ref.cardId || current.stackId !== ref.stackId || current.deletedAt) throw new Error('Kartenposition hat sich geändert.');
  const snapshot = await client.map(binding.path);
  if (snapshot.fileId !== binding.fileId) throw new Error('Die Mindmap-Dateikennung hat sich geändert.');
  const source = parseMindmap(snapshot.text);
  const node = locateNode(source, binding.nodeId).node;
  const state = node.data.nfDeckSync as { version: number; boardId: number; cardId: number; checklistId: string; items: { id: string; text: string; done: boolean }[] } | undefined;
  if (!state || state.version !== 1 || state.boardId !== ref.boardId || state.cardId !== ref.cardId || state.checklistId !== binding.checklistId || !Array.isArray(state.items)) throw new Error('Mindmap bestätigt die Zuordnung nicht.');
  const legacyPrevious = `<!-- nf-checklist:${binding.checklistId}:start -->\n${state.items.map(i => `- [${i.done ? 'x' : ' '}] ${i.text} <!-- nf-task:${i.id} -->`).join('\n')}\n<!-- nf-checklist:${binding.checklistId}:end -->`;
  const priorLists = (state as any).lists as { id: string; title: string; items: any[] }[] | undefined;
  const previous = priorLists ? `<!-- nf-conditions:${JSON.stringify({version:1,lists:priorLists.map(({id,title})=>({id,title}))})} -->\n` + priorLists.map(l=>conditionSection(l,l.items)).join('\n\n') : legacyPrevious;
  const shared = reconcileTaskContent(source,binding.nodeId,current.title,normalizeCardWorkflow(current.description ?? '', binding, previous));
  const description = shared.description;
  const items = workflowItems(description, binding);
  const progress = checklistProgress(items);
  const title = deckProgressTitle(shared.content.title, progress.total, progress.completed);
  const projected = projectDeckChecklist(shared.map, binding.nodeId, { boardId: ref.boardId, cardId: ref.cardId, checklistId: binding.checklistId }, items, node.data.hyperlink as string, !!current.done, workflowLists(description, binding));
  const changed = serializeMindmap(projected.map) !== snapshot.text;
  if (!sameCard(current, await client.card(ref))) throw new Error('Die Karte wurde inzwischen erneut geändert.');
  const card = title === current.title && description === current.description ? current : await client.saveCard(ref, current, title, description);
  if (!sameCard(card, await client.card(ref))) throw new Error('Kartenstand nach Speichern geändert; Mindmap-Abgleich offen.');
  if (changed) {
    const updated = locateNode(projected.map, binding.nodeId).node.data.nfDeckSync as Record<string, unknown>;
    updated.syncedAt = new Date().toISOString();
    updated.sourceLastModified = card.lastModified ?? null;
    updated.sourceFingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(description)))].map(n => n.toString(16).padStart(2, '0')).join('');
    await client.saveMap(binding.path, snapshot.etag, binding.fileId, serializeMindmap(projected.map));
  }
  return { linked: true as const, card, progress, unchanged: !changed };
}

/** Explicit edit: validate the complete target before saving the card. */
export async function editDeckConditions(client: Client, ref: CardRef, expected: string, transform: (description:string)=>string) {
  const current=await client.card(ref);
  if((current.description??'')!==expected || current.deletedAt || current.stackId!==ref.stackId) throw Error('Karte wurde inzwischen geändert. Bitte neu öffnen.');
  const binding=cardMindmapBinding(expected); if(!binding) throw Error('Keine Mindmap-Verbindung.');
  const description=normalizeCardWorkflow(transform(expected),binding,expected), items=workflowItems(description,binding);
  const snapshot=await client.map(binding.path);if(snapshot.fileId!==binding.fileId) throw Error('Mindmap-Dateikennung geändert.');
  const map=parseMindmap(snapshot.text),node=locateNode(map,binding.nodeId).node;
  const shared=reconcileTaskContent(map,binding.nodeId,current.title,description);
  projectDeckChecklist(shared.map,binding.nodeId,{boardId:ref.boardId,cardId:ref.cardId,checklistId:binding.checklistId},items,node.data.hyperlink as string,!!current.done,workflowLists(description,binding));
  if(!sameCard(current,await client.card(ref))) throw Error('Karte wurde inzwischen geändert.');
  const progress=checklistProgress(items);
  await client.saveCard(ref,current,deckProgressTitle(shared.content.title,progress.total,progress.completed),shared.description);
  try{return await syncSavedDeckCard(client,ref);}catch(error){throw Error(`Karte gespeichert; Mindmap-Abgleich offen: ${error instanceof Error?error.message:'Bitte prüfen.'} Nicht erneut speichern.`);}
}
