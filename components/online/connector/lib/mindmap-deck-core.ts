// SPDX-License-Identifier: AGPL-3.0-or-later
import { locateNode, parseMindmap, serializeMindmap, type Mindmap, type MindmapNode } from './mindmap-core';

export type ChecklistItem = { id: string; text: string; done: boolean; listId?: string };
export type ConditionList = { id: string; title: string; items: ChecklistItem[] };
export type DeckBinding = { boardId: number; cardId: number; checklistId: string };
const keyPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The native rich editor joins the closing marker to the final task line. */
export function canonicalChecklistBoundary(description: string, checklistId: string) {
  let fence: string | null = null;
  const end = `<!-- nf-checklist:${checklistId}:end -->`;
  return description.replace(/\r\n?/g, '\n').split('\n').map(line => {
    const code = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (code) { if (!fence) fence = code[1][0]; else if (fence === code[1][0]) fence = null; return line; }
    if (!fence && line.trimEnd().endsWith(end) && /^ {0,3}[-*+] \[[ xX]\] /.test(line)) return line.slice(0, line.lastIndexOf(end)).trimEnd() + '\n' + end;
    return line;
  }).join('\n');
}

// An explicitly selected, flat checklist. Invisible IDs survive rename/reorder.
// Examples, other lists and code fences never become project work accidentally.
export function parseDeckChecklist(description: string, checklistId: string): ChecklistItem[] {
  if (!keyPattern.test(checklistId)) throw new Error('Ungültige Checklistenkennung.');
  if (new TextEncoder().encode(description).length > 128 * 1024) throw new Error('Kartenbeschreibung überschreitet 128 KiB.');
  const start = `<!-- nf-checklist:${checklistId}:start -->`;
  const end = `<!-- nf-checklist:${checklistId}:end -->`;
  let active = false, starts = 0, ends = 0;
  let fence: { char: string; size: number } | null = null;
  const items: ChecklistItem[] = [], ids = new Set<string>();
  for (const line of canonicalChecklistBoundary(description, checklistId).split('\n')) {
    const code = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (code && code[1][0] === fence.char && code[1].length >= fence.size && !code[2].trim()) fence = null;
      continue;
    }
    if (code) {
      if (active) throw new Error('Codeblock innerhalb der Arbeitscheckliste ist nicht zulässig.');
      fence = { char: code[1][0], size: code[1].length }; continue;
    }
    if (line.trim() === start) {
      if (starts || active || ends) throw new Error('Checklistenbereich ist nicht eindeutig.');
      starts++; active = true; continue;
    }
    if (line.trim() === end) {
      if (!active || ends) throw new Error('Checklistenbereich ist nicht eindeutig.');
      ends++; active = false; continue;
    }
    if (!active || !line.trim()) continue;
    const match = /^ {0,3}[-*+] \[([ xX])\] (.+?)\s+<!-- nf-task:([a-zA-Z0-9_-]{1,64}) -->\s*$/.exec(line);
    if (!match) throw new Error('Arbeitscheckliste benötigt flache Checkbox-Zeilen mit eindeutiger nf-task-Kennung.');
    const [, state, text, id] = match;
    if (!text.trim() || text.length > 9000 || text.includes('<!--') || ids.has(id)) throw new Error('Leerer, zu langer oder uneindeutiger Checklistenpunkt.');
    ids.add(id); items.push({ id, text: text.trim(), done: state.toLowerCase() === 'x' });
    if (items.length > 100) throw new Error('Höchstens 100 Punkte pro Arbeitsblock.');
  }
  if (starts !== 1 || ends !== 1 || active) throw new Error('Gewählte Arbeitscheckliste fehlt oder ist nicht abgeschlossen.');
  return items;
}

export function checklistProgress(items: ChecklistItem[]) {
  const total = items.length, completed = items.filter(i => i.done).length;
  const percent = total ? Math.round(completed / total * 10000) / 100 : null;
  // Native KityMinder progress = 1 (empty), 2..8 (eighths), 9 (complete).
  // Always floor incomplete icons so they never imply more work than done.
  const icon = total ? (completed === total ? 9 : 1 + Math.floor(completed / total * 8)) : 0;
  return { total, completed, percent, icon, allChecked: total > 0 && completed === total };
}

