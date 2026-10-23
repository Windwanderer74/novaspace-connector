// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: `export { readNativePlatformContext } from './lib/platform-native-context'; export { readCapabilities } from './lib/nextcloud-talk-read'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { CONNECTOR_VERSION } from './lib/connector-version';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/platform-native-context.mjs' });
const api = await import('../.sites-runtime/test/platform-native-context.mjs');
const config = { NEXTCLOUD_BASE_URL: 'https://cloud.example.test/portal', NEXTCLOUD_LOGIN_NAME: 'service-login', NEXTCLOUD_APP_PASSWORD: 'test-only', OAUTH_SIGNING_SECRET: 'local-test-key-not-production-123', CONNECTOR_ALLOWED_EMAIL: 'owner@example.test', CONNECTOR_PUBLIC_ORIGIN: 'https://connector.example.test' };
api.setDeckRuntimeConfig(config);
const savedFetch = globalThis.fetch;
let calls = [], reply;
globalThis.fetch = async (url, options) => { calls.push({ url, options }); if (reply instanceof Error) throw reply; return reply; };
after(() => { globalThis.fetch = savedFetch; });
const dto = { appVersion: '0.1.0', nativeUid: 'ChatGPT', authentication: 'app_password', nativeTokenVerified: true,
  connectionRegistered: false, connectionId: null, actingForUser: null, writesEnabled: false, journalActive: false };
function setup(data = dto, status = 200, contentType = 'application/json') {
  calls = []; api.setDeckRuntimeConfig(config);
  reply = new Response(JSON.stringify({ ocs: { meta: { status: 'ok', statuscode: 200 }, data } }), { status, headers: { 'content-type': contentType } });
}
test('Confirmed native app password remains the service account, without personal authority', async () => {
  setup({ ...dto, nativeTokenId: 123, password: 'untrusted extra secret' });
  const r = await api.readNativePlatformContext('ChatGPT');
  assert.equal(r.verified, true); assert.equal(r.nativeUid, 'ChatGPT');
  assert.equal(r.personalConnectionVerified, false); assert.equal(r.actingForUser, null);
  assert.equal('nativeTokenId' in r, false); assert.equal('password' in r, false);
  assert.equal(calls.length, 1); assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].url, 'https://cloud.example.test/portal/ocs/v2.php/apps/novaspace_platform/api/v1/context?format=json');
});
test('Missing native app reports unavailable without claiming a failed main connector', async () => {
  setup({}, 404); const r = await api.readNativePlatformContext('ChatGPT');
  assert.equal(r.verified, false); assert.equal(r.reason, 'native_app_not_available');
});
test('Foreign UID cannot claim Soul on the fixed service connection', async () => {
  setup({ ...dto, nativeUid: 'Soul' }); assert.equal((await api.readNativePlatformContext('ChatGPT')).verified, false);
});
test('Unsupported registration, authority, version or session kind is not accepted', async () => {
  for (const patch of [{ connectionRegistered: true }, { actingForUser: 'Soul' }, { writesEnabled: true },
    { journalActive: true }, { connectionId: 'injected' }, { nativeTokenVerified: false }, { appVersion: '9.9' }, { authentication: 'web_session' }]) {
    setup({ ...dto, ...patch }); assert.equal((await api.readNativePlatformContext('ChatGPT')).verified, false);
  }
});
test('Redirects do not forward credentials', async () => {
  setup({}, 302); reply.headers.set('location', 'https://elsewhere.example/');
  assert.equal((await api.readNativePlatformContext('ChatGPT')).verified, false); assert.equal(calls.length, 1);
});
test('HTML sign-in pages and error envelopes are unverified', async () => {
  setup(dto, 200, 'text/html'); assert.equal((await api.readNativePlatformContext('ChatGPT')).verified, false);
  setup(); reply = new Response('{"ocs":{"meta":{"status":"failure","statuscode":403},"data":{}}}', { headers: { 'content-type': 'application/json' } });
  assert.equal((await api.readNativePlatformContext('ChatGPT')).verified, false);
});
test('Transport failure reveals no raw credential-bearing error message', async () => {
  setup(); reply = new Error('SECRET_CREDENTIAL_VALUE');
  const r = await api.readNativePlatformContext('ChatGPT');
  assert.equal(r.verified, false); assert.equal(JSON.stringify(r).includes('SECRET'), false); assert.equal(calls.length, 1);
});
test('Oversized or malformed native responses are rejected', async () => {
  for (const body of ['{broken', 'x'.repeat(17000)]) {
    setup(); reply = new Response(body, { headers: { 'content-type': 'application/json' } });
    assert.equal((await api.readNativePlatformContext('ChatGPT')).verified, false);
  }
});
test('Unsafe backend origins cause no upstream call', async () => {
  for (const base of ['http://cloud.example.test', 'https://user:pass@cloud.example.test', 'https://cloud.example.test/?x=1', 'invalid']) {
    setup(); api.setDeckRuntimeConfig({ ...config, NEXTCLOUD_BASE_URL: base });
    assert.equal((await api.readNativePlatformContext('ChatGPT')).verified, false); assert.equal(calls.length, 0);
  }
});
test('Capabilities remain usable with the native app absent and preserve granted scopes', async () => {
  setup();
  const responses = [
    new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/portal/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/portal/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>', { status: 207 }),
    new Response(JSON.stringify({ ocs: { meta: { status: 'ok', statuscode: 200 }, data: { version: { string: '34.0.4' }, capabilities: {} } } })),
    new Response('{}', { status: 404 }),
  ];
  const mock = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); const r = responses.shift(); assert.ok(r); return r; };
  try {
    const r = await api.readCapabilities(['nextcloud:read', 'files:read']);
    assert.equal(r.account, 'ChatGPT'); assert.equal(r.connectorVersion, api.CONNECTOR_VERSION);
    assert.equal(r.platform.reason, 'native_app_not_available'); assert.equal(r.platform.verified, false);
    assert.deepEqual(new Set(r.grantedConnectorScopes), new Set(['nextcloud:read', 'files:read'])); assert.equal(calls.length, 3);
  } finally { globalThis.fetch = mock; }
});
