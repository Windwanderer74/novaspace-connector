// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { createMcpHandler } from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: `export { createDeckMcpServer } from './lib/mcp'; export { setDeckRuntimeConfig } from './lib/runtime-config';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/inventory.mjs' });
const api = await import('../.sites-runtime/test/inventory.mjs');
api.setDeckRuntimeConfig({ NEXTCLOUD_BASE_URL: 'https://cloud.example.test', NEXTCLOUD_LOGIN_NAME: 'service-login', NEXTCLOUD_APP_PASSWORD: 'test-only', OAUTH_SIGNING_SECRET: 'local-test-key-not-a-production-key-123', CONNECTOR_ALLOWED_EMAIL: 'owner@example.test', CONNECTOR_PUBLIC_ORIGIN: 'https://connector.example.test' });
const handler = createMcpHandler(() => api.createDeckMcpServer(), { legacy: 'stateless', responseMode: 'json' });
const nativeFetch = globalThis.fetch;
let requests = [], replies = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url, options });
  const reply = replies.shift(); assert.ok(reply, 'Unexpected upstream request');
  if (reply instanceof Error) throw reply;
  return new Response(reply.body, { status: reply.status ?? 200, headers: reply.headers ?? { 'content-type': 'application/json' } });
};
const identity = () => ({ status: 207, headers: { 'content-type': 'application/xml' }, body: '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>' });
const json = value => ({ body: JSON.stringify(value) });
const device = (extra = {}) => ({ id: 7, uid: 'ChatGPT', name: 'Knusperkiste', path: '', maker: '', itemNumber: 'SN-G001', description: '', link: '', details: '', comment: '', ...extra });
const input = { expectedAccount: 'ChatGPT', reference: 'SN-G001', name: 'Knusperkiste' };
function setup(data = []) { requests = []; replies = data; }
async function call(name, args = {}, scopes = ['inventory:read']) {
  const response = await handler.fetch(new Request('https://connector.example.test/deck-mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), { authInfo: { token: 'mock', clientId: 'mock', scopes, resource: new URL('https://connector.example.test/deck-mcp') } });
  assert.equal(response.status, 200);
  const body = await response.text();
  const data = response.headers.get('content-type')?.includes('text/event-stream') ? body.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5))).find(d => d.id === 1) : JSON.parse(body);
  assert.ok(data.result, JSON.stringify(data)); return data.result;
}
test('Inventory tools reject legacy and incomplete scopes without upstream access', async () => {
  for (const [name, args, scopes] of [
    ['inventory_status', {}, ['files:read']], ['inventory_list_items', {}, ['deck:read']],
    ['inventory_get_item', { itemId: 7 }, ['tables:read']],
    ['inventory_create_item', input, ['inventory:read']], ['inventory_create_item', input, ['inventory:write']],
  ]) { setup(); const r = await call(name, args, scopes); assert.equal(r.isError, true); assert.equal(requests.length, 0); assert.match(JSON.stringify(r), /insufficient_scope/); }
});
test('Empty inventory status identifies the real backend account without claiming write acceptance or Soul sharing', async () => {
  setup([identity(), json([])]); const r = await call('inventory_status');
  assert.equal(r.structuredContent.account, 'ChatGPT'); assert.equal(r.structuredContent.itemCount, 0);
  assert.equal(r.structuredContent.createHostAcceptanceVerified, false); assert.equal(r.structuredContent.crossAccountSharingImplemented, false);
  assert.deepEqual(requests.map(r => r.options.method), ['PROPFIND', 'GET']);
});
test('Inventory filtering preserves native identity and checks account isolation', async () => {
  setup([identity(), json([device(), device({ id: 8, name: 'Lampe', itemNumber: 'SN-G002' })])]);
  const r = await call('inventory_list_items', { query: 'SN-G001', limit: 1 }); assert.equal(r.structuredContent.totalMatches, 1); assert.equal(r.structuredContent.items[0].id, 7);
  setup([identity(), json([device({ uid: 'Soul' })])]); assert.equal((await call('inventory_list_items')).isError, true);
});
test('Read rejects foreign items, HTML sign-in pages and credential-forwarding redirects', async () => {
  for (const reply of [json(device({ id: 8 })), json(device({ uid: 'Soul' })), { body: '<html>Sign in</html>', headers: { 'content-type': 'text/html' } }, { status: 302, body: '', headers: { location: 'https://elsewhere.example/' } }]) {
    setup([identity(), reply]); assert.equal((await call('inventory_get_item', { itemId: 7 })).isError, true);
    assert.equal(requests.length, 2); assert.equal(requests[1].options.redirect, 'manual');
    assert.equal(requests[1].url, 'https://cloud.example.test/index.php/apps/inventory/api/v1/item/7');
  }
});
test('A requested Soul device cannot be silently created in ChatGPT inventory', async () => {
  setup([identity()]); const r = await call('inventory_create_item', { ...input, expectedAccount: 'Soul' }, ['inventory:read', 'inventory:write']);
  assert.equal(r.isError, true); assert.match(JSON.stringify(r), /Kontokonflikt/); assert.equal(requests.length, 1);
});
test('Existing reference causes no POST and does not claim matching content or a new commit', async () => {
  setup([identity(), json([device({ name: 'Different name' })])]); const r = await call('inventory_create_item', input, ['inventory:read', 'inventory:write']);
  assert.equal(r.structuredContent.outcome, 'reference_exists'); assert.equal(r.structuredContent.created, false); assert.equal(requests.length, 2);
});
test('Create uses native item_number, excludes caller UID, and verifies a separate readback', async () => {
  setup([identity(), json([]), json(device()), json(device())]); const r = await call('inventory_create_item', input, ['inventory:read', 'inventory:write']);
  assert.equal(r.structuredContent.outcome, 'created'); assert.equal(r.structuredContent.verified, true);
  assert.equal(requests.length, 4); const sent = JSON.parse(requests[2].options.body);
  assert.equal(sent.item.item_number, 'SN-G001'); assert.equal('uid' in sent.item, false); assert.deepEqual(sent.item.instances, []);
  assert.equal(requests[3].options.method, 'GET');
});
test('Ambiguous POST and changed readback are unknown outcomes and never retried', async () => {
  for (const tail of [[new Error('timeout')], [json(device()), json(device({ name: 'Changed concurrently' }))]]) {
    setup([identity(), json([]), ...tail]); const r = await call('inventory_create_item', input, ['inventory:read', 'inventory:write']);
    assert.equal(r.structuredContent.outcome, 'unknown'); assert.equal(r.structuredContent.verified, false);
    assert.equal(requests.filter(r => r.options.method === 'POST').length, 1);
  }
});
test('Caller cannot inject owner overrides or oversized UTF-8 names', async () => {
  for (const args of [{ ...input, uid: 'Soul' }, { ...input, name: 'ü'.repeat(51) }]) {
    setup(); assert.equal((await call('inventory_create_item', args, ['inventory:read', 'inventory:write'])).isError, true); assert.equal(requests.length, 0);
  }
});
process.on('exit', () => { globalThis.fetch = nativeFetch; });
