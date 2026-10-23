// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { currentGatewayPrincipal, hasGatewayPrincipal, createGatewayAssertion, readRegistryState } from './platform-registry';
import { nextcloudIdentity, readBody } from './nextcloud-read';

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export const canonicalGithubCommand = (v: unknown): unknown => Array.isArray(v) ? v.map(canonicalGithubCommand) : object(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonicalGithubCommand(v[k])])) : v;

/** Fixed native endpoint. GitHub credentials never leave Nextcloud. No retries. */
export async function githubBridge(command: Obj): Promise<Obj> {
  const runtime = getDeckRuntimeConfig();
  const base = runtime?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = runtime?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = runtime?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nativer Nextcloud-Zugang fehlt.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Ungültige Nextcloud-Adresse.');
  const write = ['presentation_write', 'sync_run'].includes(String(command.operation));
  let account: string;
  let connectionId: string | null = null;
  let assertion: string | undefined;
  const body = JSON.stringify(canonicalGithubCommand({ command }));
  if (new TextEncoder().encode(body).length > 100000) throw new Error('GitHub-Auftrag zu groß.');
  if (hasGatewayPrincipal()) {
    const principal = currentGatewayPrincipal();
    if (!principal.scopes.includes('github:read') || (write && !principal.scopes.includes('github:write'))) throw new Error('GitHub-Rechte fehlen.');
    const state = await readRegistryState(principal);
    if (!state.active || !state.connection) throw new Error('Persönliche Verbindung ist nicht aktiv bestätigt.');
    account = state.connection.ownerUid;
    connectionId = state.connection.connectionId;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    assertion = await createGatewayAssertion(principal, 'github', hash);
  } else {
    const native = await nextcloudIdentity();
    if (typeof native.uid !== 'string') throw new Error('Nativer Kontonachweis fehlt.');
    account = native.uid;
  }
  if (write && command.expectedAccount !== account) throw new Error('Kontokonflikt. Kein Schreibaufruf ausgeführt.');
  const headers: Record<string, string> = { Authorization: 'Basic ' + btoa(Array.from(new TextEncoder().encode(login + ':' + password), c => String.fromCharCode(c)).join('')),
    Accept: 'application/json', 'Content-Type': 'application/json', 'OCS-APIRequest': 'true' };
  if (assertion) headers['X-NovaSpace-Client'] = assertion;
  let response: Response;
  try {
    response = await fetch(url.origin + url.pathname.replace(/\/$/, '') + '/ocs/v2.php/apps/novaspace_platform/api/v1/registry/github?format=json',
      { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(45000), headers, body });
  } catch {
    return { account, outcome: 'unknown', committed: false, mayHaveCommitted: write, repository: command.repository ?? null,
      note: 'Ergebnis unbestätigt. Nicht automatisch wiederholen. Projektbeschreibung beziehungsweise Sync-Status frisch lesen.' };
  }
  if (response.status === 404) { await response.body?.cancel(); return { account, outcome: 'bridge_not_installed', committed: false, mayHaveCommitted: false }; }
  try {
  if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('GitHub-Brückenantwort unbestätigt.'); }
  const raw: unknown = JSON.parse(await readBody(response, 400000));
  if (!object(raw) || !object(raw.ocs) || !object(raw.ocs.data)) throw new Error('Ungültige GitHub-Brückenantwort.');
  const d = raw.ocs.data;
  if (response.status !== 200) return { account, outcome: 'native_access_or_operation_unconfirmed', committed: false, mayHaveCommitted: write,
    note: 'Native Prüfung nicht bestätigt. Keine automatische Wiederholung und keine Zugangsdaten anfordern.' };
  if (!object(raw.ocs.meta) || raw.ocs.meta.status !== 'ok' || ![100, 200].includes(Number(raw.ocs.meta.statuscode))
    || d.account !== account || d.connectionId !== connectionId || typeof d.outcome !== 'string') throw new Error('GitHub-Kontobindung unbestätigt.');
  return d;
  } catch {
    return { account, outcome: 'unknown', committed: false, mayHaveCommitted: write, repository: command.repository ?? null, note: 'Antwort oder Kontobindung unbestätigt. Nicht automatisch wiederholen; denselben Zielstand frisch lesen.' };
  }
}
