// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createMcpHandler } from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: "export {localServer} from './src/local';export {ALL_SCOPES} from './src/local';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/deck-shares-local.mjs' });
const api = await import('../.sites-runtime/test/deck-shares-local.mjs');
const oldFetch = globalThis.fetch; after(() => globalThis.fetch = oldFetch);
const names = ['deck_read_board_shares','deck_create_board_share','deck_update_board_share','deck_revoke_board_share'];
async function rpc(scopes,groups,method,params) {
 const handler=createMcpHandler(()=>api.localServer(scopes,groups),{legacy:'stateless',responseMode:'json'});
 const r=await handler.fetch(new Request('https://fixture.test',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const t=await r.text();return JSON.parse(r.headers.get('content-type')?.includes('text/event-stream')?t.split('\n').find(x=>x.startsWith('data:')).slice(5):t).result;
}
test('Personal Deck group offers four guarded ACL tools; other groups do not silently include them',async()=>{
 const deck=await rpc([...api.ALL_SCOPES],['deck'],'tools/list',{});for(const n of names)assert.ok(deck.tools.some(t=>t.name===n),n);
 for(const group of ['files','notes','calendar','tasks','contacts']){const r=await rpc([...api.ALL_SCOPES],[group],'tools/list',{});assert.ok(!r.tools.some(t=>names.includes(t.name)),group);}
});
test('Personal ACL mutation requires deck:share and deck:read before any native call',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No native access expected');};
 const guard={boardId:5,expectedAccount:'Soul',expectedBoardVersion:'a'.repeat(64),expectedSharesVersion:'b'.repeat(64),recipientType:'user',recipientId:'Chosen'};
 const inputs=[{...guard,permissionEdit:false,permissionShare:false,permissionManage:false,acknowledgeBoardAccess:true},{...guard,shareId:10,permissionEdit:true},{...guard,shareId:10,acknowledgeAssignmentRemoval:true}];
 for(let i=1;i<names.length;i++)for(const missing of ['deck:share','deck:read']){const r=await rpc(['calendar:read',...['deck:share','deck:read'].filter(s=>s!==missing)],['deck'],'tools/call',{name:names[i],arguments:inputs[i-1]});assert.equal(r.isError,true,names[i]);assert.match(JSON.stringify(r),new RegExp(missing));}
 assert.equal(calls,0);
});
test('Personal help explains the new explicit scope and native assignment-removal effect',async()=>{
 const r=await rpc(['calendar:read'],[],'tools/call',{name:'novaspace_connector_help',arguments:{}});assert.equal(r.structuredContent.version,'1.35.1-local.1');assert.match(JSON.stringify(r.structuredContent.deckShareFunctions),/deck:share/);assert.match(JSON.stringify(r.structuredContent.deckShareFunctions),/Kartenzuständigkeiten/);
});
