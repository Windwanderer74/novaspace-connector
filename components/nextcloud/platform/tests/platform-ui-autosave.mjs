// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const box={module:{exports:{}},setTimeout,clearTimeout,URLSearchParams,AbortController,fetch};
vm.runInNewContext(fs.readFileSync('app/js/connections-autosave.js','utf8'),box);
const {createSaveQueue,verifyReceipt,encodeAttempt,sendAttempt}=box.module.exports;
const copy=x=>JSON.parse(JSON.stringify(x));
const conn='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const id=n=>`bbbbbbbb-bbbb-4bbb-bbbb-${String(n).padStart(12,'0')}`;
const initial=()=>({enabled:'1',apps:{deck:'write',inventory:'write'},areas:{deckTrash:'off'},catalogue:'c'.repeat(64),allowedTools:['read_card','update_card']});
function ack(a,n=2){return {committed:true,connectionId:conn,requestId:a.requestId,revision:a.revision+1,nextRequestId:id(n),accessPolicy:{version:2,configured:true,enabled:a.selection.enabled==='1',apps:copy(a.selection.apps),functions:{version:1,catalogue:a.selection.catalogue,areas:{deck:a.selection.apps.deck,...a.selection.areas},allowedTools:[...a.selection.allowedTools,'inventory_legacy']}}};}
const tick=async()=>{for(let n=0;n<6;n++)await Promise.resolve();};
function fixture(){
 let current=initial(),timer=null;const sent=[],states=[],confirmed=[];
 const queue=createSaveQueue({connectionId:conn,visibleTools:current.allowedTools,revision:1,requestId:id(1),read:()=>current,
 send:a=>new Promise((resolve,reject)=>sent.push({a,resolve,reject})),confirm:r=>confirmed.push(r),onState:(s,m)=>states.push([s,m]),
 schedule:f=>{timer=f;return 1;},cancel:()=>{timer=null;}});
 return {queue,sent,states,confirmed,get current(){return current;},set current(v){current=v;},flush:async()=>{const f=timer;timer=null;if(f)f();await tick();},state:()=>states.at(-1)[0]};
}
let count=0;async function test(name,fn){await fn();count++;console.log('OK: '+name);}
await test('Rapid edits coalesce into a single immutable request after the pause',async()=>{
 const f=fixture();f.current.enabled='0';f.queue.changed();f.current.apps.deck='read';f.queue.changed();assert.equal(f.sent.length,0);await f.flush();assert.equal(f.sent.length,1);assert.equal(f.sent[0].a.selection.enabled,'0');assert.equal(f.sent[0].a.selection.apps.deck,'read');assert.equal(f.state(),'saving');
 f.sent[0].resolve(ack(f.sent[0].a));await tick();assert.equal(f.state(),'saved');assert.equal(f.queue.dirty(),false);
});
await test('One in-flight request per connection; later edit uses confirmed revision and fresh nonce',async()=>{
 const f=fixture();f.current.enabled='0';f.queue.changed();await f.flush();f.current.apps.deck='off';f.queue.changed();await f.flush();assert.equal(f.sent.length,1);
 f.sent[0].resolve(ack(f.sent[0].a));await tick();assert.equal(f.state(),'pending');await f.flush();assert.equal(f.sent.length,2);assert.equal(f.sent[1].a.revision,2);assert.equal(f.sent[1].a.requestId,id(2));assert.equal(f.sent[1].a.selection.apps.deck,'off');
 f.sent[1].resolve(ack(f.sent[1].a,3));await tick();assert.equal(f.state(),'saved');
});
await test('Reverting to baseline during an in-flight save queues a confirmed restoration',async()=>{
 const f=fixture();f.current.enabled='0';f.queue.changed();await f.flush();f.current=initial();f.queue.changed();assert.equal(f.queue.dirty(),true);
 f.sent[0].resolve(ack(f.sent[0].a));await tick();await f.flush();assert.equal(f.sent[1].a.selection.enabled,'1');f.sent[1].resolve(ack(f.sent[1].a,3));await tick();assert.equal(f.queue.dirty(),false);
});
await test('Unknown outcome requires explicit retry with identical payload and nonce before newer edits',async()=>{
 const f=fixture();f.current.enabled='0';f.queue.changed();await f.flush();const original=copy(f.sent[0].a);f.sent[0].reject(new Error('Connection lost'));await tick();assert.equal(f.state(),'error');assert.equal(f.queue.dirty(),true);
 f.current.apps.deck='off';f.queue.changed();await f.flush();assert.equal(f.sent.length,1);void f.queue.save();await tick();assert.equal(JSON.stringify(f.sent[1].a),JSON.stringify(original));
 f.sent[1].resolve(ack(f.sent[1].a));await tick();await f.flush();assert.equal(f.sent[2].a.selection.apps.deck,'off');f.sent[2].resolve(ack(f.sent[2].a,3));await tick();assert.equal(f.state(),'saved');
});
await test('Wrong identity, nonce, revision, policy or malformed JSON never confirms saved',async()=>{
 const a={revision:1,requestId:id(1),selection:initial()};
 for(const mutate of [r=>r.committed=false,r=>r.connectionId=id(9),r=>r.requestId=id(9),r=>r.revision=4,r=>r.nextRequestId=id(1),r=>r.accessPolicy.enabled=false,r=>r.accessPolicy.apps.deck='off',r=>r.accessPolicy.functions.areas.deck='off',r=>r.accessPolicy.functions.allowedTools=[],r=>r.accessPolicy.functions.catalogue='old']){const r=ack(a);mutate(r);assert.equal(verifyReceipt(r,a,conn,a.selection.allowedTools),false);}
 const f=fixture();f.current.enabled='0';f.queue.changed();await f.flush();f.sent[0].resolve({});await tick();assert.equal(f.state(),'error');assert.equal(f.confirmed.length,0);
});
await test('Version conflict stops retries and preserves visible edits for review',async()=>{
 const f=fixture();f.current.enabled='0';f.queue.changed();await f.flush();f.sent[0].reject(Object.assign(new Error('Reload'),{outcome:'conflict'}));await tick();assert.equal(f.state(),'conflict');f.current.apps.deck='off';f.queue.changed();void f.queue.save();await f.flush();assert.equal(f.sent.length,1);assert.equal(f.current.apps.deck,'off');assert.equal(f.queue.dirty(),true);
});
await test('Revert before the pause makes no write; separate connections do not share state',async()=>{
 const f=fixture(),g=fixture();f.current.enabled='0';f.queue.changed();f.current=initial();f.queue.changed();await f.flush();assert.equal(f.sent.length,0);g.current.apps.deck='off';g.queue.changed();await g.flush();assert.equal(g.sent.length,1);assert.equal(f.state(),'saved');
});
await test('Transport sends same-origin CSRF POST and serializes exact unchecked selection',async()=>{
 const a={revision:1,requestId:id(1),selection:initial()};a.selection.allowedTools=[];const b=encodeAttempt(a,'csrf');assert.equal(b.get('requesttoken'),'csrf');assert.equal(b.getAll('allowedTools[]').length,0);assert.equal(b.get('areas[deckTrash]'),'off');
 const r=await sendAttempt('/async',a,'csrf',async(url,o)=>{assert.equal(url,'/async');assert.equal(o.method,'POST');assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');assert.equal(o.headers.requesttoken,'csrf');return {ok:true,json:async()=>ack(a)};});assert.equal(r.committed,true);
 await assert.rejects(sendAttempt('/async',a,'csrf',async()=>{throw new Error('Raw network internals');}),e=>e.message==='Keine bestätigte Antwort. Verbindung prüfen und erneut versuchen.');
 await assert.rejects(sendAttempt('/async',a,'csrf',async()=>({ok:false,status:409,json:async()=>({message:'Reload'})})),e=>e.outcome==='conflict');
});
console.log(`PASS: ${count} autosave queue, acknowledgement and transport tests.`);
