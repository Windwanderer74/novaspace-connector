// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity, readTextSnapshot, fileMetadata, filePath, davDestination } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
import { createTextFile, updateTextFile } from './files-write';
import { getCard, deckBoardUrl } from './deck';
import { mindmapPath, parseMindmap, serializeMindmap, changeMindmap, locateNode, mindmapSummary, type MindmapOperation } from './mindmap-core';
import { recountMindmapProgress } from './mindmap-deck-core';
import { addSourceCapsule, sourceMetadataMatches, type SourceKind } from './source-capsule-core';

export async function readMindmap(path: string) {
  mindmapPath(path);
  const snapshot = await readTextSnapshot(await nextcloudIdentity(), path, true);
  if (snapshot.downloadDenied) throw new Error('Download für diese Datei ist gesperrt.');
  const map = parseMindmap(snapshot.text);
  return { ...snapshot, format: 'kityminder-json', mindmap: map, ...mindmapSummary(map) };
}
async function expectedMindmap(path: string, fileId: string, etag: string) {
  const current = await readMindmap(path);
  if (current.fileId !== fileId || current.etag !== etag) throw new Error('Mindmap-Identität oder Version geändert. Neu lesen; kein Schreibversuch.');
  return current;
}
export async function createMindmap(path: string, rootId: string, title: string) {
  mindmapPath(path);
  const map = { root: { data: { id: rootId, text: title }, children: [] }, template: 'default', theme: 'fresh-blue' };
  const result = await createTextFile(path, serializeMindmap(map));
  return { ...result, ...mindmapSummary(map), note: 'Anlage ohne Überschreiben. Bei unklarem Ergebnis denselben Pfad lesen; nicht erneut anlegen.' };
}
export async function updateMindmap(path: string, fileId: string, etag: string, operations: MindmapOperation[]) {
  const current = await expectedMindmap(path, fileId, etag);
  const map = changeMindmap(current.mindmap, operations);
  recountMindmapProgress(map);
  if (serializeMindmap(map) === serializeMindmap(current.mindmap)) return { ...current, verified: true, writeAccepted: false, unchanged: true };
  const result = await updateTextFile(path, etag, serializeMindmap(map), fileId);
  return { ...result, ...(result.verified ? { mindmap: map, ...mindmapSummary(map) } : {}), operationsApplied: result.verified ? operations.length : null };
}
export async function linkMindmapCard(path: string, fileId: string, etag: string, nodeId: string, boardId: number, stackId: number, cardId: number) {
  const current = await expectedMindmap(path, fileId, etag);
  const node = locateNode(current.mindmap, nodeId).node;
  const card = await getCard(boardId, stackId, cardId);
  if (card.deletedAt) throw new Error('Gelöschte Karte kann nicht verknüpft werden.');
  const url = new URL(`/index.php/apps/deck/card/${cardId}`, deckBoardUrl(boardId)).href;
  if (node.data.hyperlink && node.data.hyperlink !== url) throw new Error('Knoten hat bereits einen anderen Link. Vorhandenen Verweis nicht überschrieben.');
  if (node.data.hyperlink === url) return { ...current, verified: true, unchanged: true, writeAccepted: false, cardId, cardUrl: url };
  node.data.hyperlink = url;
  node.data.hyperlinkTitle = card.title;
  const result = await updateTextFile(path, etag, serializeMindmap(current.mindmap), fileId);
  return { ...result, cardId, cardUrl: url, cardCreated: false, ...(result.verified ? { ...mindmapSummary(current.mindmap) } : {}), note: 'Bestehende Karte geprüft und als nativer Knoten-Hyperlink gespeichert. Keine Kartenanlage oder Statusänderung. Bei unklarem Ergebnis nur zurücklesen.' };
}

