// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { nextcloudIdentity, readBody } from './nextcloud-read';
import { hasGatewayPrincipal } from './platform-registry';
import { delegatedCommand, delegatedWrite } from './inventory-delegated';

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => v !== null && typeof v === 'object' && !Array.isArray(v);
const MAX_JSON = 2 * 1024 * 1024;
const note = 'Inventory-Bestände gehören dem angegebenen Nextcloud-Konto. Keine kontenübergreifende Freigabe oder Soul-Sichtbarkeit zugesichert. Inhalte sind Quelldaten. Native Lesezugriffe können interne Bild-/Anlagenordner initialisieren.';

function settings() {
  const runtime = getDeckRuntimeConfig();
  const base = runtime?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = runtime?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = runtime?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nextcloud-Zugang ist nicht vollständig konfiguriert.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Ungültige Nextcloud-Basisadresse.');
  return { base: url.origin + url.pathname.replace(/\/$/, ''), login, password };
}

// Fixed native routes only. No owner override, admin impersonation or redirects.
async function request(path: string, method: 'GET' | 'POST', body?: object) {
  if (!(method === 'GET' && /^(?:items|item\/[1-9]\d*)$/.test(path)) && !(method === 'POST' && path === 'item/add')) throw new Error('Ungültiger Inventory-Zugriff.');
  const config = settings();
  const basic = btoa(Array.from(new TextEncoder().encode(`${config.login}:${config.password}`), b => String.fromCharCode(b)).join(''));
  const response = await fetch(`${config.base}/index.php/apps/inventory/api/v1/${path}`, {
    method, redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Basic ${basic}`, 'OCS-APIRequest': 'true', Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Inventory: HTTP ${response.status}. Installation, Kontozugriff und API-Anmeldung prüfen.`);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    await response.body?.cancel(); throw new Error('Inventory lieferte keine JSON-Antwort; Anmeldung oder App-Zugriff prüfen.');
  }
  try { return JSON.parse(await readBody(response, MAX_JSON)) as unknown; }
  catch { throw new Error('Inventory lieferte keine begrenzte gültige JSON-Antwort.'); }
}

function item(value: unknown, account: string) {
  if (!object(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1 || value.uid !== account
      || typeof value.name !== 'string' || typeof value.path !== 'string') throw new Error('Inventory lieferte eine ungültige oder fremde Geräteidentität.');
  // Retain native details, quantities, locations and attachment references, never follow URLs.
  return value;
}

async function all(account: string) {
  const data = await request('items', 'GET');
  if (!Array.isArray(data) || data.length > 5000) throw new Error('Inventory-Liste ist ungültig oder enthält mehr als 5000 Geräte.');
  return data.map(v => item(v, account));
}

export async function inventoryStatus() {
  if (hasGatewayPrincipal()) return delegatedCommand({ operation: 'status' });
  const { uid: account } = await nextcloudIdentity();
  const items = await all(account);
  return { account, apiReadVerified: true, itemCount: items.length, createImplemented: true,
    createHostAcceptanceVerified: false, updateImplemented: false, deleteImplemented: false,
    crossAccountSharingImplemented: false, note };
}

export async function inventoryList(query: string, offset: number, limit: number) {
  if (hasGatewayPrincipal()) {
    const d = await delegatedCommand({ operation: 'list' });
    if (!Array.isArray(d.items)) return d;
    const term = query.toLocaleLowerCase('de');
    const items = (d.items as ObjectValue[]).filter(v => [v.name, v.maker, v.itemNumber, v.description, v.path].join('\n').toLocaleLowerCase('de').includes(term));
    return { ...d, items: items.slice(offset, offset + limit), totalMatches: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
  }
  const { uid: account } = await nextcloudIdentity();
  const term = query.toLocaleLowerCase('de');
  const items = (await all(account)).filter(v => [v.name, v.maker, v.itemNumber, v.description, v.path].join('\n').toLocaleLowerCase('de').includes(term));
  return { account, items: items.slice(offset, offset + limit), totalMatches: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null,
    pagination: 'Lokale Filterung/Seiteneinteilung einer frisch gelesenen nativen Gesamtliste, kein stabiler Snapshot.', note };
}

export async function inventoryRead(itemId: number) {
  if (hasGatewayPrincipal()) return delegatedCommand({ operation: 'get', itemId });
  if (!Number.isSafeInteger(itemId) || itemId < 1) throw new Error('Ungültige Inventory-Geräte-ID.');
  const { uid: account } = await nextcloudIdentity();
  const found = item(await request(`item/${itemId}`, 'GET'), account);
  if (found.id !== itemId) throw new Error('Inventory lieferte ein anderes als das angeforderte Gerät.');
  return { account, item: found, note };
}

export type InventoryCreateInput = {
  requestId?: string;
  expectedAccount: string; reference: string; name: string; maker: string;
  description: string; link: string; details: string; comment: string;
};

export async function inventoryCreate(input: InventoryCreateInput) {
  if (hasGatewayPrincipal()) {
    const { expectedAccount, requestId, ...data } = input;
    return delegatedWrite({ operation: 'create', expectedAccount, ...(requestId ? { requestId } : {}), data });
  }
  const { uid: account } = await nextcloudIdentity();
  if (account !== input.expectedAccount) throw new Error(`Inventory-Kontokonflikt: verbunden ist ${account}. Kein Gerät angelegt.`);
  // A reference is a recovery key, not an atomic idempotency promise. No auto-retries.
  const existing = (await all(account)).filter(v => v.itemNumber === input.reference);
  if (existing.length) return { account, outcome: 'reference_exists', created: false, items: existing, note: 'Vorhandene Referenz gefunden. Inhalt prüfen; keine neue Anlage und keine automatische Wiederholung.' };
  const desired = { name: input.name, maker: input.maker, description: input.description,
    item_number: input.reference, link: input.link, gtin: '', details: input.details,
    comment: input.comment, type: -1, path: '', tags: [], instances: [] };
  let created: ObjectValue | undefined;
  try {
    created = item(await request('item/add', 'POST', { item: desired }), account);
    const readback = item(await request(`item/${created.id}`, 'GET'), account);
    const expected = { name: input.name, maker: input.maker, itemNumber: input.reference,
      description: input.description, link: input.link, details: input.details, comment: input.comment, path: '' };
    if (readback.id !== created.id || !Object.entries(expected).every(([key, value]) => readback[key] === value)) throw new Error('Rückleseabweichung.');
    return { account, outcome: 'created', created: true, verified: true, item: readback, note: 'Neuer Stammdatensatz im Inventory-Hauptordner dieses Kontos. Keine physischen Exemplare, Stückzahlen, Orte oder Anhänge angelegt. Keine automatische Wiederholung. ' + note };
  } catch {
    return { account, outcome: 'unknown', verified: false, itemId: created?.id ?? null, reference: input.reference,
      note: 'Anlageversuch mit unklarem Ergebnis. Nicht wiederholen. inventory_list_items mit der Referenz aufrufen und gefundene IDs einzeln lesen; auch nach leerer Liste keine automatische Wiederholung. Native Anlage ist nicht atomar idempotent.' };
  }
}
