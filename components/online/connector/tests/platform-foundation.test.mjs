// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: `export * from './lib/platform-foundation'; export * from './lib/platform-reference-store';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: '.sites-runtime/test/platform-foundation.mjs' });
const { createPlatformFoundation, PlatformReferenceStore, canonicalIntent } = await import('../.sites-runtime/test/platform-foundation.mjs');
const schema = readFileSync('ops/platform-foundation/schema-reference.sql', 'utf8');
const REQUEST = '74269982-1220-4419-8a22-df676202f91b';
const NOW = Date.parse('2026-10-18T01:55:00.000Z');
function fixture(path = ':memory:', initialize = true) {
  const db = new DatabaseSync(path);
  if (initialize) db.exec(schema);
  const store = new PlatformReferenceStore(db);
  const auth = new Map(); const notes = new Map([['1', { owner: 'Soul', text: 'before' }], ['2', { owner: 'OtherUser', text: 'before' }]]);
  let calls = 0; let currentTime = NOW;
  const base = { tenantId: 'novaspace', ownerUid: 'Soul', authSubject: 'account:Soul', audience: 'https://connector.example.test/platform', scopes: ['notes:write'], revision: 1, revokedAt: null };
  function connect(id, channel, extra = {}) {
    const c = { ...base, id, channel, clientId: 'client-' + id, provider: channel === 'web' ? 'novaspace' : channel === 'local_connector' ? 'lmstudio' : 'chatgpt', displayName: 'Connection ' + id, ...extra };
    store.provision(c);
    auth.set('test-' + id, { connectionId: c.id, subject: c.authSubject, clientId: c.clientId, audience: c.audience, scopes: [...c.scopes], revision: c.revision, expiresAt: NOW + 60000 });
    return c;
  }
  if (initialize) {
    connect('cloud', 'cloud_connector'); connect('local', 'local_connector'); connect('web', 'web');
    connect('basti', 'cloud_connector', { ownerUid: 'OtherUser', authSubject: 'account:OtherUser' });
    connect('other-tenant', 'cloud_connector', { tenantId: 'another-tenant', ownerUid: 'OtherUser', authSubject: 'account:OtherUser' });
  }
  const operation = {
    requiredScopes: ['notes:write'],
    async allowed(actor, resource) { return resource.type === 'note' && notes.get(resource.id)?.owner === actor.ownerUid; },
    async mutate(actor, resource, input) {
      ++calls;
      if (notes.get(resource.id)?.owner !== actor.ownerUid) return { outcome: 'not_committed', verification: 'unverified', changedFields: [] };
      notes.get(resource.id).text = input.text;
      return { outcome: 'committed', verification: 'verified', resource, changedFields: ['text'] };
    },
  };
  const deps = {
    // Synthetic test authenticator. Production must verify a real signature/session BEFORE making this proof.
    async authenticate(request) { const proof = auth.get(request.headers.get('authorization')); if (!proof) throw Error('Invalid credential'); return proof; },
    connection: id => store.connection(id), journal: store, operations: new Map([['note.update', operation]]), now: () => currentTime,
  };
  const command = (extra = {}) => ({ requestId: REQUEST, action: 'note.update', resource: { type: 'note', id: '1' }, input: { text: 'after' }, ...extra });
  const request = id => new Request('https://connector.example.test/platform', { headers: { authorization: 'test-' + id } });
  return { db, store, auth, notes, operation, deps, connect, command, request,
    execute: (id = 'cloud', extra = {}) => createPlatformFoundation(deps).execute(request(id), command(extra)),
    calls: () => calls, clock: n => { currentTime = n; } };
}