export async function linkMindmapFile(path: string, fileId: string, etag: string, nodeId: string, sourcePath: string, sourceFileId: string, sourceEtag: string) {
  checkedFilePath(sourcePath); checkedEtag(sourceEtag);
  if (!/^\d+$/.test(sourceFileId)) throw new Error('Frische Quellen-Datei-ID erforderlich.');
  const current = await expectedMindmap(path, fileId, etag);
  const node = locateNode(current.mindmap, nodeId).node;
  const account = await nextcloudIdentity();
  const sameSource = (source: Awaited<ReturnType<typeof fileMetadata>>) => source?.type === 'file' && source.fileId === sourceFileId && source.etag === sourceEtag && source.permissions.includes('G') && !source.downloadDenied;
  if (!sameSource(await fileMetadata(account, sourcePath))) throw new Error('Quelldatei, Version oder Leserecht nicht bestätigt.');
  const prefix = account.filesHome.split('/remote.php/dav/')[0];
  const sourceUrl = new URL(`${prefix}/index.php/f/${sourceFileId}`, davDestination(filePath(account.filesHome, sourcePath))).href;
  if (node.data.hyperlink && node.data.hyperlink !== sourceUrl) throw new Error('Knoten hat bereits einen anderen Link. Nichts überschrieben.');
  const reference = { version: 1, kind: 'file', path: sourcePath, fileId: sourceFileId, etagAtLink: sourceEtag };
  if (node.data.hyperlink === sourceUrl && JSON.stringify(node.data.nfSource) === JSON.stringify(reference)) return { ...current, verified: true, unchanged: true, writeAccepted: false, sourceUrl, sourceFileId, sourceVersionVerified: true };
  node.data.hyperlink = sourceUrl;
  node.data.hyperlinkTitle = sourcePath.split('/').pop()!;
  node.data.nfSource = reference;
  if (!sameSource(await fileMetadata(account, sourcePath))) throw new Error('Quelle vor dem Schreiben geändert. Neu lesen; kein Schreibversuch.');
  const result = await updateTextFile(path, etag, serializeMindmap(current.mindmap), fileId);
  let sourceVersionVerified = false;
  try { sourceVersionVerified = sameSource(await fileMetadata(account, sourcePath)); } catch { /* Preserve accepted write separately from verification. */ }
  return { ...result, verified: Boolean(result.verified && sourceVersionVerified), sourceVersionVerified, sourceUrl, sourceFileId, sourcePath,
    ...(result.verified ? { ...mindmapSummary(current.mindmap) } : {}), cardCreated: false,
    note: 'Vorhandene Quelldatei als nativen Hyperlink verknüpft. etagAtLink dokumentiert die Version zum Verknüpfungszeitpunkt; der Dateilink öffnet den aktuellen Stand. Keine neue Deckkarte. Bei unklarer Rückprüfung Mindmap und Quelle lesen; nicht blind erneut schreiben.' };
}

export async function createSourceCapsule(input: { path: string; fileId: string; etag: string; parentId: string; capsuleId: string; documentNodeId: string; title: string; sourcePath: string; sourceFileId: string; sourceEtag: string; sourceKind?: SourceKind }) {
  checkedFilePath(input.sourcePath); checkedEtag(input.sourceEtag);
  const sourceKind = input.sourceKind ?? 'file';
  if (!['file', 'folder'].includes(sourceKind)) throw Error('Quelle muss eine Datei oder ein Ordner sein.');
  if (sourceKind === 'file' && input.fileId === input.sourceFileId) throw Error('Bitte eine andere Ziel-Mindmap wählen; kein Verweis auf dieselbe Mindmap.');
  const current = await expectedMindmap(input.path, input.fileId, input.etag);
  const account = await nextcloudIdentity();
  const source = { path: input.sourcePath, fileId: input.sourceFileId, etag: input.sourceEtag, kind: sourceKind };
  const sameSource = (s: Awaited<ReturnType<typeof fileMetadata>>, atEntry = false) => sourceMetadataMatches(s ? { ...s, kind: s.type } : null, source, atEntry);
  if (!sameSource(await fileMetadata(account, input.sourcePath), true)) throw Error('Quelle, Version oder Leserecht nicht bestätigt.');
  const prefix = account.filesHome.split('/remote.php/dav/')[0];
  const sourceUrl = new URL(`${prefix}/index.php/f/${input.sourceFileId}`, davDestination(filePath(account.filesHome, input.sourcePath))).href;
  const projected = addSourceCapsule(current.mindmap, { parentId: input.parentId, capsuleId: input.capsuleId, documentNodeId: input.documentNodeId, title: input.title,
    source, sourceUrl });
  if (!sameSource(await fileMetadata(account, input.sourcePath))) throw Error('Quelle inzwischen geändert. Kein Schreibversuch.');
  if (projected.unchanged) return { ...current, verified: true, unchanged: true, writeAccepted: false, capsuleId: projected.capsuleId, documentNodeId: projected.documentNodeId, cardCreated: false, sourceUrl };
  const result = await updateTextFile(input.path, input.etag, serializeMindmap(projected.map), input.fileId);
  let sourceVersionVerified = false;
  try { sourceVersionVerified = sameSource(await fileMetadata(account, input.sourcePath)); } catch { /* Accepted map writes must not be replayed. */ }
  return { ...result, verified: Boolean(result.verified && sourceVersionVerified), sourceVersionVerified: sourceKind === 'file' ? sourceVersionVerified : null, sourceIdentityVerified: sourceVersionVerified, sourceKind, capsuleId: projected.capsuleId, documentNodeId: projected.documentNodeId, sourceUrl, cardCreated: false,
    ...(result.verified ? { ...mindmapSummary(projected.map) } : {}), note: 'Grundkapsel und Quellenverweis gemeinsam gespeichert. Keine Deckkarte angelegt. Bei unklarem Ergebnis nur Mindmap und Quelle lesen; nicht erneut anlegen.' };
}
