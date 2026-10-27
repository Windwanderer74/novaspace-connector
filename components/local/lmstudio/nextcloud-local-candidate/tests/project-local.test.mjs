// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMcpHandler} from '@modelcontextprotocol/server';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export * from './src/local';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/project-local.mjs'});
const api=await import('../.sites-runtime/test/project-local.mjs');
const names=['mindmap_project_folders','mindmap_project_status','mindmap_create_project','mindmap_resume_project'];
async function rpc(scopes,groups,method,params={}){
 const h=createMcpHandler(()=>api.localServer(scopes,groups),{legacy:'stateless',responseMode:'json'});
 const r=await h.fetch(new Request('https://fixture.test',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const raw=await r.text();return JSON.parse(r.headers.get('content-type')?.includes('text/event-stream')?raw.split('\n').find(x=>x.startsWith('data:')).slice(5):raw).result;
}
test('Personal project tools require both local areas and never add GitHub scopes or tools',async()=>{
 for(const groups of [[],['deck'],['mindmap'],['deck','mindmap']]){
  const result=await rpc([...api.ALL_SCOPES],groups,'tools/list');
  for(const name of names)assert.equal(result.tools.some(t=>t.name===name),groups.length===2,name);
  assert.ok(!result.tools.some(t=>t.name.startsWith('github_')));
 }
 assert.ok(!api.ALL_SCOPES.some(s=>s.startsWith('github:')));
 assert.throws(()=>api.validateConfig({baseUrl:'https://cloud.example.invalid',expectedUser:'Soul',scopes:['calendar:read','github:read']}));
});
test('Personal project callbacks reject missing combined grants before network access',async()=>{
 const original=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('unexpected network');};
 try{
  for(const name of names){
   const args=name.endsWith('folders')?{expectedAccount:'Soul'}:{creationId:'c'.repeat(32),expectedAccount:'Soul',...(name==='mindmap_create_project'?{title:'Projekt',acknowledgeCreate:true}:{}),...(name==='mindmap_resume_project'?{expectedStatusVersion:'e'.repeat(64),acknowledgeResume:true}:{})};
   const denied=await rpc(api.READ_SCOPES,['deck','mindmap'],'tools/call',{name,arguments:args});assert.equal(denied.isError,true,name);
  }
  assert.equal(requests,0);
 }finally{globalThis.fetch=original;}
});
