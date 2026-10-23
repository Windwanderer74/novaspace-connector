// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { readBody } from './nextcloud-read';

/** Bounded native app requests. Never forward credentials to redirects. */
export async function planningJson(path: string, method = 'GET', body?: unknown, headers: Record<string,string> = {}, allowMissing = false) {
  const c = getDeckRuntimeConfig();
  const base = c?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = c?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = c?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nextcloud-Zugang fehlt.');
  const url = new URL(base);
  const appPath = /^\/index\.php\/apps\/(deck|notes)\/api\//.test(path)
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
  if (!response.ok && !missing) {
    await response.body?.cancel();
    throw new Error(response.status === 412 ? 'Versionskonflikt: neu lesen und Änderung erneut abstimmen.' : `App antwortete mit HTTP ${response.status}${method === 'GET' ? '.' : '; Ergebnis vor Wiederholung prüfen.'}`);
  }
  try { return {data:JSON.parse(await readBody(response,2*1024*1024)),headers:response.headers,status:response.status}; }
  catch { throw new Error(method === 'GET' ? 'Ungültige oder zu große App-Antwort.' : 'Schreibergebnis unbekannt: Antwort unlesbar. Vor Wiederholung neu lesen.'); }
}

export async function planningVersion(data: unknown) {
  function stable(x: any): any {
    if (Array.isArray(x)) return x.map(stable);
    return x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])) : x;
  }
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(data))));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
