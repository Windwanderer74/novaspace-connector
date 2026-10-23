// SPDX-License-Identifier: AGPL-3.0-or-later
import { locateNode, parseMindmap, serializeMindmap, type Mindmap, type MindmapNode } from './mindmap-core';
import { recountMindmapProgress } from './mindmap-deck-core';

export type SourceKind = 'file' | 'folder';
export type CapsuleSource = { path: string; fileId: string; etag: string; kind?: SourceKind };
export type SourceMetadata = { fileId: string; etag: string; kind: SourceKind; permissions: string; downloadDenied: boolean };
// Folder references track the container, not a frozen inventory of its contents.
// Check its ETag at entry; saving a map inside it may change that ETag.
export function sourceMetadataMatches(meta: SourceMetadata | null, source: CapsuleSource, atEntry = false) {
  const kind = source.kind ?? 'file';
  return Boolean(meta && meta.kind === kind && meta.fileId === source.fileId
    && (kind === 'folder' && !atEntry || meta.etag === source.etag)
    && meta.permissions.includes('G') && !meta.downloadDenied);
}
export type SourceCapsuleInput = { parentId: string; capsuleId: string; documentNodeId: string; title: string; source: CapsuleSource; sourceUrl: string };
export function sourceFilePath(path: string) {
  if (!path.startsWith('/') || path.endsWith('/') || path.includes('//') || /[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some(s => s === '.' || s === '..')) throw Error('Eindeutiger absoluter Quelldateipfad erforderlich.');
  return path;
}
export function addSourceCapsule(sourceMap: Mindmap, input: SourceCapsuleInput) {
  sourceFilePath(input.source.path);
  const sourceKind = input.source.kind ?? 'file';
  if (!['file', 'folder'].includes(sourceKind)) throw Error('Quelle muss eine Datei oder ein Ordner sein.');
  if (!/^\d+$/.test(input.source.fileId) || !/^"[^"\x00-\x20\x7f]+"$/.test(input.source.etag)) throw Error('Geprüfte Quellenkennung und Version erforderlich.');
  const url = new URL(input.sourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith(`/index.php/f/${input.source.fileId}`)) throw Error('Eindeutiger Dateiverweis erforderlich.');
  if (!input.title.trim() || input.title.length > 240) throw Error('Bitte einen Kapselnamen mit höchstens 240 Zeichen eingeben.');
  const map = parseMindmap(serializeMindmap(sourceMap));
  const matches: Array<{ node: MindmapNode; parent: MindmapNode | null }> = [];
  const visit = (node: MindmapNode, parent: MindmapNode | null) => {
    const ref = node.data.nfSource as Record<string, unknown> | undefined;
    if (node.data.hyperlink === input.sourceUrl || (ref?.version === 1 && ['file', 'folder'].includes(ref.kind as string) && ref.fileId === input.source.fileId)) matches.push({ node, parent });
    node.children?.forEach(child => visit(child, node));
  };
  visit(map.root, null);
  if (matches.length > 1) throw Error('Die Quelle ist mehrfach verknüpft. Bitte den bestehenden Zweig auswählen; keine weitere Kapsel angelegt.');
  if (matches.length === 1) {
    const { node, parent } = matches[0];
    if (node.data.hyperlink !== input.sourceUrl) throw Error('Der bestehende Quellenknoten hat einen anderen Link. Nichts überschrieben.');
    const ref = node.data.nfSource as Record<string, unknown> | undefined;
    if (ref !== undefined && (ref.version !== 1 || ref.kind !== sourceKind || ref.fileId !== input.source.fileId)) throw Error('Bestehende Quellenmetadaten widersprechen dem Quellenverweis. Nichts überschrieben.');
    return { map, capsuleId: parent?.data.id ?? node.data.id, documentNodeId: node.data.id, unchanged: true };
  }
  const parent = locateNode(map, input.parentId).node;
  if (parent.data.nfDeckChecklistOwner || parent.data.nfDeckSync || parent.data.nfSource) throw Error('Bitte einen übergeordneten Knoten ohne eigene Arbeitskartenbindung wählen.');
  const ids = new Set<string>();
  const collect = (node: MindmapNode) => { ids.add(node.data.id); node.children?.forEach(collect); }; collect(map.root);
  if ([input.capsuleId, input.documentNodeId].some(id => !id || id.length > 255 || ids.has(id)) || input.capsuleId === input.documentNodeId) throw Error('Knotenkennungen bereits belegt oder ungültig. Nichts angelegt.');
  const capsule: MindmapNode = { data: { id: input.capsuleId, text: input.title.trim(), created: Date.now() }, children: [{ data: {
    id: input.documentNodeId, text: `${sourceKind === 'folder' ? 'Ordner' : 'Unterlage'}: ${input.source.path.split('/').pop()}`, created: Date.now(), hyperlink: input.sourceUrl,
    hyperlinkTitle: input.source.path.split('/').pop(), nfSource: { version: 1, kind: sourceKind, path: input.source.path, fileId: input.source.fileId, etagAtLink: input.source.etag },
  }, children: [] }] };
  if (map.root.data.nfDeckAutoNodes === 1) capsule.data.nfDeckAggregate = { version: 1, scope: 'defined-checklist-tasks' };
  parent.children ??= []; parent.children.push(capsule);
  recountMindmapProgress(map); serializeMindmap(map);
  return { map, capsuleId: input.capsuleId, documentNodeId: input.documentNodeId, unchanged: false };
}
