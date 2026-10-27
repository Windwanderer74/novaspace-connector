// SPDX-License-Identifier: AGPL-3.0-or-later
import { mindmapPath } from '../lib/mindmap-core';
import type { CardRef, Client } from './deck-mindmap-client';
export function createNextcloudBrowserClient(uid: string, requesttoken: string) {
  const originalFetch = window.fetch.bind(window);
  const api = '/index.php/apps/deck/api/v1.0';
  const headers = { requesttoken, 'OCS-APIRequest': 'true' };
  const cardPath = (r: CardRef) => `${api}/boards/${r.boardId}/stacks/${r.stackId}/cards/${r.cardId}`;
  const request = async (url: string, init: RequestInit = {}) => {
    const target = new URL(url, location.origin);
    if (target.origin !== location.origin) throw new Error('Nur diese NovaSpace-Instanz ist vorgesehen.');
    const response = await originalFetch(target.href, { ...init, credentials: 'same-origin', redirect: 'error', headers: { ...headers, ...init.headers } });
    if (!response.ok) throw new Error(`Abgleich antwortet mit HTTP ${response.status}.`);
    return response;
  };
  const dav = (path: string) => { mindmapPath(path); return `/remote.php/dav/files/${encodeURIComponent(uid)}${path.split('/').map(encodeURIComponent).join('/')}`; };
  const metadata = async (path: string) => {
    const response = await request(dav(path), { method: 'PROPFIND', headers: { Depth: '0', 'Content-Type': 'application/xml' }, body: '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:getetag/><oc:fileid/><oc:permissions/><nc:hide-download/></d:prop></d:propfind>' });
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    const props = [...xml.getElementsByTagNameNS('DAV:', 'propstat')].filter(s => / 200 /.test(s.getElementsByTagNameNS('DAV:', 'status')[0]?.textContent ?? ''));
    const read = (ns: string, key: string) => props.map(p => p.getElementsByTagNameNS(ns, key)[0]?.textContent).find(Boolean) ?? '';
    const etag = read('DAV:', 'getetag'), fileId = read('http://owncloud.org/ns', 'fileid');
    if (!/^"[^"\r\n]+"$/.test(etag) || !/^\d+$/.test(fileId) || !read('http://owncloud.org/ns', 'permissions').includes('W') || read('http://nextcloud.org/ns', 'hide-download') === 'true') throw new Error('Mindmap-Version oder Schreibrecht fehlt.');
    return { etag, fileId };
  };
  const client: Client = {
    locateCard: async (boardId,cardId) => {
      const stacks=await (await request(`${api}/boards/${boardId}/stacks`)).json();
      const matches=stacks.filter((s:any)=>!s.deletedAt && s.cards?.some((c:any)=>c.id===cardId && !c.deletedAt));
      if(matches.length!==1) throw Error('Deckkarte ist in diesem Board nicht eindeutig vorhanden.');
      return {boardId,stackId:matches[0].id,cardId};
    },
    card: async r => (await request(cardPath(r))).json(),
    saveCard: async (r, current, title, description) => {
      const owner = typeof current.owner === 'string' ? current.owner : (current.owner as { uid?: string; primaryKey?: string } | undefined)?.uid ?? (current.owner as { primaryKey?: string } | undefined)?.primaryKey ?? '';
      await request(cardPath(r), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, type: current.type ?? 'plain', owner, order: current.order ?? 999, duedate: current.duedate ?? null, startdate: current.startdate ?? null, color: current.color ?? null, archived: current.archived ?? false, done: current.done ?? null }) });
      const saved = await client.card(r);
      if (saved.title !== title || saved.description !== description) throw new Error('Kartenrücklesung nicht bestätigt.');
      return saved;
    },
    map: async path => {
      const before = await metadata(path);
      const text = await (await request(dav(path), { headers: { 'If-Match': before.etag } })).text();
      const after = await metadata(path);
      if (after.etag !== before.etag || after.fileId !== before.fileId) throw new Error('Mindmap wurde während des Lesens geändert.');
      return { ...before, text };
    },
    saveMap: async (path, etag, fileId, text) => {
      const before = await metadata(path);
      if (before.etag !== etag || before.fileId !== fileId) throw new Error('Mindmap inzwischen geändert; gespeicherte Deck-Haken bleiben erhalten.');
      await request(dav(path), { method: 'PUT', headers: { 'If-Match': etag, 'Content-Type': 'application/json; charset=utf-8' }, body: text });
      const readback = await client.map(path);
      if (readback.fileId !== fileId || readback.text !== text) throw new Error('Mindmap-Rücklesung noch nicht bestätigt.');
    },
  };
  return { client, request, originalFetch, api };
}
