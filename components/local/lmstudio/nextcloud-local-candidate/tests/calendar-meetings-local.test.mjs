// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createMcpHandler} from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export {localServer,ALL_SCOPES} from './src/local';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/calendar-meetings-local.mjs'});
const api=await import('../.sites-runtime/test/calendar-meetings-local.mjs');
const original=globalThis.fetch;after(()=>globalThis.fetch=original);
async function rpc(scopes,groups,method,params){
 const handler=createMcpHandler(()=>api.localServer(scopes,groups),{legacy:'stateless',responseMode:'json'});
 const r=await handler.fetch(new Request('https://fixture.test',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const text=await r.text();return JSON.parse(r.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').find(x=>x.startsWith('data:')).slice(5):text).result;
}
test('Organizer contracts stay in Calendar; personal catalogue retains every required scope',async()=>{
 const r=await rpc([...api.ALL_SCOPES],['calendar'],'tools/list',{}),names=r.tools.map(t=>t.name);
 for(const name of ['calendar_prepare_meeting','calendar_submit_meeting'])assert.ok(names.includes(name));
 assert.deepEqual(new Set(r.tools.find(t=>t.name==='calendar_submit_meeting')._meta['novaforge/localScopes']),new Set(['calendar:read','calendar:write','calendar:organize']));
 const other=await rpc([...api.ALL_SCOPES],['deck','tasks'],'tools/list',{});
 assert.ok(!other.tools.some(t=>['calendar_prepare_meeting','calendar_submit_meeting'].includes(t.name)));
});
test('Legacy replies and each partial organizer grant deny the real local handler before native access',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not connect')};
 const args={action:'cancel',calendarPath:'/remote.php/dav/calendars/Soul/personal/',eventPath:'/remote.php/dav/calendars/Soul/personal/test.ics',expectedAccount:'Soul',expectedUid:'meeting',organizerAddress:'soul@example.test',etag:'"v1"',preparedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),expectedProposalVersion:'a'.repeat(64),acknowledgeNativeScheduling:true};
 const required=['calendar:organize','calendar:write','calendar:read'];
 for(const missing of required){const scopes=[...required.filter(s=>s!==missing),'calendar:schedule'];const r=await rpc(scopes,['calendar'],'tools/call',{name:'calendar_submit_meeting',arguments:args});assert.equal(r.isError,true);assert.match(JSON.stringify(r),new RegExp(missing));}
 assert.equal(calls,0);
});
test('Personal help explains separate organizer consent and uncertain native delivery',async()=>{
 const r=await rpc(['calendar:read'],[],'tools/call',{name:'novaspace_connector_help',arguments:{}}),help=JSON.stringify(r.structuredContent.calendarInvitationFunctions);
 assert.equal(r.structuredContent.version,'1.36.0-local.1');
 for(const text of ['calendar:organize','calendar:schedule','acknowledgeNativeScheduling=false','Absage entfernt das Original','unknown nie automatisch wiederholen'])assert.ok(help.includes(text),text);
});
