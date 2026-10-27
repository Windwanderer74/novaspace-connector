// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { readBody } from './nextcloud-read';

/** Bounded native app requests. Never forward credentials to redirects. */
export async function planningJson(path: string, method = 'GET', body?: unknown, headers: Record<string,string> = {}, allowMissing = false, acceptedStatuses: readonly number[] = []) {
  const c = getDeckRuntimeConfig();
  const base = c?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = c?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = c?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nextcloud-Zugang fehlt.');
  const url = new URL(base);
  const appPath = /^\/index\.php\/apps\/(deck|notes)\/api\//.test(path)
    || (method === 'GET' && /^\/index\.php\/apps\/novaspace_capsules\/api\/(?:project-creation|project-folders(?:\?path=[^#]*)?|creations\/[a-f0-9]{32})$/.test(path))
    || (method === 'POST' && path === '/index.php/apps/novaspace_capsules/api/projects')
    || (method === 'PUT' && /^\/index\.php\/apps\/deck\/cards\/[1-9][0-9]*$/.test(path))
    || (method==='GET' && /^\/index\.php\/apps\/deck\/[1-9][0-9]*\/(?:cards|stacks)\/deleted$/.test(path))
    || /^\/ocs\/v2\.php\/apps\/deck\/api\/v1\.0\/cards\/[1-9][0-9]*\/comments(?:\/[1-9][0-9]*)?(?:\?[^#]*)?$/.test(path);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !appPath || path.includes('..')) throw new Error('Ungültiger App-Pfad.');
  const auth = btoa(Array.from(new TextEncoder().encode(`${login}:${password}`), b => String.fromCharCode(b)).join(''));
  let response: Response;
  try {
    response = await fetch(`${url.origin}${url.pathname.replace(/\/$/,'')}${path}`, {
      method, redirect:'manual', signal:AbortSignal.timeout(20000),
      headers:{Accept:'application/json',...(body instanceof FormData ? {} : {'Content-Type':'application/json'}),'OCS-APIRequest':'true',...headers,Authorization:`Basic ${auth}`},
      body:body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch { throw new Error(method === 'GET' ? 'App nicht erreichbar.' : 'Schreibergebnis unbekannt. Vor einer Wiederholung neu lesen.'); }
  const missing = allowMissing && method === 'GET' && response.status === 404;
  if (!response.ok && !missing && !acceptedStatuses.includes(response.status)) {
    await response.body?.cancel();
    throw new Error(response.status === 412 ? 'Versionskonflikt: neu lesen und Änderung erneut abstimmen.' : `App antwortete mit HTTP ${response.status}${method === 'GET' ? '.' : '; Ergebnis vor Wiederholung prüfen.'}`);
  }
  // Deck embeds complete card descriptions in board/stack collections. Keep
  // individual objects and write responses at 2 MiB, but allow bounded existing
  // project collections to exceed that limit without disabling stream limits.
  const deckCollection = method === 'GET' && /^\/index\.php\/apps\/deck\/api\/v1\.[01]\/boards\/[1-9][0-9]*(?:\/stacks(?:\/archived)?)?$/.test(path);
  const maxBytes = (deckCollection ? 8 : 2) * 1024 * 1024;
  let text: string;
  try { text = await readBody(response,maxBytes); }
  catch (error) {
    if (method !== 'GET') throw new Error('Schreibergebnis unbekannt: Antwort unlesbar. Vor Wiederholung neu lesen.');
    const tooLarge = error instanceof Error && error.message.startsWith('Antwort ist zu groß.');
    throw new Error(tooLarge ? `App-Antwort überschreitet die Grenze von ${maxBytes / 1024 / 1024} MiB (${path.split('?')[0]}).` : `App-Antwort ist nicht lesbar (${path.split('?')[0]}).`);
  }
  try { return {data:JSON.parse(text),headers:response.headers,status:response.status}; }
  catch { throw new Error(method === 'GET' ? `App-Antwort ist kein gültiges JSON (${path.split('?')[0]}).` : 'Schreibergebnis unbekannt: Antwort unlesbar. Vor Wiederholung neu lesen.'); }
}

export async function planningVersion(data: unknown) {
  function stable(x: any): any {
    if (Array.isArray(x)) return x.map(stable);
    return x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])) : x;
  }
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(data))));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
