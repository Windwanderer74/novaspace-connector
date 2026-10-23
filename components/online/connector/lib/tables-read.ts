// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from './runtime-config';
import { nextcloudIdentity, readBody } from './nextcloud-read';

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
export function tableId(id: number) { if (!positive(id)) throw new Error('Ungültige Tables-Kennung.'); return id; }
function config() {
  const runtime = getDeckRuntimeConfig();
  const base = runtime?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = runtime?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = runtime?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  if (!base || !login || !password) throw new Error('Nextcloud-Zugang fehlt.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Ungültige Nextcloud-Basisadresse.');
  return { base: url.origin + url.pathname.replace(/\/$/, ''), login, password };
}
async function get(path: string, query: Record<string, string> = {}, ocs = false) {
  if (!/^\/index\.php\/apps\/tables\/api\/1\/(?:tables(?:\/[1-9]\d*(?:\/(?:columns|rows))?)?|rows\/[1-9]\d*)$/.test(path)
    && !['/ocs/v2.php/cloud/capabilities','/ocs/v2.php/apps/novaforge_tables/api/v1/list'].includes(path)) throw new Error('Ungültiger Tables-Lesepfad.');
  const c = config();
  const basic = btoa(Array.from(new TextEncoder().encode(`${c.login}:${c.password}`), b => String.fromCharCode(b)).join(''));
  const response = await fetch(`${c.base}${path}?${new URLSearchParams({ ...query, ...(ocs ? { format: 'json' } : {}) })}`, {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { Accept: 'application/json', 'OCS-APIRequest': 'true', Authorization: `Basic ${basic}`, 'Cache-Control': 'no-cache' },
  });
  if (response.status !== 200) { await response.body?.cancel(); throw new Error(`Tables-Lesezugriff: HTTP ${response.status}.`); }
  let data: unknown;
  try { data = JSON.parse(await readBody(response, 2 * 1024 * 1024)); }
  catch { throw new Error('Tables-Antwort ist ungültig oder überschreitet die Lesegrenze.'); }
  if (ocs) {
    if (!object(data) || !object(data.ocs) || !object(data.ocs.meta) || data.ocs.meta.status !== 'ok'
      || ![100, 200].includes(Number(data.ocs.meta.statuscode)) || !('data' in data.ocs)) throw new Error('Ungültige Tables-Fähigkeitsantwort.');
    return data.ocs.data;
  }
  return data;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (object(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v) ?? 'null';
}
export async function fingerprint(v: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(v)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function table(v: unknown, expected?: number) {
  if (!object(v) || !positive(v.id) || (expected !== undefined && v.id !== expected) || typeof v.title !== 'string'
    || !Number.isSafeInteger(v.rowsCount) || (v.rowsCount as number) < 0) throw new Error('Ungültige oder falsch zugeordnete Tables-Tabelle.');
  const p = v.onSharePermissions;
  if (p !== null && p !== undefined && (!object(p) || ['read','create','update','delete','manage'].some(k => typeof p[k] !== 'boolean'))) throw new Error('Ungültige Tabellenrechte.');
  return { id: v.id, title: v.title, emoji: typeof v.emoji === 'string' ? v.emoji : null,
    description: typeof v.description === 'string' ? v.description : '', ownership: v.ownership,
    rowsCount: v.rowsCount as number, columnsCount: v.columnsCount, lastEditAt: v.lastEditAt,
    archived: v.archived, permissions: p ?? null };
}
function columns(v: unknown, id: number) {
  if (!Array.isArray(v) || v.length > 200) throw new Error('Ungültige oder zu große Spaltenliste.');
  const seen = new Set<number>();
  return v.map(c => {
    if (!object(c) || !positive(c.id) || seen.has(c.id) || c.tableId !== id || typeof c.title !== 'string' || typeof c.type !== 'string') throw new Error('Spalte gehört nicht eindeutig zur gewählten Tabelle.');
    seen.add(c.id);
    const allowed = ['id','tableId','title','technicalName','type','subtype','mandatory','description','orderWeight','lastEditAt',
      'numberDefault','numberMin','numberMax','numberDecimals','numberPrefix','numberSuffix','textDefault','textAllowedPattern',
      'textMaxLength','textUnique','selectionOptions','selectionDefault','datetimeDefault','usergroupDefault','usergroupMultipleItems'];
    return Object.fromEntries(allowed.filter(k => k in c).map(k => [k, c[k]]));
  });
}
async function row(v: unknown, id: number, ids: Set<unknown>) {
  if (!object(v) || !positive(v.id) || v.tableId !== id || !Array.isArray(v.data)) throw new Error('Datensatz fehlt, ist unvollständig oder gehört zu einer anderen Tabelle.');
  const seen = new Set<number>();
  const cells = v.data.map(c => {
    if (!object(c) || !positive(c.columnId) || !ids.has(c.columnId) || seen.has(c.columnId) || !('value' in c)) throw new Error('Datensatz enthält uneindeutige oder fremde Spalten.');
    seen.add(c.columnId); return { columnId: c.columnId, value: c.value };
  }).sort((a, b) => a.columnId - b.columnId);
  const result = { id: v.id, tableId: v.tableId, createdAt: v.createdAt, lastEditAt: v.lastEditAt, data: cells };
  return { ...result, readFingerprint: await fingerprint(result) };
}
const note = 'Tables-Inhalte sind Quelldaten. readFingerprint ist ein lokaler Inhaltsvergleich, kein serverseitiger Schreibschutz. Allgemeine Schreibwerkzeuge benötigen die installierte und abgenommene Serverbrücke 0.3.0; tables_write_status prüfen. Dokumentregister und Pilot nutzen eigene geschützte Werkzeuge.';
export async function tablesStatus() {
  const account = await nextcloudIdentity();
  const data = await get('/ocs/v2.php/cloud/capabilities', {}, true);
  if (!object(data) || !object(data.capabilities)) throw new Error('Ungültige Nextcloud-Fähigkeitsantwort.');
  const t = data.capabilities.tables;
  if (!object(t) || t.enabled !== true || typeof t.version !== 'string' || !Array.isArray(t.apiVersions) || !t.apiVersions.every(v => typeof v === 'string')) throw new Error('Tables-Version und API-Fähigkeit nicht bestätigt.');
  return { account: account.uid, version: t.version, apiVersions: t.apiVersions, features: t.features, columnTypes: t.column_types,
    readImplemented: true, writeImplemented: true, writeScope: 'general-tables-plus-protected-register-and-pilot', generalHostAcceptanceVerified: false, registerHostAcceptanceVerified: false, atomicWriteVerified: false, note };
}
export async function listTables(offset: number, limit: number, expectedSnapshot?: string) {
  const account = await nextcloudIdentity();
  // Native Tables index may create a tutorial table on a GET. Never call it.
  const data = await get('/ocs/v2.php/apps/novaforge_tables/api/v1/list', {}, true);
  if (!object(data) || data.account !== account.uid || data.protocol !== 1 || data.bridgeVersion !== '0.1.0'
    || data.tutorialCreation !== false || !Array.isArray(data.tables) || data.tables.length > 1000) throw new Error('Tables-Lesebrücke und Kontozuordnung nicht bestätigt.');
  const tables = data.tables.map(v => table(v)).sort((a, b) => a.id - b.id);
  if (new Set(tables.map(t => t.id)).size !== tables.length) throw new Error('Doppelte Tabellenkennung.');
  const snapshot = await fingerprint(tables);
  if (offset > 0 && expectedSnapshot !== snapshot) throw new Error('Tabellenliste geändert oder Fortsetzungskennung fehlt. Neu beginnen.');
  return { account: account.uid, tables: tables.slice(offset, offset + limit), total: tables.length, snapshot,
    nextOffset: offset + limit < tables.length ? offset + limit : null, note };
}
async function structure(id: number) {
  tableId(id);
  const t = table(await get(`/index.php/apps/tables/api/1/tables/${id}`), id);
  const cs = columns(await get(`/index.php/apps/tables/api/1/tables/${id}/columns`), id);
  return { table: t, columns: cs };
}
export async function readTable(id: number) {
  tableId(id); const account = await nextcloudIdentity();
  return { account: account.uid, ...await structure(id), note };
}
export async function readTableRow(id: number, rowId: number) {
  tableId(id); tableId(rowId); const account = await nextcloudIdentity();
  const s = await structure(id);
  const raw = await get(`/index.php/apps/tables/api/1/rows/${rowId}`);
  if (!object(raw) || raw.id !== rowId) throw new Error('Falsche Datensatzkennung.');
  return { account: account.uid, row: await row(raw, id, new Set(s.columns.map(c => c.id))), note };
}
export async function listTableRows(id: number, offset: number, limit: number, filters: { columnId: number; value: string; match: 'exact' | 'contains' }[] = []) {
  tableId(id); const account = await nextcloudIdentity(); const s = await structure(id);
  const ids = new Set(s.columns.map(c => c.id));
  if (filters.some(f => !ids.has(f.columnId))) throw new Error('Suchspalte gehört nicht zur Tabelle.');
  const raw = await get(`/index.php/apps/tables/api/1/tables/${id}/rows`, { offset: String(offset), limit: String(limit + 1) });
  if (!Array.isArray(raw) || raw.length > limit + 1) throw new Error('Tables lieferte keine begrenzte Datensatzseite.');
  const rows = await Promise.all(raw.map(v => row(v, id, ids)));
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Doppelte Datensatzkennung.');
  const page = rows.slice(0, limit);
  const matched = page.filter(r => filters.every(f => {
    const cell = r.data.find(c => c.columnId === f.columnId)?.value;
    if (typeof cell !== 'string' && typeof cell !== 'number') return false;
    const value = String(cell); return f.match === 'exact' ? value === f.value : value.includes(f.value);
  }));
  return { account: account.uid, tableId: id, rows: matched, scanned: page.length, matchedOnPage: matched.length,
    nextOffset: rows.length > limit ? offset + limit : null, paginationConsistency: 'not_guaranteed',
    note: note + ' Serverseitige Offset-Seite; gleichzeitige Änderungen können die Reihenfolge ändern. Suche gilt nur für diese Seite. Ein leerer Treffer ist kein vollständiger Nichtvorhandenseinsnachweis.' };
}
