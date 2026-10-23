// SPDX-License-Identifier: AGPL-3.0-or-later
import { sourceFilePath, addSourceCapsule, sourceMetadataMatches, type SourceCapsuleInput } from '../lib/source-capsule-core';
import { parseMindmap, serializeMindmap } from '../lib/mindmap-core';
import { createNextcloudBrowserClient } from './nextcloud-browser-client';
export type FileMeta = { path: string; fileId: string; etag: string; permissions: string; directory: boolean; downloadDenied: boolean };
export function createSourceCapsuleClient(uid: string, token: string) {
  const { client, request } = createNextcloudBrowserClient(uid, token);
  const home = `/remote.php/dav/files/${encodeURIComponent(uid)}`;
  const dav = (path: string) => { if (path !== '/') sourceFilePath(path); return home + path.split('/').map(encodeURIComponent).join('/'); };
  const properties = '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:resourcetype/><d:getetag/><oc:fileid/><oc:permissions/><nc:hide-download/><nc:share-attributes/></d:prop></d:propfind>';
  const readEntries = async (path: string, depth: '0' | '1') => {
    const response = await request(dav(path), { method: 'PROPFIND', headers: { Depth: depth, 'Content-Type': 'application/xml' }, body: properties });
    const text = await response.text(); if (text.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('Ordnerantwort ist zu groß oder ungültig. Bitte den Ordner eingrenzen.');
    const xml = new DOMParser().parseFromString(text, 'application/xml'); if (xml.querySelector('parsererror')) throw Error('Dateiantwort nicht lesbar.');
    const rows = [...xml.getElementsByTagNameNS('DAV:', 'response')]; if (rows.length > 201) throw Error('Bitte einen Ordner mit höchstens 200 Einträgen wählen.');
    return rows.map(row => {
      const href = row.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent; if (!href) throw Error('Dateiverweis fehlt.');
      const url = new URL(href, location.origin); if (url.origin !== location.origin || !url.pathname.startsWith(home + '/')) throw Error('Dateiverweis außerhalb dieses Kontos.');
      const entryPath = '/' + url.pathname.slice(home.length + 1).replace(/\/$/, '').split('/').map(decodeURIComponent).join('/'); if (entryPath !== '/') sourceFilePath(entryPath);
      const props = [...row.getElementsByTagNameNS('DAV:', 'propstat')].filter(p => / 200 /.test(p.getElementsByTagNameNS('DAV:', 'status')[0]?.textContent ?? ''));
      const read = (ns: string, key: string) => props.map(p => p.getElementsByTagNameNS(ns, key)[0]?.textContent).find(Boolean) ?? '';
      const fileId = read('http://owncloud.org/ns', 'fileid'), etag = read('DAV:', 'getetag');
      if (!/^\d+$/.test(fileId) || !/^"[^"\x00-\x20\x7f]+"$/.test(etag)) throw Error('Dateikennung oder Version fehlt.');
      const shares = read('http://nextcloud.org/ns', 'share-attributes'); let denied = ['1', 'true'].includes(read('http://nextcloud.org/ns', 'hide-download'));
      if (shares) { const parsed = JSON.parse(shares); if (!Array.isArray(parsed)) throw Error('Freigabeattribute sind ungültig.'); denied ||= parsed.some(a => a?.scope === 'permissions' && a?.key === 'download' && [false, 'false', 0, '0'].includes(a.value ?? a.enabled)); }
      return { path: entryPath, fileId, etag, permissions: read('http://owncloud.org/ns', 'permissions'), directory: props.some(p => p.getElementsByTagNameNS('DAV:', 'collection').length > 0), downloadDenied: denied };
    });
  };
  const stat = async (path: string) => { const entries = await readEntries(path, '0'); if (entries.length !== 1 || entries[0].path !== path) throw Error('Quelldatei nicht eindeutig bestätigt.'); return entries[0]; };
  return {
    stat, map: client.map,
    listMaps: async (folder: string) => (await readEntries(folder, '1')).filter(s => s.path !== folder && !s.directory && /\.km$/i.test(s.path) && s.permissions.includes('W') && !s.downloadDenied),
    save: async (path: string, base: Awaited<ReturnType<typeof client.map>>, input: SourceCapsuleInput) => {
      const same = (s: FileMeta, atEntry = false) => sourceMetadataMatches({ ...s, kind: s.directory ? 'folder' : 'file' }, input.source, atEntry);
      if ((input.source.kind ?? 'file') === 'file' && input.source.fileId === base.fileId) throw Error('Bitte eine andere Ziel-Mindmap wählen; kein Verweis auf dieselbe Mindmap.');
      if (!same(await stat(input.source.path), true)) throw Error('Die Quelle wurde inzwischen geändert. Bitte den Einstieg neu öffnen.');
      const fresh = await client.map(path); if (fresh.fileId !== base.fileId || fresh.etag !== base.etag) throw Error('Die Mindmap wurde inzwischen geändert. Bitte den Einstieg neu öffnen.');
      const result = addSourceCapsule(parseMindmap(fresh.text), input);
      if (!same(await stat(input.source.path))) throw Error('Die Quelle wurde inzwischen geändert. Nichts gespeichert.');
      if (!result.unchanged) {
        await client.saveMap(path, fresh.etag, fresh.fileId, serializeMindmap(result.map));
        if (!same(await stat(input.source.path))) throw Error('Mindmap gespeichert; die Quelle hat sich währenddessen geändert. Bitte den vorhandenen Zweig prüfen.');
      }
      return { ...result, fileId: fresh.fileId };
    },
  };
}
