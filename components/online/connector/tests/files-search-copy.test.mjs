// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { registryConfig, registryResponse, testPrincipal } from './platform-registry-fixture.mjs';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: "export {createDeckMcpServer} from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {withGatewayPrincipal} from './lib/platform-registry'; export {inheritedPolicy} from './lib/connection-policy';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/files-search-copy.mjs' });
const api = await import('../.sites-runtime/test/files-search-copy.mjs');
api.setDeckRuntimeConfig({ ...registryConfig, NEXTCLOUD_BASE_URL: 'https://cloud.example.test', NEXTCLOUD_LOGIN_NAME: 'fixture', NEXTCLOUD_APP_PASSWORD: 'fixture-only', CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test', CONNECTOR_ALLOWED_EMAIL:'owner@example.test', OAUTH_SIGNING_SECRET:'local-test-key-not-production-1234567890' });
const handler = createMcpHandler(() => api.createDeckMcpServer(), { legacy: 'stateless', responseMode: 'json' });
const root = '/remote.php/dav/files/ChatGPT', oldFetch = globalThis.fetch;
const xml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row = (href, p) => '<d:response><d:href>' + xml(href) + '</d:href><d:propstat><d:prop>' + p + '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>';
const multi = rows => '<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">' + rows + '</d:multistatus>';
let nodes, calls, copies, fault, policy;
function reset() {
  nodes = new Map([
    ['/', { id:'1', etag:'"root"', type:'folder', rights:'GCK' }],
    ['/Ziel', { id:'2', etag:'"folder"', type:'folder', rights:'GCK' }],
    ['/Akte.pdf', { id:'99', etag:'"v1"', type:'file', rights:'G', size:8, content:'original' }],
    ['/Ordner', { id:'70', etag:'"f1"', type:'folder', rights:'G' }],
  ]); calls=[]; copies=0; fault=null; policy=api.inheritedPolicy();
}
function nodeProps(n) { return '<d:resourcetype>'+(n.type==='folder'?'<d:collection/>':'')+'</d:resourcetype><d:getetag>'+xml(n.etag)+'</d:getetag><oc:fileid>'+n.id+'</oc:fileid><oc:permissions>'+n.rights+'</oc:permissions><d:getcontentlength>'+(n.size??'')+'</d:getcontentlength><d:getcontenttype>application/pdf</d:getcontenttype>'; }
globalThis.fetch = async(url, o) => {
  if(new URL(url).pathname.endsWith('/registry/status')) { const r=await registryResponse('active').json(); r.ocs.data.connection.accessPolicy=policy; return Response.json(r); }
  calls.push({url,o}); assert.equal(o.redirect,'manual'); assert.ok(url.startsWith('https://cloud.example.test/')); assert.ok(!['DELETE','MOVE','GET'].includes(o.method));
  if(new URL(url).pathname==='/remote.php/dav/') {
    if(o.method==='PROPFIND') return new Response(multi(row('/remote.php/dav/','<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>')),{status:207});
    assert.equal(o.method,'SEARCH');
    if(fault==='unsupported') return new Response(null,{status:405});
    if(fault==='bad-xml') return new Response('<!DOCTYPE x><x/>',{status:207});
    const href = fault==='foreign'?'https://foreign.test'+root+'/Akte.pdf':fault==='other-account'?'/remote.php/dav/files/Soul/Akte.pdf':fault==='outside-folder'?root+'/Other/Akte.pdf':fault==='encoded-separator'?root+'/Ziel%2FAkte.pdf':root+'/Ziel/Akte.pdf';
    const rows = row(href, nodeProps(nodes.get('/Akte.pdf')));
    return new Response(multi(rows+(fault==='more'?row(root+'/Ziel/Akte2.pdf',nodeProps({...nodes.get('/Akte.pdf'),id:'100'})):fault==='duplicate'?rows:'')),{status:207});
  }
  const path=decodeURIComponent(new URL(url).pathname.slice(root.length))||'/', n=nodes.get(path);
  if(o.method==='PROPFIND') {
    if(fault==='readback-denied'&&copies) return new Response(null,{status:403});
    if(!n) return new Response(null,{status:404});
    return new Response(multi(row(new URL(url).pathname,nodeProps(n)+(fault==='download-denied'&&path==='/Akte.pdf'?'<nc:hide-download>true</nc:hide-download>':''))),{status:207});
  }
  assert.equal(o.method,'COPY'); copies++;
  const h=new Headers(o.headers); assert.equal(h.get('Overwrite'),'F'); assert.equal(h.get('If-Match'),n.etag);
  const dest = decodeURIComponent(new URL(h.get('Destination')).pathname.slice(root.length));
  assert.ok(new URL(h.get('Destination')).origin==='https://cloud.example.test');
  if(fault==='race') return new Response(null,{status:412});
  if(fault==='redirect') return new Response(null,{status:302});
  assert.equal(h.get('Depth'), n.type==='folder'?'infinity':'0');
  nodes.set(dest,{...n,id:fault==='same-id'?n.id:'101',etag:'"copy"',size:fault==='wrong-size'?999:n.size});
  if(fault==='source-changed')n.etag='"new"';
  if(fault==='lost')throw Error('fixture network detail must not leak');
  return new Response(null,{status:fault==='partial'?207:201});
};
after(()=>globalThis.fetch=oldFetch);
async function call(name,args,scopes=['files:read','files:write']) {
  const response=await api.withGatewayPrincipal(testPrincipal,()=>handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'fixture',clientId:'fixture',scopes,resource:new URL('https://connector.example.test/deck-mcp')}}));
  const body=await response.text(); return (response.headers.get('content-type')?.includes('text/event-stream')?JSON.parse(body.split('\n').find(s=>s.startsWith('data:')).slice(5)):JSON.parse(body)).result;
}
const identity={fileId:'99',etag:'"v1"'};
const copy=(patch={})=>call('files_copy',{path:'/Akte.pdf',destination:'/Ziel/Kopie.pdf',...identity,...patch});
test('Bounded literal name search uses only the selected account/folder and returns explicit truncation',async()=>{
 reset();fault='more';const r=await call('files_search',{folder:'/Ziel',query:'Akte',limit:1});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.entries.length,1);assert.equal(r.structuredContent.hasMore,true);assert.equal(r.structuredContent.contentSearchPerformed,false);
 const q=calls.find(x=>x.o.method==='SEARCH').o.body;assert.match(q,/<d:href>\/files\/ChatGPT\/Ziel<\/d:href>/);assert.match(q,/<d:nresults>2<\/d:nresults>/);assert.match(q,/<d:depth>infinity<\/d:depth>/);
});
test('Literal patterns and XML are escaped; invalid paths and empty queries never call SEARCH',async()=>{
 reset();await call('files_search',{folder:'/Ziel',query:'A_20%&<>',recursive:false});const q=calls.find(x=>x.o.method==='SEARCH').o.body;
 assert.ok(q.includes('%A\\_20\\%&amp;&lt;&gt;%'));assert.match(q,/<d:depth>1<\/d:depth>/);
 for(const args of [{folder:'/../Soul',query:'Akte'},{folder:'https://foreign.test',query:'Akte'},{query:' '},{query:'x\u0000'}]) {reset();assert.equal((await call('files_search',args)).isError,true);assert.equal(calls.some(x=>x.o.method==='SEARCH'),false);}
});
test('Search does not pass through foreign, wrong-folder, duplicated or malformed results as valid data',async()=>{
 for(const f of ['foreign','other-account','outside-folder','encoded-separator','duplicate','bad-xml','unsupported']) {reset();fault=f;const r=await call('files_search',{folder:'/Ziel',query:'Akte'});assert.equal(r.isError,true,f);assert.equal(r.structuredContent?.entries,undefined);}
});
test('Native file COPY preserves source, creates separate ID and reports the metadata verification boundary',async()=>{
 reset();const r=await copy();assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.verified,true);assert.equal(r.structuredContent.target.fileId,'101');assert.equal(r.structuredContent.contentHashVerified,false);assert.equal(nodes.get('/Akte.pdf').id,'99');assert.equal(nodes.get('/Ziel/Kopie.pdf').content,'original');assert.equal(copies,1);
 reset();const f=await copy({path:'/Ordner',destination:'/Ziel/Ordner',fileId:'70',etag:'"f1"'});assert.equal(f.structuredContent.verified,true);assert.equal(f.structuredContent.recursiveContentVerified,false);
});
test('Stale source, existing target, rights and forbidden destinations stop before COPY',async()=>{
 for(const patch of [{fileId:'100'},{etag:'"stale"'},{destination:'/Akte.pdf'},{destination:'/Ordner/Unter',path:'/Ordner',fileId:'70',etag:'"f1"'},{destination:'/../bad'},{destination:'https://foreign.test/file'}]){reset();assert.equal((await copy(patch)).isError,true);assert.equal(copies,0);}
 reset();nodes.set('/Ziel/Kopie.pdf',{...nodes.get('/Akte.pdf'),id:'150'});assert.equal((await copy()).isError,true);assert.equal(copies,0);
 reset();nodes.get('/Ziel').rights='G';assert.equal((await copy()).isError,true);assert.equal(copies,0);
 reset();fault='download-denied';assert.equal((await copy()).isError,true);assert.equal(copies,0);
});
test('Lost/partial replies and changed readback remain unverified; no retry or deletion',async()=>{
 for(const f of ['lost','partial','same-id','wrong-size','source-changed','readback-denied']) {reset();fault=f;const r=await copy();assert.equal(r.structuredContent?.verified,false,f);assert.equal(copies,1,f);assert.ok(r.structuredContent.warning);assert.doesNotMatch(JSON.stringify(r),/fixture network detail/);}
 for(const f of ['race','redirect']) {reset();fault=f;assert.equal((await copy()).isError,true);assert.equal(copies,1);}
});
test('OAuth ceilings and native Files switches cover both new operations before data access',async()=>{
 reset();assert.equal((await call('files_search',{query:'Akte'},[])).isError,true);assert.equal(calls.length,0);
 for(const scopes of [['files:read'],['files:write']]) {reset();assert.equal((await call('files_copy',{path:'/Akte.pdf',destination:'/Ziel/Kopie.pdf',...identity},scopes)).isError,true);assert.equal(calls.length,0);}
 reset();policy.apps.files='off';assert.equal((await call('files_search',{query:'Akte'})).structuredContent.outcome,'app_access_disabled');assert.equal(calls.length,0);
 reset();policy.apps.files='read';assert.equal((await copy()).structuredContent.outcome,'app_write_disabled');assert.equal(copies,0);
 const r=await call('files_search',{folder:'/Ziel',query:'Akte'});assert.equal(r.isError,undefined,JSON.stringify(r));
});
