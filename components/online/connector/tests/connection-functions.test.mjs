// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { registryConfig, registryResponse, testPrincipal } from './platform-registry-fixture.mjs';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: `export * from './lib/connection-functions'; export * from './lib/connection-policy'; export * from './lib/mcp-permissions'; export * from './lib/platform-registry'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {serveFileDownload} from './lib/files-download'; export {serveFileUpload} from './lib/files-upload'; export {signPayload,createAccessToken,createClientId} from './lib/oauth'; export {POST} from './app/deck-mcp/route';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/connection-functions.mjs' });
const api = await import('../.sites-runtime/test/connection-functions.mjs');
api.setDeckRuntimeConfig({ ...registryConfig, NEXTCLOUD_BASE_URL: 'https://cloud.example.test', NEXTCLOUD_LOGIN_NAME: 'service', NEXTCLOUD_APP_PASSWORD: 'test-only', OAUTH_SIGNING_SECRET: 'local-test-only-signing-key-1234567890', CONNECTOR_ALLOWED_EMAIL: 'owner@example.test', CONNECTOR_PUBLIC_ORIGIN: 'https://connector.example.test' });
const saved = globalThis.fetch; let policy; let calls;
const principal = { ...testPrincipal, scopes: ['files:read', 'files:write', 'files:download', 'deck:read', 'deck:write', 'nextcloud:read'] };
function reset() {
  const base = api.inheritedPolicy();
  policy = { ...base, version: 2, functions: { version: 1, catalogue: api.CONNECTION_FUNCTIONS.hash,
    areas: Object.fromEntries(api.CONNECTION_FUNCTIONS.areas.map(a => [a.id, base.apps[a.app]])),
    allowedTools: api.CONNECTION_FUNCTIONS.tools.map(t => t.name).sort() } };
  calls = [];
}
globalThis.fetch = async (url, options) => {
  calls.push({ url, options }); assert.ok(url.includes('/registry/status'), 'No native data request should run for blocked tools');
  const r = await registryResponse('active').json(); r.ocs.data.connection.accessPolicy = policy; return Response.json(r);
};
after(() => globalThis.fetch = saved);
function wrapped(name, readOnly, fn) {
  let callback; const server = { registerTool(_n, _cfg, cb) { callback = cb; } };
  api.enforceConnectionPermissions(server); server.registerTool(name, { annotations: { readOnlyHint: readOnly } }, fn);
  return () => api.withGatewayPrincipal(principal, () => callback());
}
test('v2 requires valid explicit selection; v1 cannot silently ignore a detail field', () => {
  reset(); assert.deepEqual(api.parseConnectionPolicy(policy), policy);
  for (const p of [{ ...policy, functions: undefined }, { ...policy, version: 1 }, { ...policy, functions: { ...policy.functions, allowedTools: ['bad/name'] } }, { ...policy, functions: { ...policy.functions, areas: {} } }]) assert.throws(() => api.parseConnectionPolicy(p));
});
test('Individual exclusion blocks the real wrapper before callback; sibling read still runs', async () => {
  reset(); policy.functions.allowedTools = policy.functions.allowedTools.filter(n => n !== 'update_card');
  assert.equal((await wrapped('update_card', false, () => assert.fail())()).structuredContent.outcome, 'function_access_disabled');
  assert.equal(await wrapped('deck_read_card', true, () => 'read allowed')(), 'read allowed');
});
test('Main and app ceilings override even explicitly selected single actions', async () => {
  reset(); policy.apps.deck = 'off';
  assert.equal((await wrapped('update_card', false, () => assert.fail())()).structuredContent.outcome, 'app_access_disabled');
  policy.apps.deck = 'write'; policy.enabled = false;
  assert.equal((await wrapped('update_card', false, () => assert.fail())()).structuredContent.outcome, 'connection_disabled');
  assert.equal(await wrapped('nextcloud_capabilities', true, () => 'diagnostics available')(), 'diagnostics available');
});
test('Area read mode refuses mutations without erasing their stored choice', async () => {
  reset(); policy.functions.areas.deck = 'read';
  assert.equal((await wrapped('update_card', false, () => assert.fail())()).structuredContent.outcome, 'function_write_disabled');
  assert.equal(await wrapped('deck_read_card', true, () => 'ok')(), 'ok');
  assert.ok(policy.functions.allowedTools.includes('update_card'));
});
test('Administration topic can be disabled independently and cannot bypass parent app read-only', async () => {
  reset(); policy.functions.areas.boardShares = 'off';
  assert.equal((await wrapped('deck_create_board_share', false, () => assert.fail())()).structuredContent.outcome, 'function_area_disabled');
  policy.functions.areas.boardShares = 'write'; policy.apps.deck = 'read';
  assert.equal((await wrapped('deck_create_board_share', false, () => assert.fail())()).structuredContent.outcome, 'app_write_disabled');
});
test('A newly registered tool is never granted by a saved snapshot or app-name prefix', async () => {
  reset(); assert.equal((await wrapped('files_invented_future', true, () => assert.fail())()).structuredContent.outcome, 'function_access_disabled');
});
test('Subsequent invocation rereads the changed per-connection choice', async () => {
  reset(); const read = wrapped('deck_read_card', true, () => 'ok'); assert.equal(await read(), 'ok');
  policy.functions.allowedTools = policy.functions.allowedTools.filter(n => n !== 'deck_read_card');
  assert.equal((await read()).structuredContent.outcome, 'function_access_disabled'); assert.equal(calls.length, 2);
});
test('Previously signed download ticket is blocked after its individual function is disabled', async () => {
  reset(); policy.functions.allowedTools = policy.functions.allowedTools.filter(n => n !== 'files_download');
  const token = await api.signPayload({ type: 'download', exp: Math.floor(Date.now() / 1000) + 300, uid: 'ChatGPT', path: '/file.pdf', fileId: '1', etag: '"v1"', principal });
  const r = await api.serveFileDownload(new Request('https://connector.example.test/files-download?token=' + token));
  assert.equal(r.status, 403); assert.equal((await r.json()).outcome, 'function_access_disabled');
});
test('Previously signed upload ticket is blocked before reading or writing native content', async () => {
  reset(); policy.functions.allowedTools = policy.functions.allowedTools.filter(n => n !== 'files_prepare_upload');
  const token = await api.signPayload({ type: 'upload', exp: Math.floor(Date.now() / 1000) + 300, uid: 'ChatGPT', path: '/new.pdf', parentId: '1', size: 9, sha256: 'a'.repeat(64), mimeType: 'application/pdf', principal });
  const r = await api.serveFileUpload(new Request('https://connector.example.test/files-upload', { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/pdf' }, body: '%PDF-test' }));
  assert.equal(r.status, 403); assert.equal((await r.json()).outcome, 'function_access_disabled');
});
test('Actual MCP HTTP route returns an individual denial and does not invoke the native operation', async () => {
  reset(); policy.functions.allowedTools = policy.functions.allowedTools.filter(n => n !== 'files_list');
  const clientId = await api.createClientId(['https://chatgpt.com/connector_platform_oauth_redirect']);
  const token = await api.createAccessToken({ sub: 'owner@example.test', aud: 'https://connector.example.test/deck-mcp', scope: principal.scopes.join(' '), clientId });
  const r = await api.POST(new Request('https://connector.example.test/deck-mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'files_list', arguments: { folder: '/' } } }) }));
  assert.equal(r.status, 200); assert.equal(r.headers.has('www-authenticate'), false);
  assert.match(await r.text(), /function_access_disabled/);
});
