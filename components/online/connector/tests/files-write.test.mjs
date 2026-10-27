// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export { createDeckMcpServer } from './lib/mcp'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { normalizeScope } from './lib/oauth';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/files.mjs'});
const api=await import('../.sites-runtime/test/files.mjs');
const {createMcpHandler}=await import('@modelcontextprotocol/server');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service-login',NEXTCLOUD_APP_PASSWORD:'test-only',OAUTH_SIGNING_SECRET:'local-test-key-not-a-production-key-123',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test'});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const root='/remote.php/dav/files/ChatGPT';
const wrap=s=>`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${s}</d:multistatus>`;
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(href,props)=>`<d:response><d:href>${xml(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
let nodes,requests,fault,writeCount;
const tag=n=>`"v${n.rev}"`;
function reset(){nodes=new Map([['/',{type:'folder',id:'1',rev:1,permissions:'GCK'}]]);requests=[];fault=null;writeCount=0;}
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,o)=>{
 requests.push({url,o});assert.equal(o.redirect,'manual');assert.ok(url.startsWith('https://cloud.example.test/remote.php/dav/'));
 const href=new URL(url).pathname;
 if(href==='/remote.php/dav/')return new Response(wrap(row(href,'<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>')),{status:207});
 const path=decodeURIComponent(href.slice(root.length))||'/';const node=nodes.get(path);const h=new Headers(o.headers);
 if(o.method==='PROPFIND'){
  assert.equal(h.get('depth'),'0');
  if(fault==='metadata-denied'||fault==='read-after-write'&&writeCount)return new Response(null,{status:403});
  if(!node)return new Response(null,{status:404});
  const props=`<d:resourcetype>${node.type==='folder'?'<d:collection/>':''}</d:resourcetype><d:getetag>${tag(node)}</d:getetag><oc:fileid>${node.id}</oc:fileid><oc:permissions>${node.permissions}</oc:permissions>`;
  return new Response(wrap(row(fault==='wrong-path'?root+'/other':href,props)),{status:207});
 }
 if(o.method==='GET'){
  assert.equal(h.get('accept-encoding'),'identity');
  if(!node)return new Response(null,{status:404});
  if(h.has('if-match'))assert.equal(h.get('if-match'),tag(node));
  return new Response(node.text,{status:200,headers:{etag:tag(node)}});
 }
 assert.ok(['PUT','MKCOL'].includes(o.method));writeCount++;
 if(typeof fault==='number')return new Response(null,{status:fault,headers:{location:'https://foreign.test/'}});
 if(fault==='race')return new Response(null,{status:412});
 if(o.method==='MKCOL'){
  assert.equal(h.get('if-none-match'),'*');if(node)return new Response(null,{status:405});
  nodes.set(path,{type:'folder',id:'2',rev:1,permissions:'GCK'});
 }else{
  if(h.get('if-none-match')==='*'){if(node)return new Response(null,{status:412});}
  else assert.equal(h.get('if-match'),tag(node));
  nodes.set(path,{type:'file',id:fault==='changed-id'?'999':node?.id??'3',rev:(node?.rev??0)+1,permissions:'GW',text:fault==='changed-text'?'unrelated':o.body});
 }
 if(fault==='lost-response')throw new Error('secret network information');
 return new Response(null,{status:node?204:201});
};
async function call(name,args,scopes=['files:read','files:write']){
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'test',clientId:'test',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const body=await response.text();const data=response.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(r=>r.id===1):JSON.parse(body);assert.ok(data.result,body);return data.result;
}
const create=()=>call('files_create_text',{path:'/Prüfung.md',text:'Grüße von Soul\nKarte 330\n'});
test('Files write requires explicit new scope; existing scopes and default grants remain insufficient',async()=>{
 for(const [name,args] of [['files_create_folder',{path:'/Pilot'}],['files_create_text',{path:'/note.md',text:'x'}],['files_update_text',{path:'/note.md',etag:'"v1"',text:'x'}]]){
  reset();const r=await call(name,args,['deck:write','calendar:write','files:read']);assert.equal(r.isError,true);assert.match(r._meta['mcp/www_authenticate'][0],/files:write/);assert.equal(requests.length,0);
 }
 assert.ok(!api.normalizeScope(null).includes('files:write'));
});
test('Real handler supports folder, create, independent read, update and independent read with preserved identity',async()=>{
 reset();const folder=await call('files_create_folder',{path:'/Pilot'});assert.equal(folder.structuredContent.verified,true);
 const path='/Pilot/Grüße.md';const a=await call('files_create_text',{path,text:'Erste Zeile\nBehalten\n'});assert.equal(a.structuredContent.verified,true,JSON.stringify(a));
 const b=await call('files_read_text',{path});assert.equal(b.structuredContent.text,'Erste Zeile\nBehalten\n');
 const c=await call('files_update_text',{path,etag:b.structuredContent.etag,text:'Neue Zeile\nBehalten\n'});assert.equal(c.structuredContent.verified,true,JSON.stringify(c));assert.equal(c.structuredContent.fileId,a.structuredContent.fileId);assert.notEqual(c.structuredContent.etag,a.structuredContent.etag);
 const d=await call('files_read_text',{path});assert.equal(d.structuredContent.text,'Neue Zeile\nBehalten\n');assert.equal(writeCount,3);
 assert.ok(requests.some(r=>r.url.endsWith('/Gr%C3%BC%C3%9Fe.md')));
});
test('Duplicate create, missing parent, stale version and missing rights cannot overwrite',async()=>{
 reset();await create();const original=nodes.get('/Prüfung.md').text;
 for(const [name,args] of [['files_create_text',{path:'/Prüfung.md',text:'overwrite'}],['files_update_text',{path:'/Prüfung.md',etag:'"stale"',text:'overwrite'}],['files_create_text',{path:'/missing/note.md',text:'x'}],['files_create_folder',{path:'/Prüfung.md'}]]){const r=await call(name,args);assert.equal(r.isError,true);assert.equal(writeCount,1);}
 nodes.get('/Prüfung.md').permissions='G';const denied=await call('files_update_text',{path:'/Prüfung.md',etag:'"v1"',text:'overwrite'});assert.equal(denied.isError,true);assert.equal(writeCount,1);assert.equal(nodes.get('/Prüfung.md').text,original);
 nodes.get('/').permissions='G';const folder=await call('files_create_folder',{path:'/Denied'});assert.equal(folder.isError,true);assert.equal(writeCount,1);
});
test('Concurrent changes at PUT produce conflict without retry',async()=>{
 reset();await create();fault='race';const r=await call('files_update_text',{path:'/Prüfung.md',etag:'"v1"',text:'new'});assert.equal(r.isError,true);assert.match(JSON.stringify(r),/412/);assert.equal(nodes.get('/Prüfung.md').text,'Grüße von Soul\nKarte 330\n');assert.equal(writeCount,2);
 reset();fault='race';const c=await create();assert.equal(c.isError,true);assert.equal(writeCount,1);
});
test('Lost response reconciles exact path; failed read or changed content/identity stays unverified',async()=>{
 reset();fault='lost-response';const r=await create();assert.equal(r.structuredContent.writeAccepted,null);assert.equal(r.structuredContent.verified,true);assert.equal(writeCount,1);assert.doesNotMatch(JSON.stringify(r),/secret network/);
 reset();fault='read-after-write';const a=await create();assert.equal(a.structuredContent.writeAccepted,true);assert.equal(a.structuredContent.verified,false);
 reset();fault='changed-text';const b=await create();assert.equal(b.structuredContent.verified,false);
 reset();await create();fault='changed-id';const c=await call('files_update_text',{path:'/Prüfung.md',etag:'"v1"',text:'new'});assert.equal(c.structuredContent.verified,false);
 reset();fault='lost-response';const f=await call('files_create_folder',{path:'/Pilot'});assert.equal(f.structuredContent.writeAccepted,null);assert.equal(f.structuredContent.verified,true);assert.equal(writeCount,1);
});
test('Reject path traversal, invalid UTF-8 input, binary and byte limits before networking',async()=>{
 for(const path of ['/../note.md','/a/../note.md','/note.md/','//note.md','/a\\b.md','https://foreign.test/note.md','/document.docx']){reset();const r=await call('files_create_text',{path,text:'x'});assert.equal(r.isError,true,path);assert.equal(requests.length,0);}
 for(const text of ['x\0y','\ud800','ü'.repeat(65537)]){reset();const r=await call('files_create_text',{path:'/note.md',text});assert.equal(r.isError,true);assert.equal(requests.length,0);}
 for(const etag of ['*','W/"v1"','"v1"\r\nX: x']){reset();const r=await call('files_update_text',{path:'/note.md',etag,text:'x'});assert.equal(r.isError,true);assert.equal(requests.length,0);}
});
test('Only valid native mindmaps receive the larger 512 KiB file budget',async()=>{
 reset();const text=JSON.stringify({root:{data:{id:'root',text:'Große Mindmap'},children:[]},padding:'ü'.repeat(80000)});
 const created=await call('files_create_text',{path:'/large.KM',text});
 assert.equal(created.structuredContent.verified,true,JSON.stringify(created));
 const read=await call('files_read_text',{path:'/large.KM'});assert.equal(read.structuredContent.text,text);
 const next=text.replace('Große Mindmap','Große Mindmap geändert');
 const updated=await call('files_update_text',{path:'/large.KM',etag:read.structuredContent.etag,text:next});
 assert.equal(updated.structuredContent.verified,true);assert.equal(updated.structuredContent.fileId,created.structuredContent.fileId);
 for(const path of ['/large.txt','/large.json']){
  reset();const rejected=await call('files_create_text',{path,text});assert.equal(rejected.isError,true);assert.equal(requests.length,0);
  nodes.set(path,{type:'file',id:'3',rev:1,permissions:'GW',text});
  assert.equal((await call('files_read_text',{path})).isError,true);assert.equal(writeCount,0);
 }
 reset();const invalid=await call('files_create_text',{path:'/bad.km',text:'x'.repeat(150000)});
 assert.equal(invalid.isError,true);assert.equal(requests.length,0);
});
test('Unexpected DAV identity and HTTP failures remain errors without redirect following',async()=>{
 for(const status of [301,302,401,403,409,412,423,429]){reset();fault=status;const r=await create();assert.equal(r.isError,true);assert.equal(writeCount,1);assert.equal(nodes.has('/Prüfung.md'),false);}
 for(const status of [500,503]){reset();fault=status;const r=await create();assert.equal(r.structuredContent.writeAccepted,null);assert.equal(r.structuredContent.verified,false);assert.equal(writeCount,1);}
 for(const f of ['wrong-path','metadata-denied']){reset();fault=f;const r=await create();assert.equal(r.isError,true);assert.equal(writeCount,0);}
});
process.on('exit',()=>{globalThis.fetch=nativeFetch});
