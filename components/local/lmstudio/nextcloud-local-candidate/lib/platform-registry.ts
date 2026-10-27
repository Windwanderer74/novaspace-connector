// SPDX-License-Identifier: AGPL-3.0-or-later
import { AsyncLocalStorage } from 'node:async_hooks';
import { ALL_SCOPES, allowedUserEmail, oauthOrigin, verifyAccessToken, verifyClientId } from './oauth';
import { getDeckRuntimeConfig } from './runtime-config';
import { readBody } from './nextcloud-read';
import { parseConnectionPolicy, permissionDenial, appForScope, ConnectionPolicyDenied, type ConnectionPolicy } from './connection-policy';

export type GatewayPrincipal = Readonly<{ subjectHash: string; clientHash: string; scopes: readonly string[] }>;
const context = new AsyncLocalStorage<GatewayPrincipal>();
export const withGatewayPrincipal = <T>(p: GatewayPrincipal, fn: () => T): T => context.run(p, fn);
export const hasGatewayPrincipal = (): boolean => context.getStore() !== undefined;
export function currentGatewayPrincipal(): GatewayPrincipal {
  const p = context.getStore(); if (!p) throw new Error('Verbindungsidentität fehlt.'); return p;
}
const encoder = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const hash = async (s: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
function b64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, x => String.fromCharCode(x)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === 'object' && !Array.isArray(v); }
export async function principalFromAccessToken(token: string): Promise<GatewayPrincipal> {
  const a = await verifyAccessToken(token);
  if (typeof a.clientId !== 'string' || typeof a.scope !== 'string') throw new Error('Ungültige Clientbindung.');
  await verifyClientId(a.clientId);
  const scopes = a.scope.split(/\s+/).filter(Boolean);
  if (scopes.some(s => !ALL_SCOPES.includes(s as typeof ALL_SCOPES[number]))) throw new Error('Unbekannte Rechte.');
  return Object.freeze({ subjectHash: await hash(a.sub.toLocaleLowerCase('de')), clientHash: await hash(a.clientId), scopes: Object.freeze(scopes) });
}
/** Called only after verifying the enclosing purpose-specific transfer signature. */
export async function principalFromTransfer(value: unknown): Promise<GatewayPrincipal> {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'clientHash,scopes,subjectHash'
    || typeof value.subjectHash !== 'string' || value.subjectHash !== await hash(allowedUserEmail())
    || typeof value.clientHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.clientHash)
    || !Array.isArray(value.scopes) || value.scopes.some(s => typeof s !== 'string' || !ALL_SCOPES.includes(s as typeof ALL_SCOPES[number]))) {
    throw new Error('Übertragung ohne bestätigte Verbindungsbindung.');
  }
  return Object.freeze({ subjectHash: value.subjectHash, clientHash: value.clientHash, scopes: Object.freeze([...value.scopes] as string[]) });
}
function config() {
  const r = getDeckRuntimeConfig();
  const base = r?.baseUrl ?? process.env.NEXTCLOUD_BASE_URL;
  const login = r?.login ?? process.env.NEXTCLOUD_LOGIN_NAME;
  const password = r?.password ?? process.env.NEXTCLOUD_APP_PASSWORD;
  const privateJwk = r?.platformAssertionJwk ?? process.env.NOVASPACE_ASSERTION_JWK;
  if (!base || !login || !password || !privateJwk) throw new Error('Verbindungsprüfung nicht eingerichtet.');
  const u = new URL(base);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('Ungültige native Adresse.');
  return { base: u.origin + u.pathname.replace(/\/$/, ''), login, password, privateJwk };
}
export async function createGatewayAssertion(principal: GatewayPrincipal, purpose: 'setup' | 'status' | 'inventory' | 'github', bodyHash?: string) {
  if ((['inventory', 'github'].includes(purpose)) !== (typeof bodyHash === 'string' && /^[0-9a-f]{64}$/.test(bodyHash))) throw new Error('Ungültige Befehlsbindung.');
  const { base, privateJwk } = config();
  const jwk = JSON.parse(privateJwk) as JsonWebKey & { kid: string };
  if (jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || !/^[0-9a-f]{64}$/.test(jwk.kid)) throw new Error('Signierkonfiguration ungültig.');
  const now = Math.floor(Date.now() / 1000);
  const h = b64(encoder.encode(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'novaspace-client+jwt' })));
  const c = b64(encoder.encode(JSON.stringify({ iss: oauthOrigin(), aud: base + '/ocs/v2.php/apps/novaspace_platform/api/v1/registry/' + purpose,
    sub: principal.subjectHash, client: principal.clientHash, scope: principal.scopes, purpose, iat: now, exp: now + 30, nonce: crypto.randomUUID(), ...(bodyHash ? { bodyHash } : {}) })));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(h + '.' + c));
  return h + '.' + c + '.' + b64(new Uint8Array(sig));
}
async function nativeGet(principal: GatewayPrincipal, purpose: 'setup' | 'status') {
  const { base, login, password } = config();
  const assertion = await createGatewayAssertion(principal, purpose);
  const basic = btoa(Array.from(encoder.encode(login + ':' + password), b => String.fromCharCode(b)).join(''));
  const response = await fetch(base + '/ocs/v2.php/apps/novaspace_platform/api/v1/registry/' + purpose + '?format=json', {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json', 'OCS-APIRequest': 'true', Authorization: 'Basic ' + basic, 'X-NovaSpace-Client': assertion },
  });
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel(); throw new Error('Native Verbindungsprüfung nicht bestätigt.');
  }
  const r: unknown = JSON.parse(await readBody(response, 32768));
  if (!object(r) || !object(r.ocs) || !object(r.ocs.meta) || r.ocs.meta.status !== 'ok'
    || ![100, 200].includes(Number(r.ocs.meta.statuscode)) || !object(r.ocs.data) || r.ocs.data.registryVersion !== '0.2.0') throw new Error('Ungültige Verbindungsantwort.');
  return r.ocs.data;
}
export type RegistryState = { registered: boolean; active: boolean; reason: 'active' | 'not_registered' | 'revoked' | 'credential_changed';
  accessPolicy?: ConnectionPolicy;
  connection?: { connectionId: string; ownerUid: string; nativeUid: string; label: string; channel: 'cloud_connector'; revision: number } };