/** Recount only explicitly registered nodes; mirrored task nodes never add work. */
export function recountMindmapProgress(map: Mindmap) {
  const merge = (target: Map<string, ChecklistItem>, key: string, item: ChecklistItem) => {
    const existing = target.get(key);
    if (existing && (existing.done !== item.done || existing.text !== item.text)) throw new Error('Doppelte Deck-Aufgabe besitzt widersprüchliche Stände. Kein Abgleich.');
    target.set(key, item);
  };
  const visit = (node: MindmapNode): Map<string, ChecklistItem> => {
    const tasks = new Map<string, ChecklistItem>();
    const sync = node.data.nfDeckSync;
    if (sync !== undefined) {
      if (!object(sync) || sync.version !== 1 || !Number.isSafeInteger(sync.boardId) || Number(sync.boardId) < 1 || !Number.isSafeInteger(sync.cardId) || Number(sync.cardId) < 1 || typeof sync.checklistId !== 'string' || !keyPattern.test(sync.checklistId) || !Array.isArray(sync.items) || sync.items.length > 1000) throw new Error('Ungültige Deck-Zuordnung in der Fortschrittsauswertung.');
      const ids = new Set<string>();
      for (const item of sync.items) {
        if (!object(item) || typeof item.id !== 'string' || !keyPattern.test(item.id) || typeof item.text !== 'string' || !item.text.trim() || typeof item.done !== 'boolean' || ids.has(item.id)) throw new Error('Ungültige Aufgabe in der Fortschrittsauswertung.');
        ids.add(item.id);
        if (item.listId !== undefined && (typeof item.listId !== 'string' || !keyPattern.test(item.listId))) throw new Error('Ungültige Bedingungslistenkennung.');
        merge(tasks, JSON.stringify([sync.boardId, sync.cardId, item.listId ?? sync.checklistId, item.id]), item as ChecklistItem);
      }
    }
    for (const child of node.children ?? []) for (const [key, item] of visit(child)) merge(tasks, key, item);
    const aggregate = node.data.nfDeckAggregate;
    if (aggregate !== undefined) {
      if (!object(aggregate) || aggregate.version !== 1 || aggregate.scope !== 'defined-checklist-tasks' || sync !== undefined || node.data.nfDeckChecklistOwner !== undefined) throw new Error('Ungültiger oder konkurrierender Sammelfortschritt.');
      const progress = checklistProgress([...tasks.values()]);
      // Native empty pie for an unplanned branch; never mark an empty list done.
      const icon = progress.total ? progress.icon : 1;
      node.data.progress = icon;
      node.data.nfDeckAggregate = { ...aggregate, ...progress, icon, state: progress.total ? 'tracked' : 'unplanned' };
    }
    return tasks;
  };
  // Maps without opt-in markers retain their original projection behavior.
  const registered = (node: MindmapNode): boolean => node.data.nfDeckAggregate !== undefined || (node.children ?? []).some(registered);
  if (registered(map.root)) visit(map.root);
}

/** Explicit initial registration, leaving names, links, notes and other nodes intact. */
export function registerMindmapProgress(source: Mindmap, nodeIds: string[]) {
  if (!nodeIds.length || new Set(nodeIds).size !== nodeIds.length) throw new Error('Fortschrittsknoten müssen eindeutig gewählt sein.');
  const map = parseMindmap(serializeMindmap(source));
  for (const id of nodeIds) {
    const node = locateNode(map, id).node;
    if (node.data.nfDeckSync !== undefined || node.data.nfDeckChecklistOwner !== undefined) throw new Error('Deck-Arbeitsblock und Checklistenpunkte behalten ihre eigene Fortschrittsanzeige.');
    if (node.data.nfDeckAggregate === undefined) {
      if (node.data.progress) throw new Error('Vorhandene eigene Fortschrittsanzeige nicht überschreiben.');
      node.data.nfDeckAggregate = { version: 1, scope: 'defined-checklist-tasks' };
    }
  }
  recountMindmapProgress(map);
  serializeMindmap(map);
  return map;
}

function projectChecklistView(map: Mindmap, node: MindmapNode, nodeId: string, containerId: string, items: ChecklistItem[], label: string, listId?: string) {
  if (containerId.length > 255) throw new Error('Arbeitsblockkennung ist zu lang für die Checklistenansicht.');
  let container: MindmapNode | undefined;
  try {
    const existing = locateNode(map, containerId);
    if (existing.parent !== node || existing.node.data.nfDeckChecklistOwner !== nodeId) throw new Error('Reservierte Checklistenkennung wird bereits anderweitig benutzt.');
    container = existing.node;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Knotenkennung nicht gefunden')) throw error;
  }
  container ??= { data: { id: containerId, text: label, nfDeckChecklistOwner: nodeId }, children: [] };
  const oldItems = new Map<string, MindmapNode>();
  for (const child of container.children ?? []) {
    if (child.data.nfDeckChecklistOwner !== nodeId || typeof child.data.nfDeckTaskId !== 'string' || oldItems.has(child.data.nfDeckTaskId)) throw new Error('Checklistenansicht enthält eigene Inhalte oder doppelte Kennungen; keine automatische Entfernung.');
    oldItems.set(child.data.nfDeckTaskId, child);
  }
  const incoming = new Set(items.map(i => i.id));
  const ownedFields = new Set(['id', 'text', 'progress', 'nfDeckChecklistOwner', 'nfDeckTaskId', 'nfDeckTaskDone', 'nfDeckListId']);
  for (const [id, child] of oldItems) if (!incoming.has(id) && (child.children?.length || Object.keys(child.data).some(k => !ownedFields.has(k)) || Object.keys(child).some(k => !['data', 'children'].includes(k)))) throw new Error('Entfernter Punkt besitzt eigene Inhalte; Änderung zunächst klären.');
  const children = items.map(item => {
    const id = `${containerId}:${item.id}`;
    if (id.length > 255) throw new Error('Punktkennung ist zu lang.');
    const old = oldItems.get(item.id);
    if (!old) {
      try { locateNode(map, id); throw new Error('Punktkennung kollidiert mit einem bestehenden Knoten.'); }
      catch (error) { if (!(error instanceof Error) || !error.message.startsWith('Knotenkennung nicht gefunden')) throw error; }
    }
    return { ...(old ?? {}), data: { ...(old?.data ?? {}), id, text: `${item.done ? '☑' : '☐'} ${item.text}`, progress: item.done ? 9 : 1, nfDeckChecklistOwner: nodeId, nfDeckTaskId: item.id, nfDeckTaskDone: item.done, ...(listId ? { nfDeckListId: listId } : {}) }, children: old?.children ?? [] };
  });
  const progress = checklistProgress(items);
  container.data.text = `${label} · ${progress.completed}/${progress.total}`;
  if (listId) { container.data.nfDeckListId = listId; container.data.progress = progress.total ? progress.icon : 1; }
  container.children = children;
  node.children ??= [];
  if (!node.children.includes(container)) node.children.push(container);
}

