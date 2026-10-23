// SPDX-License-Identifier: AGPL-3.0-or-later
// Copied into the prepared core's tests directory by prepare.py.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createMcpHandler} from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export {localServer,configureCredentials,validateConfig} from './src/local';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/planning-local.mjs'});
const api=await import('../.sites-runtime/test/planning-local.mjs');
const previousFetch=globalThis.fetch;after(()=>globalThis.fetch=previousFetch);
async function rpc(scopes,groups,method,params){
 const h=createMcpHandler(()=>api.localServer(scopes,groups),{legacy:'stateless',responseMode:'json'});
 const r=await h.fetch(new Request('https://fixture.test',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const text=await r.text();return JSON.parse(r.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').find(x=>x.startsWith('data:')).slice(5):text).result;
}
test('Notes group is isolated and missing explicit notes:write denies creation before network',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected native request');};
 const scopes=['calendar:read','notes:read'];
 const list=await rpc(scopes,['notes'],'tools/list',{});
 assert.ok(list.tools.some(t=>t.name==='notes_read'));
 assert.ok(list.tools.every(t=>/^(notes_|nextcloud_|novaspace_connector_help$)/.test(t.name)));
 const r=await rpc(scopes,['notes'],'tools/call',{name:'notes_create',arguments:{title:'Test',content:'Text',expectedAccount:'Soul'}});
 assert.equal(r.isError,true);assert.equal(calls,0);assert.match(JSON.stringify(r),/notes:write/);
 const old=await rpc(scopes,['deck','files','calendar'],'tools/list',{});
 assert.ok(old.tools.every(t=>!t.name.startsWith('notes_')));
});
test('Personal Notes read uses the shared native API and explicit local read scope',async()=>{
 const c=api.validateConfig({baseUrl:'https://cloud.example.invalid',expectedUser:'Soul',scopes:['calendar:read','notes:read']});
 api.configureCredentials(c,{NC_MCP_URL:c.baseUrl,NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'test-only'});
 let calls=0;globalThis.fetch=async(url,o)=>{calls++;assert.equal(o.redirect,'manual');assert.match(String(url),/\/apps\/notes\/api\/v1\/notes\/8$/);return Response.json({id:8,title:'Persönlich',content:'Text',category:'',favorite:false,readonly:false,etag:'v1'},{headers:{'X-Notes-API-Versions':'1.4'}});};
 const r=await rpc(c.scopes,['notes'],'tools/call',{name:'notes_read',arguments:{id:8}});
 assert.equal(r.isError,undefined);assert.equal(r.structuredContent.note.title,'Persönlich');assert.equal(calls,1);
});

test('Tasks and Contacts have isolated local groups and require explicit new scopes before native data access',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected native request');};
 for(const [area,readTool,readArgs,writeTool,writeArgs] of [
  ['tasks','tasks_read',{listPath:'/known/',taskPath:'/known/task.ics'},'tasks_create',{listPath:'/known/',taskId:'stable-task-1',title:'Test',expectedAccount:'Soul'}],
  ['contacts','contacts_read',{addressBookPath:'/known/',contactPath:'/known/contact.vcf'},'contacts_create',{addressBookPath:'/known/',contactId:'stable-contact-1',displayName:'Test',expectedAccount:'Soul'}]
 ]) {
  const list=await rpc(['calendar:read'],[area],'tools/list',{});
  assert.ok(list.tools.some(t=>t.name===readTool));assert.ok(list.tools.every(t=>t.name.startsWith(area+'_')||/^(nextcloud_|novaspace_connector_help$)/.test(t.name)));
  assert.equal((await rpc(['calendar:read'],[area],'tools/call',{name:readTool,arguments:readArgs})).isError,true);
  assert.equal((await rpc(['calendar:read',area+':read'],[area],'tools/call',{name:writeTool,arguments:writeArgs})).isError,true);
 }
 assert.equal(calls,0);
});
