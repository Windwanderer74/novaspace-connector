// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentGatewayPrincipal, createGatewayAssertion, readRegistryState } from './platform-registry';
import { getDeckRuntimeConfig } from './runtime-config';
import { readBody } from './nextcloud-read';

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const note = 'Eigener Inventory-Bestand des bestätigten Kontos. KI-Änderungen und Freigaben werden atomar protokolliert. Normale Inventory-UI-Änderungen sind noch nicht im Journal. Keine Anhänge, Exemplare, Standorte, Löschung oder Weiterfreigabe über diese Schnittstelle.';
export async function delegatedCommand(command: Obj): Promise<Obj> {
  const principal = currentGatewayPrincipal();
  const write = ['create', 'update'].includes(String(command.operation));
  if (!principal.scopes.includes('inventory:read') || (write && !principal.scopes.includes('inventory:write'))) throw new Error('Inventory-Anwendungsrechte fehlen.');
  const state = await readRegistryState(principal);
  if (!state.active || !state.connection) throw new Error('Persönliche Verbindung ist nicht aktiv bestätigt.');
  const owner = state.connection.ownerUid;
  if (write && command.expectedAccount !== owner) throw new Error('Inventory-Kontokonflikt. Kein Schreibaufruf ausgeführt.');
  const config = getDeckRuntimeConfig();
  const base = config?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = config?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = config?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nativer Zugang fehlt.');
  const u = new URL(base);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('Ungültige native Adresse.');
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical({ command })));
  if (bytes.length > 100000) throw new Error('Inventory-Befehl ist zu groß.');
  const bodyHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  const assertion = await createGatewayAssertion(principal, 'inventory', bodyHash);
  const basic = btoa(Array.from(new TextEncoder().encode(login + ':' + password), x => String.fromCharCode(x)).join(''));
  // One fixed command endpoint, no redirects or automatic retries. The signature covers the canonical command interpreted by the native controller.
  const response = await fetch(u.origin + u.pathname.replace(/\/$/, '') + '/ocs/v2.php/apps/novaspace_platform/api/v1/registry/inventory?format=json', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000), body: bytes,
    headers: { Authorization: 'Basic ' + basic, 'OCS-APIRequest': 'true', Accept: 'application/json', 'Content-Type': 'application/json', 'X-NovaSpace-Client': assertion },
  });
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) { await response.body?.cancel(); throw new Error('Inventory-Antwort unbestätigt.'); }
  const raw: unknown = JSON.parse(await readBody(response, 2 * 1024 * 1024));
  if (!object(raw) || !object(raw.ocs) || !object(raw.ocs.data)) throw new Error('Ungültige Inventory-Antwort.');
  const d = raw.ocs.data;
  if (response.status !== 200) {
    const known = ['inventory_scope_required', 'inventory_grant_required', 'connection_unavailable', 'owner_conflict', 'version_conflict', 'request_conflict', 'reference_exists', 'item_not_found', 'inventory_source_changed', 'inventory_owner_unavailable'];
    if (typeof d.error === 'string' && known.includes(d.error)) return { account: owner, outcome: d.error, committed: false, requestId: command.requestId ?? null, note };
    throw new Error('Inventory-Ergebnis unbestätigt.');
  }
  if (!object(raw.ocs.meta) || raw.ocs.meta.status !== 'ok' || ![100, 200].includes(Number(raw.ocs.meta.statuscode))
    || d.account !== owner || d.connectionId !== state.connection.connectionId || d.actorUid !== state.connection.nativeUid
    || !object(d.grant) || !['none', 'read', 'write'].includes(String(d.grant.mode))) throw new Error('Inventory-Kontobindung unbestätigt.');
  const item = (v: unknown) => {
    if (!object(v) || v.uid !== owner || !Number.isSafeInteger(v.id) || (v.id as number) < 1 || typeof v.name !== 'string' || typeof v.path !== 'string'
      || typeof v.version !== 'string' || !/^[0-9a-f]{64}$/.test(v.version)) throw new Error('Ungültiger oder fremder Inventory-Eintrag.');
  };
  if (command.operation === 'list') { if (!Array.isArray(d.items) || d.items.length > 5000) throw new Error('Ungültige Geräteliste.'); d.items.forEach(item); }
  if (['get', 'create', 'update'].includes(String(command.operation))) { item(d.item); if (command.itemId !== undefined && (d.item as Obj).id !== command.itemId) throw new Error('Falsche Geräte-ID.'); }
  if (write && (d.committed !== true || d.requestId !== command.requestId || typeof d.actionId !== 'string' || !/^[0-9a-f-]{36}$/.test(d.actionId)
    || d.outcome !== (command.operation === 'create' ? 'created' : 'updated'))) throw new Error('Inventory-Schreibnachweis unbestätigt.');
  if (command.operation === 'history' && (!Array.isArray(d.actions) || d.actions.length > 5 || d.actions.some(a => !object(a) || a.ownerUid !== owner))) throw new Error('Ungültiger Aktionsverlauf.');
  return { ...d, note };
}

export async function delegatedWrite(command: Obj) {
  const requestId = command.requestId ?? crypto.randomUUID();
  try { return await delegatedCommand({ ...command, requestId }); }
  catch { return { outcome: 'unknown', committed: false, requestId, reference: object(command.data) ? command.data.reference : null,
    note: 'Ergebnis unbestätigt. Keine automatische Wiederholung. Dieselbe Anfrage mit unverändertem Inhalt und derselben requestId kann gezielt geprüft werden; niemals eine neue requestId zum Wiederholen erzeugen.' }; }
}
