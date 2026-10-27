// SPDX-License-Identifier: AGPL-3.0-or-later
// KityMinder .km JSON. Unknown document/node/data fields are retained.
export type MindmapNode = { data: Record<string, unknown> & { id: string; text: string }; children?: MindmapNode[]; [key: string]: unknown };
export type Mindmap = { root: MindmapNode; [key: string]: unknown };
import { MINDMAP_MAX_BYTES } from './text-file-limits';
export { MINDMAP_MAX_BYTES } from './text-file-limits';
export function mindmapPath(path: string) {
  if (!path.startsWith('/') || path.endsWith('/') || path.includes('//') || /[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some(s => s === '.' || s === '..') || !/\.km$/i.test(path)) throw new Error('Eindeutiger absoluter .km-Dateipfad erforderlich.');
  return path;
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateMindmap(value: unknown): asserts value is Mindmap {
  if (!object(value) || !object(value.root)) throw new Error('Mindmap benötigt ein JSON-Objekt mit root.');
  const ids = new Set<string>();
  function visit(node: unknown, depth: number) {
    if (depth > 64 || ids.size >= 2000) throw new Error('Mindmap überschreitet 64 Ebenen oder 2000 Knoten.');
    if (!object(node) || !object(node.data) || typeof node.data.id !== 'string' || !node.data.id || node.data.id.length > 255 || typeof node.data.text !== 'string' || node.data.text.length > 10000) throw new Error('Jeder Knoten benötigt eine eindeutige Kennung und einen Text.');
    if (ids.has(node.data.id)) throw new Error('Doppelte Knotenkennung; keine gezielte Bearbeitung möglich.');
    ids.add(node.data.id);
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) throw new Error('children muss eine Liste sein.');
      node.children.forEach(child => visit(child, depth + 1));
    }
  }
  visit(value.root, 0);
}
export function parseMindmap(text: string): Mindmap {
  if (new TextEncoder().encode(text).length > MINDMAP_MAX_BYTES || text.includes('\0')) throw new Error('Mindmap überschreitet 512 KiB oder enthält Nullzeichen.');
  let map: unknown;
  try { map = JSON.parse(text); } catch { throw new Error('Mindmap enthält kein gültiges JSON.'); }
  validateMindmap(map);
  return map;
}
export function serializeMindmap(map: Mindmap) {
  validateMindmap(map);
  const text = JSON.stringify(map);
  parseMindmap(text);
  return text;
}
export function locateNode(map: Mindmap, id: string): { node: MindmapNode; parent: MindmapNode | null; index: number } {
  const pending = [{ node: map.root, parent: null as MindmapNode | null, index: 0 }];
  while (pending.length) {
    const item = pending.pop()!;
    if (item.node.data.id === id) return item;
    (item.node.children ?? []).forEach((node, index) => pending.push({ node, parent: item.node, index }));
  }
  throw new Error('Knotenkennung nicht gefunden. Mindmap neu lesen.');
}
export type MindmapOperation =
  | { action: 'add'; parentId: string; nodeId: string; text: string; index?: number }
  | { action: 'rename'; nodeId: string; text: string }
  | { action: 'move'; nodeId: string; parentId: string; index?: number }
  | { action: 'set_note'; nodeId: string; note: string };
export function changeMindmap(source: Mindmap, operations: MindmapOperation[]): Mindmap {
  const map = parseMindmap(serializeMindmap(source));
  for (const op of operations) {
    if (op.action === 'add') {
      const parent = locateNode(map, op.parentId).node;
      let exists = false;
      try { locateNode(map, op.nodeId); exists = true; } catch { /* absent */ }
      if (exists) throw new Error('Knotenkennung existiert bereits. Nicht erneut anlegen.');
      const children = parent.children ?? [];
      const index = op.index ?? children.length;
      if (!Number.isInteger(index) || index < 0 || index > children.length) throw new Error('Ungültige Einfügeposition.');
      children.splice(index, 0, { data: { id: op.nodeId, text: op.text, created: Date.now() }, children: [] });
      parent.children = children;
    } else {
      const item = locateNode(map, op.nodeId);
      if (op.action === 'rename') item.node.data.text = op.text;
      else if (op.action === 'set_note') item.node.data.note = op.note;
      else {
        if (!item.parent) throw new Error('Die Wurzel kann nicht verschoben werden.');
        const parent = locateNode(map, op.parentId).node;
        const subtree: Mindmap = { root: item.node };
        let cycle = false;
        try { locateNode(subtree, op.parentId); cycle = true; } catch { /* outside subtree */ }
        if (cycle) throw new Error('Ein Knoten kann nicht unter sich selbst oder seine Nachkommen verschoben werden.');
        item.parent.children!.splice(item.index, 1);
        const children = parent.children ?? [];
        const index = op.index ?? children.length;
        if (!Number.isInteger(index) || index < 0 || index > children.length) throw new Error('Ungültige Einfügeposition nach Entfernen des Knotens.');
        children.splice(index, 0, item.node);
        parent.children = children;
      }
    }
    serializeMindmap(map);
  }
  return map;
}
export function mindmapSummary(map: Mindmap) {
  const nodes: Array<{ nodeId: string; parentId: string | null; text: string; childCount: number; hyperlink: unknown }> = [];
  function visit(node: MindmapNode, parentId: string | null) {
    nodes.push({ nodeId: node.data.id, parentId, text: node.data.text, childCount: node.children?.length ?? 0, hyperlink: node.data.hyperlink ?? null });
    (node.children ?? []).forEach(child => visit(child, node.data.id));
  }
  visit(map.root, null);
  return { nodeCount: nodes.length, nodes };
}