export function projectDeckChecklist(source: Mindmap, nodeId: string, binding: DeckBinding, items: ChecklistItem[], cardUrl: string, cardDone: boolean, lists?: ConditionList[]) {
  const map = parseMindmap(serializeMindmap(source));
  const node = locateNode(map, nodeId).node;
  const previous = node.data.nfDeckSync;
  if (previous !== undefined && (!object(previous) || previous.version !== 1 || previous.boardId !== binding.boardId || previous.cardId !== binding.cardId || previous.checklistId !== binding.checklistId || typeof previous.baseText !== 'string')) throw new Error('Arbeitsblock besitzt eine andere oder ungültige Deck-Zuordnung.');
  if (node.data.hyperlink && node.data.hyperlink !== cardUrl) throw new Error('Arbeitsblock hat bereits einen anderen Link.');
  const baseText = object(previous) ? previous.baseText as string : node.data.text;
  const aggregate = node.data.nfDeckAggregate;
  if (aggregate !== undefined) {
    if (!object(aggregate) || aggregate.version !== 1 || aggregate.scope !== 'defined-checklist-tasks' || previous !== undefined) throw new Error('Arbeitsblock besitzt einen ungültigen Sammelfortschritt.');
    delete node.data.nfDeckAggregate;
  }
  if (lists) {
    if (!lists.length || lists.length > 10 || lists[0].id !== binding.checklistId || new Set(lists.map(l => l.id)).size !== lists.length) throw new Error('Bedingungslisten sind nicht eindeutig zugeordnet.');
    const allIds = new Set<string>();
    for (const list of lists) {
      if (!keyPattern.test(list.id) || !list.title.trim() || list.title.length > 120 || list.items.length > 100) throw new Error('Ungültige Bedingungsliste.');
      for (const item of list.items) {
        if (!keyPattern.test(item.id) || !item.text.trim() || typeof item.done !== 'boolean' || allIds.has(item.id)) throw new Error('Doppelte oder ungültige Bedingung.');
        allIds.add(item.id);
      }
    }
    if (object(previous) && Array.isArray(previous.lists) && previous.lists.some(l => !object(l) || !lists.some(n => n.id === l.id))) throw new Error('Bedingungslisten nicht stillschweigend entfernen.');
    const flattened = lists.flatMap(l => l.items.map(item => ({ ...item, listId: l.id })));
    if (JSON.stringify(flattened) !== JSON.stringify(items)) throw new Error('Bedingungsbestand stimmt nicht mit seinen Listen überein.');
    for (const [index, list] of lists.entries()) projectChecklistView(map, node, nodeId, `${nodeId}:deck-checklist${index ? ':' + list.id : ''}`, list.items, list.title, list.id);
  } else {
    if (object(previous) && previous.lists !== undefined) throw new Error('Bedingungslisten müssen gemeinsam abgeglichen werden.');
    projectChecklistView(map, node, nodeId, `${nodeId}:deck-checklist`, items, 'Checkliste');
  }
  const progress = checklistProgress(items);
  node.data.hyperlink = cardUrl;
  node.data.text = `${baseText} · ${progress.total ? `${progress.completed}/${progress.total} · ${progress.percent} %` : lists ? 'keine Bedingungen' : 'keine Punkte'}`;
  node.data.progress = progress.total ? progress.icon : lists ? 1 : progress.icon;
  node.data.nfDeckSync = { ...(object(previous) ? previous : {}), version: 1, ...binding, baseText, ...progress, cardDone, statusConflict: cardDone && !progress.allChecked, items, ...(lists ? { lists, role: 'conditions' } : {}) };
  recountMindmapProgress(map);
  serializeMindmap(map);
  return { map, progress, statusConflict: cardDone && !progress.allChecked, changed: serializeMindmap(map) !== serializeMindmap(source) };
}
