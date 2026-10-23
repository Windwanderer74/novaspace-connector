// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createMcpHandler} from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export {localServer} from './src/local';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/contact-local.mjs'});
const api=await import('../.sites-runtime/test/contact-local.mjs');
const saved=globalThis.fetch;after(()=>globalThis.fetch=saved);
async function rpc(scopes,groups,method,params){
 const handler=createMcpHandler(()=>api.localServer(scopes,groups),{legacy:'stateless',responseMode:'json'});
 const r=await handler.fetch(new Request('https://fixture.test',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const text=await r.text();return JSON.parse(r.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').find(x=>x.startsWith('data:')).slice(5):text).result;
}
const names=['contacts_read_addressbook_settings','contacts_create_addressbook','contacts_update_addressbook','contacts_export_vcf','contacts_prepare_vcf_import','contacts_import_vcf'];
test('All six contact additions share the personal source and remain isolated to the contacts group',async()=>{
 const a=await rpc(['calendar:read'],['contacts'],'tools/list',{}),b=await rpc(['calendar:read'],['calendar','files','notes'],'tools/list',{});
 for(const name of names){assert.ok(a.tools.some(t=>t.name===name),name);assert.ok(!b.tools.some(t=>t.name===name),name);}
 assert.equal(a.tools.length,15);for(const t of a.tools)assert.ok(t.name.startsWith('contacts_')||['nextcloud_account','nextcloud_capabilities','novaspace_connector_help'].includes(t.name));
});
test('Personal cross-app exchange enforces every extra scope before native access',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected native request');};
 const ref={addressBookPath:'/remote.php/dav/addressbooks/users/Soul/contacts/',contactId:'import-one',expectedAccount:'Soul',sourcePath:'/Import.vcf',fileId:'9',etag:'"f1"'};
 const cases=[['contacts_export_vcf',{addressBookPath:ref.addressBookPath,contactPath:ref.addressBookPath+'one.vcf',expectedAccount:'Soul',expectedUid:'one',etag:'"v1"',destination:'/Export.vcf'},['contacts:read','files:read','files:write']],['contacts_prepare_vcf_import',ref,['contacts:read','files:read','files:download']],['contacts_import_vcf',{...ref,expectedImportVersion:'a'.repeat(64),acknowledgeImport:true},['contacts:read','contacts:write','files:read','files:download']]];
 for(const[name,args,scopes]of cases)for(const missing of scopes){const r=await rpc(['calendar:read',...scopes.filter(s=>s!==missing)],['contacts','files'],'tools/call',{name,arguments:args});assert.equal(r.isError,true,name+' '+missing);assert.match(JSON.stringify(r),new RegExp(missing));}assert.equal(calls,0);
});
test('Local help describes own addressbooks, selected vCards, unchanged identities and no merge',async()=>{
 const r=await rpc(['calendar:read'],['contacts'],'tools/call',{name:'novaspace_connector_help',arguments:{}});
 assert.equal(r.structuredContent.version,'1.31.0-local.1');assert.equal(r.structuredContent.contactWorkFunctions.length,5);assert.match(JSON.stringify(r.structuredContent.contactWorkFunctions),/Original-UID/);assert.match(JSON.stringify(r.structuredContent.contactWorkFunctions),/keine Sammelimporte oder Dublettenverschmelzung/);
});
