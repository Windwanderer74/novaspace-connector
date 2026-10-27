// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export { createDeckMcpServer } from './lib/mcp'; export { setDeckRuntimeConfig } from './lib/runtime-config';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/deck-lifecycle.mjs'});
const api=await import('../.sites-runtime/test/deck-lifecycle.mjs');
const { createMcpHandler }=await import('@modelcontextprotocol/server');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service',NEXTCLOUD_APP_PASSWORD:'test-only'});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const ids={boardId:10,stackId:33,cardId:331};
const original={id:331,stackId:33,title:'Workflow test',description:'Keep text and calendar link',type:'plain',owner:{uid:'ChatGPT'},order:7,duedate:'2026-09-25T12:00:00Z',done:null,archived:false};
let card,requests,fault;
function reset(){card=structuredClone(original);requests=[];fault=undefined;}
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 requests.push({url,init});
 assert.ok(url.startsWith('https://cloud.example.test/index.php/apps/deck/api/v1.0/'));
 if(url.endsWith('/stacks'))return Response.json([{id:33,boardId:10,title:'In Arbeit',order:0}]);
 assert.ok(url.endsWith('/boards/10/stacks/33/cards/331'));
 if(init.method==='PUT'){
  const update=JSON.parse(init.body);
  if(fault==='ignore-archive')delete update.archived;
  if(fault==='change-due')update.duedate=null;
  if(fault==='change-done')update.done='2026-09-17T20:00:00Z';
  if(fault==='change-type')update.type='other';
  if(fault==='change-owner')update.owner='other';
  if(fault==='change-order')update.order=999;
  card={...card,...update};
 }
 return Response.json(card);
};
async function call(name,args,scopes=['deck:read','deck:write']){
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'test',clientId:'test',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const body=await response.text();const value=response.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(r=>r.id===1):JSON.parse(body);assert.ok(value.result,body);return value.result;
}
test('Done/open and archive/reactivate are independent and preserve task, due date and links',async()=>{
 reset();const done='2026-09-17T20:00:00Z';
 for(const patch of [{archived:true},{archived:false},{done},{archived:true},{archived:false},{done:null}]){
  const before=structuredClone(card);const r=await call('update_card',{...ids,...patch});assert.equal(r.isError,undefined,JSON.stringify(r));
  assert.equal(card.archived,patch.archived??before.archived);assert.equal(card.done,patch.done===undefined?before.done:patch.done);
  for(const k of ['id','stackId','title','description','duedate','order'])assert.deepEqual(card[k],original[k],k);
  const read=await call('fetch',{id:'card:10:33:331'});assert.equal(read.structuredContent.metadata.archived,card.archived);assert.equal(read.structuredContent.metadata.done,card.done);assert.equal(read.structuredContent.description,original.description);
 }
 assert.equal(requests.filter(r=>r.init.method==='PUT').length,6);
});
test('Readback rejects ignored archive changes and altered omitted fields',async()=>{
 for(const error of ['ignore-archive','change-due','change-done','change-type','change-owner','change-order']){
  reset();fault=error;const r=await call('update_card',{...ids,archived:true});assert.equal(r.isError,true);assert.match(JSON.stringify(r),/nicht bestätigt/);
 }
});
test('Archive writes require deck:write and reject nonboolean input without upstream access',async()=>{
 reset();let r=await call('update_card',{...ids,archived:true},['deck:read']);assert.equal(r.isError,true);assert.equal(requests.length,0);
 r=await call('update_card',{...ids,archived:'false'});assert.equal(r.isError,true);assert.equal(requests.length,0);
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});
test('A stale stack returned by Deck is rejected before PUT can move the card',async()=>{
 reset();card.stackId=34;
 const r=await call('update_card',{...ids,description:'New documentation'});
 assert.equal(r.isError,true);
 assert.match(JSON.stringify(r),/Listenkennung ist veraltet/);
 assert.equal(requests.filter(r=>r.init.method==='PUT').length,0);
 assert.equal(card.stackId,34);
 assert.equal(card.description,original.description);
});
