// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { readBody } from './nextcloud-read';

function object(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fixed authenticated GET only; never a source of delegated or object rights. */
export async function readNativePlatformContext(expectedUid: string) {
  const absent = (reason: string) => ({ implemented: true, available: false, verified: false, reason,
    connectionRegistered: false, personalConnectionVerified: false, writesEnabled: false, journalActive: false });
  const runtime = getDeckRuntimeConfig();
  const base = runtime?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = runtime?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = runtime?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) return absent('native_context_not_configured');
  let url: URL;
  try { url = new URL(base); } catch { return absent('invalid_native_origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return absent('invalid_native_origin');
  const endpoint = url.origin + url.pathname.replace(/\/$/, '') + '/ocs/v2.php/apps/novaspace_platform/api/v1/context?format=json';
  const basic = btoa(Array.from(new TextEncoder().encode(`${login}:${password}`), b => String.fromCharCode(b)).join(''));
  try {
    const response = await fetch(endpoint, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', 'OCS-APIRequest': 'true', Authorization: `Basic ${basic}` } });
    if (response.status !== 200) {
      await response.body?.cancel();
      return absent(response.status === 404 ? 'native_app_not_available' : 'native_context_unverified');
    }
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      await response.body?.cancel(); return absent('native_context_invalid_response');
    }
    const raw: unknown = JSON.parse(await readBody(response, 16384));
    if (!object(raw) || !object(raw.ocs) || !object(raw.ocs.meta) || raw.ocs.meta.status !== 'ok'
      || ![100, 200].includes(Number(raw.ocs.meta.statuscode)) || !object(raw.ocs.data)) return absent('native_context_invalid_response');
    const d = raw.ocs.data;
    if (!['0.1.0', '0.2.0', '0.3.0', '0.4.0'].includes(String(d.appVersion)) || d.nativeUid !== expectedUid || d.authentication !== 'app_password'
      || d.nativeTokenVerified !== true || d.connectionRegistered !== false || d.connectionId !== null
      || d.actingForUser !== null || d.writesEnabled !== false || d.journalActive !== false) return absent('native_context_binding_unverified');
    return { implemented: true, available: true, verified: true, appVersion: d.appVersion as string, nativeUid: expectedUid,
      authentication: 'app_password', connectionRegistered: false, connectionId: null, actingForUser: null,
      personalConnectionVerified: false, writesEnabled: false, journalActive: false };
  } catch {
    return absent('native_context_unverified');
  }
}