test('Cloud, local and web connections act on one user-owned object with distinct durable actor records', async t => {
  const f = fixture(); t.after(() => f.db.close());
  for (const [i, id] of ['cloud','local','web'].entries()) {
    const out = await f.execute(id, { requestId: REQUEST.slice(0,-1) + i, input: { text: id } });
    assert.equal(out.entry.state, 'succeeded'); assert.equal(out.entry.actor.ownerUid, 'Soul');
    assert.equal(out.entry.actor.connectionId, id); assert.equal(out.journalRecorded, true);
    assert.equal(out.entry.startedAt, '2026-10-18T01:55:00.000Z');
  }
  const history = f.store.history('novaspace','Soul');
  assert.deepEqual(history.map(e => e.actor.channel), ['web','local_connector','cloud_connector']);
  assert.equal(f.notes.get('1').text, 'web'); assert.equal(f.calls(),3);
});
test('Tenant and user history queries preserve separation', async t => {
  const f = fixture(); t.after(() => f.db.close());
  await f.execute();
  await f.execute('basti', { requestId: REQUEST.slice(0,-1)+'c', resource: { type:'note',id:'2' } });
  await f.execute('other-tenant', { resource: { type:'note',id:'2' } });
  assert.deepEqual(f.store.history('novaspace','Soul').map(e=>e.actor.ownerUid), ['Soul']);
  assert.equal(f.store.history('novaspace','OtherUser').length,1);
  assert.equal(f.store.history('another-tenant','OtherUser').length,1);
});
test('Another user cannot mutate Soul resource despite matching write scope', async t => {
  const f=fixture();t.after(()=>f.db.close());const out=await f.execute('basti');
  assert.equal(out.entry.state,'denied');assert.equal(out.entry.code,'RESOURCE_FORBIDDEN');
  assert.equal(f.calls(),0);assert.equal(f.notes.get('1').text,'before');
});
test('Body identity/connection/owner overrides and unknown command fields fail before mutation', async t => {
  const f=fixture();t.after(()=>f.db.close());
  for(const extra of [{actor:{ownerUid:'Soul'}},{ownerUid:'Soul'},{connectionId:'web'},{channel:'web'}]) await assert.rejects(f.execute('basti',extra),/INVALID_COMMAND/);
  assert.equal(f.calls(),0);assert.equal(f.store.history('novaspace','OtherUser').length,0);
});
test('Unknown, wrong-subject, client, audience, connection and revision bindings are rejected', async t => {
  const f=fixture();t.after(()=>f.db.close());const original={...f.auth.get('test-cloud')};
  for(const extra of [{connectionId:'missing'},{subject:'account:OtherUser'},{clientId:'another-client'},{audience:'https://evil.example'},{revision:2}]) {
    f.auth.set('test-cloud',{...original,...extra});await assert.rejects(f.execute(),/CONNECTION_/);
  }assert.equal(f.calls(),0);
});
test('Both credential and connection scopes are required; an expanded token cannot grant itself rights', async t => {
  const f=fixture();t.after(()=>f.db.close());
  f.auth.get('test-cloud').scopes=[];await assert.rejects(f.execute(),/INSUFFICIENT_SCOPE/);
  f.auth.get('test-cloud').scopes=['notes:write'];
  f.db.prepare('UPDATE nf_platform_connections SET scopes_json = ? WHERE id = ?').run('[]','cloud');
  await assert.rejects(f.execute(),/INSUFFICIENT_SCOPE/);assert.equal(f.calls(),0);
});
test('Expired credentials and revoked connections fail on the next request', async t => {
  const f=fixture();t.after(()=>f.db.close());
  f.clock(NOW+60000);await assert.rejects(f.execute(),/CREDENTIAL_EXPIRED/);f.clock(NOW);
  assert.equal(f.store.revoke('novaspace','OtherUser','cloud',new Date(NOW).toISOString()),false);
  assert.equal(f.store.revoke('novaspace','Soul','cloud',new Date(NOW).toISOString()),true);
  await assert.rejects(f.execute(),/CONNECTION_REVOKED/);assert.equal(f.calls(),0);
});
test('Revocation during initial lookup blocks the pending operation before a reservation', async t => {
  const f=fixture();t.after(()=>f.db.close());let reads=0;
  f.deps.connection=async id=>{const c=await f.store.connection(id);if(++reads===1)f.store.revoke('novaspace','Soul',id,new Date(NOW).toISOString());return c;};
  await assert.rejects(f.execute(),/CONNECTION_REVOKED/);assert.equal(f.calls(),0);assert.equal(f.store.history('novaspace','Soul').length,0);
});
test('Revocation after reservation is recorded as denied without executing the write', async t => {
  const f=fixture();t.after(()=>f.db.close());f.deps.journal={
    reserve:async e=>{const r=await f.store.reserve(e);f.store.revoke('novaspace','Soul','cloud',new Date(NOW).toISOString());return r;},complete:e=>f.store.complete(e)};
  const out=await f.execute();assert.equal(out.entry.state,'denied');assert.equal(out.entry.code,'CONNECTION_REVOKED');assert.equal(f.calls(),0);
});
test('Matching retry returns the same completed action without repeating mutation', async t => {
  const f=fixture();t.after(()=>f.db.close());const first=await f.execute();const second=await f.execute();
  assert.equal(second.replayed,true);assert.deepEqual(first.entry,second.entry);assert.equal(f.calls(),1);
});
test('Request reuse with different input, object, action or connection conflicts', async t => {
  const f=fixture();t.after(()=>f.db.close());await f.execute();
  f.deps.operations.set('note.rename',f.operation);
  for(const [id,extra] of [['cloud',{input:{text:'changed'}}],['cloud',{resource:{type:'note',id:'2'}}],['cloud',{action:'note.rename'}],['local',{}]]) await assert.rejects(f.execute(id,extra),/REQUEST_ID_CONFLICT/);
  assert.equal(f.calls(),1);
});
test('Replay checks current resource rights before returning event details', async t => {
  const f=fixture();t.after(()=>f.db.close());await f.execute();f.notes.get('1').owner='OtherUser';
  await assert.rejects(f.execute(),/RESOURCE_FORBIDDEN/);assert.equal(f.calls(),1);
});
test('Concurrent duplicate requests execute the native mutation once', async t => {
  const f=fixture();t.after(()=>f.db.close());let release,started;const entered=new Promise(r=>{started=r;});const barrier=new Promise(r=>{release=r;});
  const original=f.operation.mutate;f.operation.mutate=async(...args)=>{started();await barrier;return original(...args);};
  const first=f.execute();await entered;const second=await f.execute();
  assert.equal(second.entry.state,'reserved');assert.equal(second.replayed,true);release();
  assert.equal((await first).entry.state,'succeeded');assert.equal(f.calls(),1);
});
test('Missing journal reservation stops the operation before the native write', async t => {
  const f=fixture();t.after(()=>f.db.close());f.deps.journal={reserve:async()=>{throw Error('secret database connection string');},complete:()=>{throw Error('never');}};
  await assert.rejects(f.execute(),e=>e.code==='JOURNAL_UNAVAILABLE'&&!e.message.includes('secret'));assert.equal(f.calls(),0);
});
test('Completion journal failure stays unknown; durable pending reservation blocks repeats', async t => {
  const f=fixture();t.after(()=>f.db.close());f.deps.journal={reserve:e=>f.store.reserve(e),complete:async()=>{throw Error('offline');}};
  const out=await f.execute();assert.equal(out.entry.state,'unknown');assert.equal(out.journalRecorded,false);
  assert.equal(out.retryMutation,false);assert.equal(out.mayHaveChanged,true);assert.equal(f.store.history('novaspace','Soul')[0].state,'reserved');
  assert.equal((await f.execute()).entry.state,'reserved');assert.equal(f.calls(),1);
});
test('Lost native reply after a possible mutation is unknown and never auto-retried', async t => {
  const f=fixture();t.after(()=>f.db.close());let attempts=0;
  f.operation.mutate=async()=>{++attempts;f.notes.get('1').text='written';throw Error('timeout with private payload');};
  const out=await f.execute();assert.equal(out.entry.state,'unknown');assert.equal(out.journalRecorded,true);
  assert.equal(out.entry.code,'MUTATION_OUTCOME_UNKNOWN');assert.equal(out.retryMutation,false);
  await f.execute();assert.equal(attempts,1);assert.equal(JSON.stringify(out).includes('private payload'),false);
});
test('Definitively uncommitted operation is failed, and unsuccessful readback is unknown', async t => {
  for(const [result,expected] of [[{outcome:'not_committed',verification:'unverified',changedFields:[]},'failed'],[{outcome:'committed',verification:'changed_afterwards',changedFields:['text']},'unknown'],[{outcome:'unknown',verification:'unverified',changedFields:[]},'unknown']]) {
    const f=fixture();t.after(()=>f.db.close());f.operation.mutate=async()=>result;const out=await f.execute();assert.equal(out.entry.state,expected);
  }
});
test('Create readback retains both request reference and actual created object ID', async t => {
  const f=fixture();t.after(()=>f.db.close());f.operation.mutate=async()=>({outcome:'committed',verification:'verified',resource:{type:'note',id:'new-id-7'},changedFields:['text']});
  const out=await f.execute();assert.deepEqual(out.entry.resource,{type:'note',id:'1'});assert.deepEqual(out.entry.resultResource,{type:'note',id:'new-id-7'});
});
test('No raw credential, input content, model assertion or arbitrary error text is persisted', async t => {
  const f=fixture();t.after(()=>f.db.close());await f.execute('cloud',{input:{text:'private-body-not-for-journal',claimedModel:'model-self-report'}});
  const encoded=JSON.stringify(f.store.history('novaspace','Soul'));
  for(const forbidden of ['test-cloud','private-body-not-for-journal','claimedModel','model-self-report'])assert.equal(encoded.includes(forbidden),false);
  assert.deepEqual(f.store.history('novaspace','Soul')[0].changedFields,['text']);
});
test('Caller mutation during async authentication does not change the intent executed', async t => {
  const f=fixture();t.after(()=>f.db.close());const c=f.command();const pending=createPlatformFoundation(f.deps).execute(f.request('cloud'),c);
  c.input.text='mutated-after-call';c.resource.id='2';await pending;assert.equal(f.notes.get('1').text,'after');assert.equal(f.notes.get('2').text,'before');
});
test('Canonical intent binds JSON values while ignoring object key order and rejecting non-JSON/large values', () => {
  assert.equal(canonicalIntent({b:2,a:1}),canonicalIntent({a:1,b:2}));
  const cycle={};cycle.self=cycle;
  for(const value of [cycle,undefined,NaN,Infinity,new Date(),{a:undefined},Object.defineProperty({},'a',{get(){return 1;},enumerable:true}),new Array(2),{text:'x'.repeat(131073)}])assert.throws(()=>canonicalIntent(value),/INVALID_JSON_INPUT|INPUT_TOO_LARGE/);
});
test('Terminal journal rows cannot be rewritten, deleted or reassigned even through direct SQL', async t => {
  const f=fixture();t.after(()=>f.db.close());await f.execute();
  assert.throws(()=>f.db.exec("UPDATE nf_platform_actions SET state='failed'"),/immutable/);
  assert.throws(()=>f.db.exec('DELETE FROM nf_platform_actions'),/cannot be deleted/);
  assert.equal(f.store.history('novaspace','Soul')[0].state,'succeeded');
});
test('Durable reservation survives reopening the database and still prevents another mutation', async () => {
  const dir=mkdtempSync(join(tmpdir(),'nf-platform-'));const path=join(dir,'reference.sqlite');let db;
  try {
    const f=fixture(path);db=f.db;f.deps.journal={reserve:e=>f.store.reserve(e),complete:async()=>{throw Error('simulated process loss');}};await f.execute();db.close();db=null;
    const g=fixture(path,false);db=g.db;g.auth.set('test-cloud',{connectionId:'cloud',subject:'account:Soul',clientId:'client-cloud',audience:'https://connector.example.test/platform',scopes:['notes:write'],revision:1,expiresAt:NOW+60000});
    const out=await g.execute();assert.equal(out.replayed,true);assert.equal(out.entry.state,'reserved');assert.equal(g.calls(),0);
  } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
});
test('Native adapter rechecks an object moved to another owner after preliminary authorization', async t => {
  const f=fixture();t.after(()=>f.db.close());const original=f.operation.allowed;
  f.operation.allowed=async(...args)=>{const allowed=await original(...args);f.notes.get('1').owner='OtherUser';return allowed;};
  const out=await f.execute();assert.equal(out.entry.state,'failed');assert.equal(f.notes.get('1').text,'before');
});
test('A credential expiring after reservation is denied before mutation', async t => {
  const f=fixture();t.after(()=>f.db.close());f.deps.journal={reserve:async e=>{const out=await f.store.reserve(e);f.clock(NOW+60000);return out;},complete:e=>f.store.complete(e)};
  const out=await f.execute();assert.equal(out.entry.code,'CREDENTIAL_EXPIRED');assert.equal(out.entry.state,'denied');assert.equal(f.calls(),0);
});
test('A mismatching journal readback is never presented as verified success', async t => {
  const f=fixture();t.after(()=>f.db.close());f.deps.journal={reserve:e=>f.store.reserve(e),complete:async e=>({...await f.store.complete(e),code:'WRONG'})};
  const out=await f.execute();assert.equal(out.entry.state,'unknown');assert.equal(out.journalRecorded,false);assert.equal(out.retryMutation,false);
  f.deps.journal=f.store;assert.equal((await f.execute()).entry.state,'succeeded');assert.equal(f.calls(),1);
});
test('Pending action identity cannot be moved to another connection by the store', async t => {
  const f=fixture();t.after(()=>f.db.close());f.deps.journal={reserve:e=>f.store.reserve(e),complete:async()=>{throw Error('process lost');}};await f.execute();
  assert.throws(()=>f.db.exec("UPDATE nf_platform_actions SET connection_id='web'"),/identity is immutable/);
});
test('Ambiguous input arrays and unknown operations are rejected without a native call', async t => {
  const f=fixture();t.after(()=>f.db.close());const values=[];
  const getter=[1];Object.defineProperty(getter,'0',{get(){throw Error('do not execute getters');},enumerable:true});values.push(getter);
  const sparse=new Array(1);sparse.extra=1;values.push(sparse);
  const symbol=[1];symbol[Symbol('hidden')]=1;values.push(symbol);
  for(const input of values)await assert.rejects(f.execute('cloud',{input}),/INVALID_JSON_INPUT/);
  await assert.rejects(f.execute('cloud',{action:'not.registered'}),/UNKNOWN_OPERATION/);assert.equal(f.calls(),0);
});
