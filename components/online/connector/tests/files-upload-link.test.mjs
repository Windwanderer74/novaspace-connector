// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { registryConfig, registryResponse, testPrincipal } from './platform-registry-fixture.mjs';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: "export { createDeckMcpServer } from './lib/mcp'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { serveFileUpload } from './lib/files-upload'; export { signPayload } from './lib/oauth'; export { withGatewayPrincipal } from './lib/platform-registry';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/upload-link.mjs' });
const api = await import('../.sites-runtime/test/upload-link.mjs');
const { createMcpHandler } = await import('@modelcontextprotocol/server');
api.setDeckRuntimeConfig({ ...registryConfig, NEXTCLOUD_BASE_URL: 'https://cloud.example.test', NEXTCLOUD_LOGIN_NAME: 'service', NEXTCLOUD_APP_PASSWORD: 'test-only', OAUTH_SIGNING_SECRET: 'test-only-key-not-production-123456789', CONNECTOR_ALLOWED_EMAIL: 'owner@example.test', CONNECTOR_PUBLIC_ORIGIN: 'https://connector.example.test' });
const handler = createMcpHandler(() => api.createDeckMcpServer(), { legacy: 'stateless', responseMode: 'json' });
const root = '/remote.php/dav/files/ChatGPT';
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const xml = (href, props) => `<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:href>${esc(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
const bytes = new Uint8Array([37,80,68,70,45,49,46,55,10,0,128,255,10,37,37,69,79,70]);
const digest = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), x => x.toString(16).padStart(2, '0')).join('');
const sha256 = await digest(bytes);
const source = { root: { data: { id: 'root', text: 'Test', unknown: { keep: true } }, children: [{ data: { id: 'doc', text: 'Brief', progress: 1 }, children: [] }] }, template: 'default', custom: ['preserve', 42] };
let nodes, requests, mode, writes, sourceChecks, registryChecks;
const tag = n => `"v${n.rev}"`;
function reset() {
  nodes = new Map([['/', { id: '1', rev: 1, type: 'folder', permissions: 'GCK' }], ['/actual.km', { id: '7000', rev: 1, type: 'file', permissions: 'GW', text: JSON.stringify(source) }], ['/Quelle.pdf', { id: '7001', rev: 1, type: 'file', permissions: 'GW', bytes, mime: 'application/pdf' }]]);
  requests = []; mode = ''; writes = 0; sourceChecks = 0; registryChecks = 0;
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (new URL(url).pathname.endsWith('/registry/status')) { registryChecks++; return registryResponse(mode === 'revoke-before-put' && registryChecks > 1 ? 'revoked' : 'not_registered'); }
  requests.push({ url, method: init.method }); assert.equal(init.redirect, 'manual');
  const href = new URL(url).pathname, h = new Headers(init.headers);
  if (href === '/remote.php/dav/') return new Response(xml(href, '<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>'), { status: 207 });
  const path = decodeURIComponent(href.slice(root.length)) || '/', node = nodes.get(path);
  if (init.method === 'PROPFIND') {
    if (mode === 'read-denied' && writes) return new Response(null, { status: 403 });
    if (!node) return new Response(null, { status: 404 });
    if (path === '/Quelle.pdf') {
      sourceChecks++;
      if (mode === 'source-race' && sourceChecks === 2 || mode === 'source-after-write' && sourceChecks === 3) node.rev++;
    }
    const size = node.bytes?.length ?? new TextEncoder().encode(node.text ?? '').length;
    return new Response(xml(href, `<d:resourcetype>${node.type === 'folder' ? '<d:collection/>' : ''}</d:resourcetype><oc:fileid>${node.id}</oc:fileid><d:getetag>${tag(node)}</d:getetag><d:getcontentlength>${size}</d:getcontentlength><d:getcontenttype>${node.mime ?? 'text/plain'}</d:getcontenttype><oc:permissions>${node.permissions}</oc:permissions><nc:hide-download>${node.denied ? 'true' : 'false'}</nc:hide-download>`), { status: 207 });
  }
  if (init.method === 'GET') {
    assert.equal(h.get('if-match'), tag(node)); assert.equal(h.get('accept-encoding'), 'identity');
    let value = node.bytes ?? node.text;
    if (mode === 'short-readback' && node.bytes) value = node.bytes.slice(1);
    if (mode === 'long-readback' && node.bytes) value = new Uint8Array(node.bytes.length + 1);
    if (mode === 'get-race' && node.bytes) node.rev++;
    return new Response(value, { status: 200, headers: { etag: tag(node), 'content-type': node.mime ?? 'text/plain' } });
  }
  assert.equal(init.method, 'PUT'); writes++;
  if (mode === 'conflict') return new Response(null, { status: 412 });
  if (mode === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://foreign.test/' } });
  if (mode === 'server-error') return new Response(null, { status: 503 });
  if (h.get('if-none-match') === '*') {
    if (node) return new Response(null, { status: 412 });
    assert.equal(h.get('content-type'), 'application/pdf');
    nodes.set(path, { id: '7010', rev: 1, type: 'file', permissions: 'GW', mime: 'application/pdf', bytes: mode === 'corrupt' ? new Uint8Array(bytes.length) : new Uint8Array(init.body) });
  } else {
    assert.equal(h.get('if-match'), tag(node));
    nodes.set(path, { ...node, rev: node.rev + 1, text: init.body });
  }
  if (mode === 'lost-response') throw new Error('private-network-detail');
  return new Response(null, { status: node ? 204 : 201 });
};
async function call(name, args, scopes = ['files:write', 'files:read']) {
  const response = await api.withGatewayPrincipal(testPrincipal, () => handler.fetch(new Request('https://connector.example.test/deck-mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), { authInfo: { token: 'test', clientId: 'test', scopes, resource: new URL('https://connector.example.test/deck-mcp') } }));
  const text = await response.text();
  const json = response.headers.get('content-type')?.includes('text/event-stream') ? text.split('\n').filter(l => l.startsWith('data:')).map(l => JSON.parse(l.slice(5))).find(j => j.id === 1) : JSON.parse(text);
  assert.ok(json.result, text); return json.result;
}
const uploadInput = { path: '/Grüße, 09.10.pdf', size: bytes.length, sha256, mimeType: 'application/pdf' };
const prepare = (patch = {}, scopes) => call('files_prepare_upload', { ...uploadInput, ...patch }, scopes);
const linkInput = { path: '/actual.km', fileId: '7000', etag: '"v1"', nodeId: 'doc', sourcePath: '/Quelle.pdf', sourceFileId: '7001', sourceEtag: '"v1"' };
async function transfer(prepared, body = bytes, headers = {}, method = 'PUT') {
  return api.serveFileUpload(new Request(prepared.transfer.url, { method, headers: { ...prepared.transfer.headers, ...headers }, ...(method !== 'GET' ? { body } : {}) }));
}
test('New tools require both existing file scopes before contacting Nextcloud', async () => {
  for (const scopes of [['files:read'], ['files:write'], ['deck:write']]) {
    reset(); assert.equal((await prepare({}, scopes)).isError, true); assert.equal(requests.length, 0);
    assert.equal((await call('mindmap_link_file', linkInput, scopes)).isError, true); assert.equal(requests.length, 0);
  }
});
test('Binary upload preserves every original byte and returns a checked identity, size and hash', async () => {
  reset(); const prep = await prepare(); assert.equal(prep.isError, undefined); const p = prep.structuredContent;
  assert.equal(p.uploadCompleted, false); assert.equal(writes, 0); assert.equal(p.overwrite, false); assert.doesNotMatch(p.transfer.url, /token|password/);
  assert.equal(p.transfer.userAgent, 'NOVAFORGE-FileTransfer/1.0');
  assert.equal(p.transfer.headers['User-Agent'], p.transfer.userAgent);
  assert.equal(p.transfer.headers.Authorization, p.transfer.authorization);
  assert.equal(p.transfer.headers['Content-Type'], p.mimeType);
  assert.equal(p.transfer.headers.Accept, 'application/json');
  assert.match(p.note, /transfer.headers/); assert.match(p.note, /1010/);
  const response = await transfer(p); assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.verified, true); assert.equal(data.writeAccepted, true); assert.equal(data.fileId, '7010'); assert.equal(data.size, bytes.length); assert.equal(data.sha256, sha256); assert.equal(data.etag, '"v1"');
  assert.deepEqual(nodes.get(uploadInput.path).bytes, bytes); assert.equal(writes, 1); assert.doesNotMatch(JSON.stringify(data), /test-only|service|private-network/);
  const again = await transfer(p); assert.equal(again.status, 409); assert.equal(writes, 1); assert.equal((await prepare()).isError, true);
});
test('Wrong hash, short/long body, content type, size and invalid PDF never issue PUT', async () => {
  for (const [body, headers] of [[new Uint8Array(bytes.length), {}], [bytes.slice(1), {}], [new Uint8Array(bytes.length + 1), {}], [bytes, { 'content-type': 'text/plain' }], [bytes, { 'content-length': '999' }], [bytes, { 'content-encoding': 'gzip' }]]) {
    reset(); const p = (await prepare()).structuredContent; assert.equal((await transfer(p, body, headers)).status, 400); assert.equal(writes, 0);
  }
  reset(); const bad = new Uint8Array(bytes.length); const p = (await prepare({ sha256: await digest(bad) })).structuredContent;
  assert.equal((await transfer(p, bad)).status, 400); assert.equal(writes, 0);
});
test('Revocation during body handling is checked again immediately before native PUT', async () => {
  reset(); const p = (await prepare()).structuredContent; mode = 'revoke-before-put';
  assert.equal((await transfer(p)).status, 403); assert.equal(registryChecks, 2); assert.equal(writes, 0);
});
test('Upload rejects unsafe paths, oversized preparation and inconsistent MIME before network', async () => {
  for (const patch of [{ path: '/../x.pdf' }, { path: '//x.pdf' }, { path: '/x.pdf/' }, { path: 'https://foreign.test/x.pdf' }, { size: 52428801 }, { sha256: 'x'.repeat(64) }, { mimeType: 'text/plain' }, { mimeType: 'application/pdf\r\nX: x' }]) {
    reset(); assert.equal((await prepare(patch)).isError, true); assert.equal(requests.length, 0);
  }
});
test('50 MiB is inclusive in the real MCP schema and signed HTTP transfer validation', async () => {
  reset(); const prepared = await prepare({ size: 52428800 });
  assert.equal(prepared.isError, undefined); assert.equal(prepared.structuredContent.maxBytes, 52428800);
  assert.equal(writes, 0);
  for (const size of [52428801, 0, 1.5]) {
    reset(); const token = await api.signPayload({ type: 'upload', exp: Math.floor(Date.now() / 1000) + 300, uid: 'ChatGPT', parentId: '1', ...uploadInput, size });
    const response = await api.serveFileUpload(new Request('https://connector.example.test/files-upload', { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/pdf' }, body: bytes }));
    assert.equal(response.status, 401); assert.equal(requests.length, 0); assert.equal(writes, 0);
  }
});
test('Original-size 12,491,347-byte PDF and exact 50 MiB binary transfers preserve all bytes', async () => {
  for (const size of [12491347, 52428800]) {
    reset(); const original = new Uint8Array(size); original.set(bytes); original[size - 1] = 255;
    const checksum = await digest(original);
    const prepared = await prepare({ size, sha256: checksum }); assert.equal(prepared.isError, undefined);
    const response = await transfer(prepared.structuredContent, original); assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.verified, true); assert.equal(data.size, size); assert.equal(data.sha256, checksum);
    assert.deepEqual(nodes.get(uploadInput.path).bytes, original); assert.equal(writes, 1);
  }
});
test('Expired, forged, wrong-type and wrong-account upload claims cannot write', async () => {
  const base = { type: 'upload', exp: Math.floor(Date.now() / 1000) + 300, uid: 'ChatGPT', parentId: '1', ...uploadInput };
  for (const patch of [{ exp: 1 }, { exp: base.exp + 301 }, { type: 'download' }, { uid: 'other' }, { parentId: '99' }]) {
    reset(); const token = await api.signPayload({ ...base, ...patch });
    const response = await api.serveFileUpload(new Request('https://connector.example.test/files-upload', { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/pdf' }, body: bytes }));
    assert.notEqual(response.status, 200); assert.equal(writes, 0);
  }
  reset(); const p = (await prepare()).structuredContent;
  assert.equal((await transfer(p, bytes, { authorization: p.transfer.authorization + 'x' })).status, 401);
  assert.equal((await transfer(p, bytes, {}, 'POST')).status, 405); assert.equal(writes, 0);
});
test('Changed destination rights or parent identity and a racing new file cannot overwrite', async () => {
  for (const change of [() => { nodes.get('/').permissions = 'G'; }, () => { nodes.get('/').id = '999'; }, () => { nodes.set(uploadInput.path, { id: '999', rev: 1, type: 'file', permissions: 'GW', bytes }); }]) {
    reset(); const p = (await prepare()).structuredContent; change(); assert.equal((await transfer(p)).status, 409); assert.equal(writes, 0);
  }
  reset(); const p = (await prepare()).structuredContent; mode = 'conflict'; assert.equal((await transfer(p)).status, 409); assert.equal(writes, 1);
});
test('Lost response reconciles once; failed or changed readback never claims completion', async () => {
  for (const fault of ['lost-response', 'corrupt', 'short-readback', 'long-readback', 'read-denied', 'get-race', 'server-error', 'redirect']) {
    reset(); const p = (await prepare()).structuredContent; mode = fault; const response = await transfer(p); const data = await response.json();
    assert.equal(writes, 1); assert.equal(data.verified, fault === 'lost-response'); assert.equal(data.uploadCompleted, fault === 'lost-response');
    if (fault === 'lost-response') assert.equal(data.writeAccepted, null);
    assert.doesNotMatch(JSON.stringify(data), /private-network-detail/);
  }
});
test('Native file link preserves all metadata and repeated identical linkage issues no new PUT', async () => {
  reset(); const result = await call('mindmap_link_file', linkInput); assert.equal(result.structuredContent.verified, true, JSON.stringify(result)); assert.equal(writes, 1);
  const map = JSON.parse(nodes.get('/actual.km').text), node = map.root.children[0].data;
  assert.equal(node.hyperlink, 'https://cloud.example.test/index.php/f/7001'); assert.equal(node.hyperlinkTitle, 'Quelle.pdf'); assert.equal(node.nfSource.etagAtLink, '"v1"');
  assert.deepEqual(map.custom, source.custom); assert.deepEqual(map.root.data, source.root.data); assert.equal(node.progress, 1);
  const repeat = await call('mindmap_link_file', { ...linkInput, etag: '"v2"' }); assert.equal(repeat.structuredContent.unchanged, true); assert.equal(writes, 1);
});
test('Wrong source/map identity, versions, download rights and foreign links stop before writing', async () => {
  for (const patch of [{ fileId: '999' }, { etag: '"stale"' }, { sourceFileId: '999' }, { sourceEtag: '"stale"' }, { sourcePath: '/../Quelle.pdf' }, { nodeId: 'missing' }]) {
    reset(); assert.equal((await call('mindmap_link_file', { ...linkInput, ...patch })).isError, true); assert.equal(writes, 0);
  }
  for (const alter of [() => { nodes.get('/Quelle.pdf').denied = true; }, () => { nodes.get('/Quelle.pdf').permissions = 'W'; }, () => { const m = structuredClone(source); m.root.children[0].data.hyperlink = 'https://other.test/keep'; nodes.get('/actual.km').text = JSON.stringify(m); }]) {
    reset(); alter(); assert.equal((await call('mindmap_link_file', linkInput)).isError, true); assert.equal(writes, 0);
  }
});
test('Source races are caught before PUT or reported separately after accepted map write', async () => {
  reset(); mode = 'source-race'; assert.equal((await call('mindmap_link_file', linkInput)).isError, true); assert.equal(writes, 0);
  reset(); mode = 'source-after-write'; const result = await call('mindmap_link_file', linkInput); assert.equal(writes, 1); assert.equal(result.structuredContent.writeAccepted, true); assert.equal(result.structuredContent.verified, false); assert.equal(result.structuredContent.sourceVersionVerified, false);
});
process.on('exit', () => { globalThis.fetch = originalFetch; });