export async function readRegistryState(principal: GatewayPrincipal): Promise<RegistryState> {
  const d = await nativeGet(principal, 'status');
  if (d.ownerDelegationEnabled !== false || d.journalScope !== 'connection_configuration' || typeof d.nativeUid !== 'string'
    || !object(d.connection) || typeof d.connection.registered !== 'boolean' || typeof d.connection.active !== 'boolean') throw new Error('Ungültiger Verbindungsstatus.');
  const s = d.connection;
  if (s.registered === false && s.active === false && s.reason === 'not_registered' && s.connection === undefined) return { registered: false, active: false, reason: 'not_registered' };
  const c = s.connection;
  if (s.registered !== true || !['active', 'revoked', 'credential_changed'].includes(String(s.reason)) || s.active !== (s.reason === 'active')
    || !object(c) || typeof c.connectionId !== 'string' || !/^[0-9a-f-]{36}$/.test(c.connectionId)
    || typeof c.ownerUid !== 'string' || !c.ownerUid || typeof c.nativeUid !== 'string' || !c.nativeUid
    || typeof c.label !== 'string' || c.channel !== 'cloud_connector' || !Number.isSafeInteger(c.revision) || (c.revision as number) < 1
    || (s.active && c.nativeUid !== d.nativeUid)) throw new Error('Verbindungsbindung nicht bestätigt.');
  return { registered: true, active: s.active as boolean, reason: s.reason as RegistryState['reason'], accessPolicy: parseConnectionPolicy(s.accessPolicy), connection: {
    connectionId: c.connectionId, ownerUid: c.ownerUid, nativeUid: c.nativeUid, label: c.label, channel: 'cloud_connector', revision: c.revision as number,
  } };
}
export async function readSetupLink(principal: GatewayPrincipal) {
  const d = await nativeGet(principal, 'setup'); const { base } = config();
  if (d.requiresWebApproval !== true || d.registeredByThisCall !== false || d.expiresIn !== 600 || typeof d.setupUrl !== 'string'
    || d.clientDisplay !== principal.clientHash.slice(0, 12)) throw new Error('Einrichtungslink nicht bestätigt.');
  const u = new URL(d.setupUrl), expected = new URL(base + '/index.php/apps/novaspace_platform/connections/new');
  const prettyPath = new URL(base + '/apps/novaspace_platform/connections/new').pathname;
  const ticket = u.searchParams.get('ticket');
  if (u.origin !== expected.origin || ![expected.pathname, prettyPath].includes(u.pathname) || u.username || u.password || u.hash
    || [...u.searchParams.keys()].join(',') !== 'ticket' || !ticket || ticket.length > 12000) throw new Error('Ungültiger Einrichtungslink.');
  return { setupUrl: u.href, clientDisplay: d.clientDisplay as string, expiresIn: 600, requiresWebApproval: true, registeredByThisCall: false };
}
export async function requireConnection(principal: GatewayPrincipal) {
  const state = await readRegistryState(principal);
  // Preserve the existing explicitly allowed owner's legacy access until deliberate binding.
  if (state.registered && !state.active) throw new Error('Verbindung widerrufen oder Zugang geändert.');
  return state;
}

/** Transfer tickets must recheck current app permissions, not just their original signature. */
export async function requireTransferPermission(principal: GatewayPrincipal, scope: string) {
  let state: RegistryState;
  try { state = await readRegistryState(principal); }
  catch { throw new ConnectionPolicyDenied('registry_unverified', 'Der aktuelle Verbindungs- und App-Freigabestatus konnte nicht geprüft werden.'); }
  if (state.registered && !state.active) throw new ConnectionPolicyDenied('connection_unavailable', 'Diese Verbindung ist widerrufen oder ihr technischer Zugang wurde geändert.');
  const denied = permissionDenial(parseConnectionPolicy(state.accessPolicy), appForScope(scope), /:(write|organize)$/.test(scope));
  if (!principal.scopes.includes(scope)) throw new ConnectionPolicyDenied('connector_scope_missing', 'Erforderliches Konnektorrecht fehlt: ' + scope);
  if (denied) throw new ConnectionPolicyDenied(denied.structuredContent.outcome, denied.structuredContent.message);
  return state;
}
