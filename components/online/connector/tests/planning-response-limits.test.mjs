// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: "export {planningJson} from './lib/planning-json'; export {setDeckRuntimeConfig} from './lib/runtime-config';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/planning-response-limits.mjs' });
const api = await import('../.sites-runtime/test/planning-response-limits.mjs');
api.setDeckRuntimeConfig({ NEXTCLOUD_BASE_URL: 'https://cloud.example.test', NEXTCLOUD_LOGIN_NAME: 'fixture', NEXTCLOUD_APP_PASSWORD: 'private-response-fixture', CONNECTOR_PUBLIC_ORIGIN: 'https://connector.example.test', CONNECTOR_ALLOWED_EMAIL: 'owner@example.test', OAUTH_SIGNING_SECRET: 'test-only-signing-key-12345678901234567890' });
const original = globalThis.fetch;
after(() => { globalThis.fetch = original; });
const board = '/index.php/apps/deck/api/v1.0/boards/5';
function respond(body, headers = {}) { globalThis.fetch = async (_url, options) => { assert.equal(options.redirect, 'manual'); return new Response(body, { headers }); }; }

test('Deck board and stack collections accept existing descriptions above 2 MiB, including UTF-8 byte accounting', async () => {
  const data = { description: 'ä'.repeat(1200000) };
  for (const path of [board, board + '/stacks', board + '/stacks/archived', board.replace('v1.0', 'v1.1') + '/stacks']) {
    respond(JSON.stringify(data));
    assert.deepEqual((await api.planningJson(path)).data, data);
  }
});
test('The 8 MiB collection boundary is enforced both from headers and while streaming', async () => {
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } }));
  await assert.rejects(api.planningJson(board + '/stacks'), /Grenze von 8 MiB/);
  assert.equal(cancelled, true);
  respond('{}', { 'content-length': String(8 * 1024 * 1024 + 1) });
  await assert.rejects(api.planningJson(board), /Grenze von 8 MiB/);
});
test('Card, Notes and write responses retain 2 MiB limits; invalid JSON is distinguished without echoing content', async () => {
  const large = JSON.stringify({ content: 'x'.repeat(2 * 1024 * 1024) });
  for (const path of [board + '/stacks/30/cards/545', '/index.php/apps/notes/api/v1/notes/1']) {
    respond(large);
    await assert.rejects(api.planningJson(path), /Grenze von 2 MiB/);
  }
  respond(large);
  await assert.rejects(api.planningJson('/index.php/apps/deck/cards/545', 'PUT', {}), /Schreibergebnis unbekannt/);
  respond('<html>private-response-fixture</html>');
  await assert.rejects(api.planningJson(board), error => /kein gültiges JSON/.test(error.message) && !error.message.includes('private-response-fixture'));
});
