// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createMcpHandler} from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export {localServer} from './src/local';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/task-lists-local.mjs'});
const api=await import('../.sites-runtime/test/task-lists-local.mjs');
const saved=globalThis.fetch;after(()=>globalThis.fetch=saved);
async function rpc(scopes,groups,method,params){
 const handler=createMcpHandler(()=>api.localServer(scopes,groups),{legacy:'stateless',responseMode:'json'});
 const r=await handler.fetch(new Request('https://fixture.test',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const text=await r.text();return JSON.parse(r.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').find(x=>x.startsWith('data:')).slice(5):text).result;
}
const tools=['tasks_read_list_settings','tasks_create_list','tasks_update_list'];
test('Personal Tasks group offers all three additions and no other group silently includes them',async()=>{
 const yes=await rpc(['calendar:read'],['tasks'],'tools/list',{}),no=await rpc(['calendar:read'],['calendar','files','contacts'],'tools/list',{});
 assert.equal(yes.tools.length,12);for(const name of tools){assert.ok(yes.tools.some(t=>t.name===name),name);assert.ok(!no.tools.some(t=>t.name===name),name);}
 for(const t of yes.tools)assert.ok(t.name.startsWith('tasks_')||['nextcloud_account','nextcloud_capabilities','novaspace_connector_help'].includes(t.name));
});
test('Personal metadata tools enforce each task scope before native access',async()=>{
 let requests=0;globalThis.fetch=async()=>{requests++;throw Error('Unexpected native access');};
 const args={listPath:'/remote.php/dav/calendars/Soul/my-tasks/',listId:'stable-new-tasks',title:'Neu',expectedAccount:'Soul',expectedVersion:'a'.repeat(64),expectedCollectionVersion:'a'.repeat(64)};
 for(const[name,input,required]of [[tools[0],{},['tasks:read']],[tools[1],{listId:args.listId,title:args.title,expectedAccount:args.expectedAccount,expectedCollectionVersion:args.expectedCollectionVersion},['tasks:read','tasks:write']],[tools[2],{listPath:args.listPath,title:args.title,expectedAccount:args.expectedAccount,expectedVersion:args.expectedVersion},['tasks:read','tasks:write']]])for(const missing of required){const r=await rpc(['calendar:read',...required.filter(s=>s!==missing)],['tasks'],'tools/call',{name,arguments:input});assert.equal(r.isError,true,name);assert.match(JSON.stringify(r),new RegExp(missing));}
 assert.equal(requests,0);
});
test('Personal help explains ownership, pure lists and uncertainty in the new candidate version',async()=>{
 const r=await rpc(['calendar:read'],['tasks'],'tools/call',{name:'novaspace_connector_help',arguments:{}});
 assert.equal(r.structuredContent.version,'1.35.1-local.1');assert.equal(r.structuredContent.taskListFunctions.length,4);assert.match(JSON.stringify(r.structuredContent.taskListFunctions),/Technisches Konto/);assert.match(JSON.stringify(r.structuredContent.taskListFunctions),/Keine Listenlöschung/);assert.match(JSON.stringify(r.structuredContent.taskListFunctions),/nicht erneut anlegen/);
});
