// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: "export * from './lib/deck-work'; export {readPlanningBoard,readPlanningCard} from './lib/deck-planning'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {registerDeckWorkTools} from './lib/mcp-deck-work';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/deck-work.mjs' });
const api = await import('../.sites-runtime/test/deck-work.mjs');
api.setDeckRuntimeConfig({ NEXTCLOUD_BASE_URL: 'https://cloud.example.test', NEXTCLOUD_LOGIN_NAME: 'fixture', NEXTCLOUD_APP_PASSWORD: 'never-expose-work-secret', CONNECTOR_PUBLIC_ORIGIN: 'https://connector.example.test', CONNECTOR_ALLOWED_EMAIL: 'owner@example.test', OAUTH_SIGNING_SECRET: 'test-only-signing-key-12345678901234567890' });
const original = globalThis.fetch;
after(() => globalThis.fetch = original);
const root = '/index.php/apps/deck/api/v1.0/boards';
let board, stacks, cards, comments, calls, fault, createdBoard;
const copy = x => JSON.parse(JSON.stringify(x));
function reset() {
  board = { id: 5, title: 'Projekt', color: 'FF0000', archived: false, deletedAt: 0, owner: { uid: 'ChatGPT' }, labels: [], acl: [{ id: 8 }], users: [{ uid: 'ChatGPT' }], permissions: { PERMISSION_READ: true, PERMISSION_EDIT: true, PERMISSION_MANAGE: true } };
  stacks = [{ id: 20, boardId: 5, title: 'Offen', order: 0, cards: [] }, { id: 21, boardId: 5, title: 'Fertig', order: 10, cards: [] }];
  cards = [{ id: 30, stackId: 20, title: 'Aufgabe', description: 'Erhalten', archived: false, labels: [], assignedUsers: [], done: null }];
  comments = [{ id: 40, objectId: 30, actorId: 'ChatGPT', actorType: 'users', message: 'Eigener Text', creationDateTime: '2026-10-22T21:00:00+02:00', mentions: [] }, { id: 41, objectId: 30, actorId: 'Soul', actorType: 'users', message: 'Fremder Text', mentions: [] }];
  calls = []; fault = null; createdBoard = null;
}
const writes = () => calls.filter(c => ['POST', 'PUT', 'DELETE'].includes(c.method));
const ocs = data => Response.json({ ocs: { meta: { status: 'ok', statuscode: 200 }, data } });
globalThis.fetch = async (url, options) => {
  const u = new URL(url), p = u.pathname, method = options.method;
  assert.equal(u.origin, 'https://cloud.example.test'); assert.equal(options.redirect, 'manual'); assert.ok(options.signal);
  calls.push({ path: p, method, body: method === 'PROPFIND' ? undefined : options.body && JSON.parse(options.body) });
  if (p === '/remote.php/dav/') return new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>', { status: 207 });
  if (fault === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://unrelated.test' } });
  if (fault === 'readback' && method === 'GET' && writes().length) return new Response(null, { status: 503 });
  const input = options.body && JSON.parse(options.body);
  if (p === root && method === 'GET') return Response.json(createdBoard ? [board, createdBoard] : [board]);
  if (p === root && method === 'POST') { createdBoard = { ...copy(board), id: 6, ...input }; return Response.json(createdBoard); }
  if (p === root + '/6') return Response.json(createdBoard);
  if (p === root + '/5') { if (method === 'PUT') Object.assign(board, input); return Response.json(board); }
  if (p === root + '/5/stacks') {
    if (method === 'POST') { stacks.push({ id: 22, boardId: 5, ...input, cards: [] }); return Response.json(stacks.at(-1)); }
    return Response.json(fault === 'foreignStack' ? [{ ...stacks[0], boardId: 6 }] : stacks);
  }
  if (p === root + '/5/stacks/20') { Object.assign(stacks[0], input); if (fault === 'otherStack') stacks[1].title = 'Parallel'; return Response.json(stacks[0]); }
  if (p === root + '/5/stacks/20/cards/30') return Response.json(cards[0]);
  if (p.startsWith('/ocs/v2.php/apps/deck/api/v1.0/cards/30/comments')) {
    if (method === 'GET') {
      if (fault === 'badOcs') return Response.json({ ocs: { meta: { status: 'failure', statuscode: 403 }, data: comments } });
      if (fault === 'foreignComment') return ocs([{ ...comments[0], objectId: 31 }]);
      const offset = Number(u.searchParams.get('offset') ?? 0), limit = Number(u.searchParams.get('limit') ?? 100);
      if (fault === 'repeatPage') return ocs(Array.from({ length: 100 }, (_, i) => ({ ...comments[0], id: i + 1 })));
      return ocs(comments.slice(offset, offset + limit));
    }
    let written;
    if (method === 'POST') { written = { id: 42, objectId: 30, actorId: 'ChatGPT', actorType: 'users', message: input.message, mentions: [] }; if (input.parentId) written.replyTo = copy(comments.find(c => c.id === input.parentId)); comments.unshift(written); }
    else { written = comments.find(c => c.id === Number(p.split('/').at(-1))); written.message = input.message; }
    if (fault === 'lost') throw new Error('never-expose-work-secret');
    if (fault === 'otherCard') cards[0].description = 'Parallel';
    return ocs(written);
  }
  throw new Error('Unexpected fixture endpoint: ' + method + ' ' + p);
};
const ref = { boardId: 5, stackId: 20, cardId: 30 };
async function cardGuard() { const r = await api.readPlanningCard(5, 20, 30); const c = await api.listDeckComments({ ...ref, limit: 25, offset: 0 }); return { ...ref, expectedAccount: 'ChatGPT', expectedVersion: r.version, expectedBoardVersion: r.boardVersion, expectedSnapshot: c.snapshot }; }
test('Board creation binds to freshly read collection and returns the native ID without copying permissions', async () => {
  reset(); const before = await api.readDeckStructure();
  const r = await api.createDeckBoard({ title: 'Neues Board', color: '00FF00', expectedAccount: 'ChatGPT', expectedVersion: before.version });
  assert.equal(r.outcome, 'verified'); assert.equal(r.board.id, 6); assert.deepEqual(writes()[0].body, { title: 'Neues Board', color: '00FF00' });
});
test('Board creation denies wrong account, stale collection and duplicate title before POST', async () => {
  for (const f of ['account', 'version', 'duplicate']) { reset(); const b = await api.readDeckStructure(); await assert.rejects(api.createDeckBoard({ title: f === 'duplicate' ? 'projekt' : 'Neu', color: '000000', expectedAccount: f === 'account' ? 'Soul' : 'ChatGPT', expectedVersion: f === 'version' ? '0'.repeat(64) : b.version })); assert.equal(writes().length, 0); }
});
test('Board rename preserves color/archive, members, labels and ACL; archive is distinct from deletion', async () => {
  reset(); const before = copy(board); let r = await api.updateDeckBoard({ boardId: 5, title: 'Anderer Name', expectedAccount: 'ChatGPT', expectedBoardVersion: (await api.readPlanningBoard(5)).version });
  assert.equal(r.outcome, 'verified'); assert.deepEqual(writes()[0].body, { title: 'Anderer Name', color: 'FF0000', archived: false }); assert.deepEqual(board.acl, before.acl);
  r = await api.updateDeckBoard({ boardId: 5, archived: true, expectedAccount: 'ChatGPT', expectedBoardVersion: (await api.readPlanningBoard(5)).version }); assert.equal(r.outcome, 'verified'); assert.equal(board.deletedAt, 0);
  await assert.rejects(api.updateDeckBoard({ boardId: 5, title: 'Not now', expectedAccount: 'ChatGPT', expectedBoardVersion: (await api.readPlanningBoard(5)).version }), /aktivieren/);
  r = await api.updateDeckBoard({ boardId: 5, archived: false, expectedAccount: 'ChatGPT', expectedBoardVersion: (await api.readPlanningBoard(5)).version }); assert.equal(r.outcome, 'verified');
});
test('Board and list management require native manage permission, preserve no-op and reject missing changes', async () => {
  reset(); let b = await api.readPlanningBoard(5); assert.equal((await api.updateDeckBoard({ boardId: 5, title: board.title, expectedAccount: 'ChatGPT', expectedBoardVersion: b.version })).outcome, 'unchanged');
  board.permissions.PERMISSION_MANAGE = false; b = await api.readPlanningBoard(5); await assert.rejects(api.updateDeckBoard({ boardId: 5, title: 'Neu', expectedAccount: 'ChatGPT', expectedBoardVersion: b.version }), /Berechtigung/);
  const s = await api.readDeckStructure(5); await assert.rejects(api.saveDeckStack({ boardId: 5, title: 'Neu', order: 5, expectedAccount: 'ChatGPT', expectedVersion: s.version }), /Berechtigung/); assert.equal(writes().length, 0);
});
test('List creation and partial rename preserve other lists and card content', async () => {
  reset(); let b = await api.readDeckStructure(5); let r = await api.saveDeckStack({ boardId: 5, title: 'Prüfen', order: 5, expectedAccount: 'ChatGPT', expectedVersion: b.version }); assert.equal(r.outcome, 'verified'); assert.equal(r.stackId, 22);
  b = await api.readDeckStructure(5); r = await api.saveDeckStack({ boardId: 5, stackId: 20, title: 'Eingang', expectedAccount: 'ChatGPT', expectedVersion: b.version }); assert.equal(r.outcome, 'verified'); assert.equal(stacks[0].order, 0); assert.equal(cards[0].description, 'Erhalten'); assert.equal(stacks[1].title, 'Fertig');
});
test('Structure guards detect changed list order, foreign stack IDs, duplicate creation and misplaced update', async () => {
  for (const f of ['stale', 'foreign', 'duplicate', 'missing']) { reset(); const b = await api.readDeckStructure(5); if (f === 'stale') stacks[1].order = 20; if (f === 'foreign') fault = 'foreignStack'; await assert.rejects(api.saveDeckStack({ boardId: 5, stackId: f === 'missing' ? 99 : undefined, title: f === 'duplicate' ? 'Offen' : 'Neu', order: 5, expectedAccount: 'ChatGPT', expectedVersion: b.version })); assert.equal(writes().length, 0); }
});
test('Changed unrelated list and failed board readback return unknown after one write', async () => {
  reset(); const s = await api.readDeckStructure(5); fault = 'otherStack'; assert.equal((await api.saveDeckStack({ boardId: 5, stackId: 20, title: 'Neu', expectedAccount: 'ChatGPT', expectedVersion: s.version })).outcome, 'unknown'); assert.equal(writes().length, 1);
  reset(); const b = await api.readDeckStructure(); fault = 'readback'; const r = await api.createDeckBoard({ title: 'Neu', color: '000000', expectedAccount: 'ChatGPT', expectedVersion: b.version }); assert.equal(r.outcome, 'unknown'); assert.equal(r.boardId, 6); assert.equal(writes().length, 1);
});
test('Comment reading preserves authored text and page snapshot without sending or changing read markers', async () => {
  reset(); let r = await api.listDeckComments({ ...ref, limit: 1, offset: 0 }); assert.equal(r.total, 2); assert.equal(r.nextOffset, 1); assert.equal(r.comments[0].message, 'Eigener Text'); assert.match(r.comments[0].version, /^[a-f0-9]{64}$/);
  const next = await api.listDeckComments({ ...ref, limit: 1, offset: 1, expectedSnapshot: r.snapshot }); assert.equal(next.comments[0].actorId, 'Soul'); comments[0].message = 'Parallel'; await assert.rejects(api.listDeckComments({ ...ref, limit: 1, offset: 1, expectedSnapshot: r.snapshot }), /verändert/); assert.equal(writes().length, 0); assert.ok(!calls.some(c => /read|mark/i.test(c.path)));
});
test('Replies bind to known comments in same card; native readers with connector write may comment', async () => {
  reset(); board.permissions.PERMISSION_EDIT = false;
  const a = await cardGuard(), r = await api.saveDeckComment({ ...a, parentId: 41, message: 'Beauftragte Antwort' }); assert.equal(r.outcome, 'verified'); assert.equal(r.comment.replyTo.id, 41); assert.equal(comments.find(c => c.id === 40).message, 'Eigener Text'); assert.equal(writes().length, 1);
});
test('Only an own comment can be edited; individual stale version and unknown parent stop before sending', async () => {
  for (const f of ['foreign', 'stale', 'parent']) { reset(); const a = await cardGuard(), list = await api.listDeckComments({ ...ref, limit: 25, offset: 0 }); const c = list.comments.find(c => c.id === (f === 'foreign' ? 41 : 40)); await assert.rejects(api.saveDeckComment({ ...a, message: 'Neu', ...(f === 'parent' ? { parentId: 99 } : { commentId: c.id, expectedCommentVersion: f === 'stale' ? '0'.repeat(64) : c.version }) })); assert.equal(writes().length, 0); }
});
test('Own comment update preserves reply and other comments; identical repeated create is denied', async () => {
  reset(); comments[0].replyTo = copy(comments[1]); const a = await cardGuard(), list = await api.listDeckComments({ ...ref, limit: 25, offset: 0 }); const own = list.comments[0]; let r = await api.saveDeckComment({ ...a, commentId: own.id, expectedCommentVersion: own.version, message: 'Bearbeitete Antwort' }); assert.equal(r.outcome, 'verified'); assert.equal(r.comment.replyTo.id, 41); assert.equal(comments[1].message, 'Fremder Text');
  await assert.rejects(api.saveDeckComment({ ...await cardGuard(), parentId: 41, message: 'Bearbeitete Antwort' }), /Identischer/); assert.equal(writes().length, 1);
});
test('Stale card/comment snapshot, archived card, missing native read and wrong account stop comments', async () => {
  for (const f of ['card', 'snapshot', 'archive', 'permission', 'account']) { reset(); const a = await cardGuard(); if (f === 'card') cards[0].title = 'Parallel'; if (f === 'snapshot') comments[0].message = 'Parallel'; if (f === 'archive') cards[0].archived = true; if (f === 'permission') board.permissions.PERMISSION_READ = false; if (f === 'account') a.expectedAccount = 'Soul'; await assert.rejects(api.saveDeckComment({ ...a, message: 'Neu' })); assert.equal(writes().length, 0); }
});
test('Lost comment response and unexpected card change never trigger duplicate sends', async () => {
  for (const f of ['lost', 'otherCard', 'readback']) { reset(); const a = await cardGuard(); fault = f; const r = await api.saveDeckComment({ ...a, message: 'Einmal senden' }); assert.equal(r.outcome, 'unknown'); assert.equal(writes().length, 1); assert.ok(!JSON.stringify(r).includes('never-expose-work-secret')); }
});
test('Invalid OCS envelope, foreign comment, repeated native page and more than500 comments are rejected', async () => {
  for (const f of ['badOcs', 'foreignComment', 'repeatPage', 'many']) { reset(); if (f === 'many') comments = Array.from({ length: 501 }, (_, i) => ({ ...comments[0], id: i + 1 })); else fault = f; await assert.rejects(api.listDeckComments({ ...ref, limit: 25, offset: 0 })); assert.equal(writes().length, 0); }
});
test('Exactly500 comments are complete; string IDs normalize; redirects do not leak or follow', async () => {
  reset(); comments = Array.from({ length: 500 }, (_, i) => ({ ...comments[0], id: String(i + 1), objectId: '30' })); const r = await api.listDeckComments({ ...ref, limit: 50, offset: 0 }); assert.equal(r.total, 500); assert.equal(r.comments[0].id, 1); fault = 'redirect'; await assert.rejects(api.readDeckStructure(), /HTTP 302/); assert.ok(!JSON.stringify(r).includes('never-expose-work-secret'));
});
test('All eight actual tool schemas fail missing scopes before network; comment mutations explicitly warn about sending', async () => {
  reset(); const registered = new Map(); api.registerDeckWorkTools({ registerTool(n, config, callback) { registered.set(n, { config, callback }); } }); assert.equal(registered.size, 8);
  for (const [n, { config, callback }] of registered) { assert.equal((await callback({}, {})).isError, true); if (n.includes('create_comment') || n.includes('update_comment')) { assert.equal(config.annotations.openWorldHint, true); assert.match(config.description, /benachrichtigen/); } } assert.equal(calls.length, 0);
});
