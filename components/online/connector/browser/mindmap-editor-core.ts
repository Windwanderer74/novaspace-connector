// SPDX-License-Identifier: AGPL-3.0-or-later
import { parseMindmap, serializeMindmap, type Mindmap, type MindmapNode } from '../lib/mindmap-core';
import { recountMindmapProgress } from '../lib/mindmap-deck-core';
export function mindmapNodeIds(map: Mindmap) { const ids = new Set<string>(); const visit = (n: MindmapNode) => { ids.add(n.data.id); n.children?.forEach(visit); }; visit(map.root); return ids; }
export function inheritWorkPies(source: Mindmap, known: Set<string>) {
  const map = parseMindmap(serializeMindmap(source));
  if (map.root.data.nfDeckAutoNodes !== 1) return map;
  const visit = (node: MindmapNode, parent?: MindmapNode) => {
    if (!known.has(node.data.id) && parent && (parent.data.nfDeckAggregate || parent.data.nfDeckSync) && !parent.data.nfDeckChecklistOwner && !node.data.nfDeckChecklistOwner && !node.data.nfDeckSync && !node.data.nfDeckAggregate && node.data.progress === undefined) node.data.nfDeckAggregate = { version: 1, scope: 'defined-checklist-tasks' };
    node.children?.forEach(child => visit(child, node));
  };
  visit(map.root); recountMindmapProgress(map); return map;
}
