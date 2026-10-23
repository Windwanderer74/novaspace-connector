// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { registryConfig, registryResponse, testPrincipal } from './platform-registry-fixture.mjs';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export { createDeckMcpServer } from './lib/mcp'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { serveFileDownload } from './lib/files-download'; export { signPayload, normalizeScope } from './lib/oauth'; export { withGatewayPrincipal } from './lib/platform-registry';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/files-organize-content.mjs'});
const api=await import('../.sites-runtime/test/files-organize-content.mjs');
const {createMcpHandler}=await import('@modelcontextprotocol/server');
const origin='https://connector.example.test',root='/remote.php/dav/files/ChatGPT';
api.setDeckRuntimeConfig({...registryConfig,NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service-login',NEXTCLOUD_APP_PASSWORD:'test-only-password',OAUTH_SIGNING_SECRET:'local-test-key-not-production-key-12345',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:origin});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(href,p)=>'<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>'+xml(href)+'</d:href><d:propstat><d:prop>'+p+'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>';
let nodes,requests,fault,moves;
const nativeFetch=globalThis.fetch;
function reset(){
 nodes=new Map([['/',{type:'folder',id:'1',etag:'"root"',rights:'GCK'}],['/Ziel',{type:'folder',id:'2',etag:'"folder"',rights:'GCK'}],['/Akte.pdf',{type:'file',id:'99',etag:'"pdf1"',rights:'GDNVW',bytes:'%PDF-selected-original'}]]);
 requests=[];fault=null;moves=0;
}
globalThis.fetch=async(url,o)=>{
 if(new URL(url).pathname.endsWith('/registry/status'))return registryResponse();
 requests.push({url,o});assert.equal(o.redirect,'manual');assert.notEqual(o.method,'DELETE');
 assert.ok(url.startsWith('https://cloud.example.test/'));
 const u=new URL(url),h=new Headers(o.headers);
 if(u.pathname==='/remote.php/dav/')return new Response(row(u.pathname,'<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>'),{status:207});
 if(u.pathname.includes('/ocs/v2.php/apps/novaforge_pdf/')){
  let data;
  if(u.pathname.endsWith('/health'))data={account:'ChatGPT',bridgeVersion:'0.1.1',protocol:1,parser:'smalot 2.12.5',selftest:'passed',limits:{maxBytes:20971520},ocr:false};
  else{
   const a=JSON.parse(o.body);assert.equal(o.method,'POST');const end=Math.min(2,a.startPage+a.pageCount-1);
   data={account:'ChatGPT',path:a.path,fileId:'99',etag:'"pdf1"',sha256:'a'.repeat(64),sizeBytes:1024,bridgeVersion:'0.1.1',pageCount:2,startPage:a.startPage,endPage:end,nextPage:end<2?end+1:null,pages:Array.from({length:end-a.startPage+1},(_,i)=>({page:a.startPage+i,status:'text',text:'Seite'})),parserWarnings:false,textCharacters:(end-a.startPage+1)*5};
   if(fault==='wrong-account')data.account='other-user';
   if(fault==='wrong-sha')data.sha256='invalid';
   if(fault==='wrong-page')data.pages[0].page=9;
   if(fault==='wrong-etag')data.etag='"other"';
  }
  if(fault==='library')return Response.json({ocs:{meta:{status:'failure',statuscode:503},data:{error:'PDF_LIBRARY_VERSION_CHANGED'}}},{status:503});
  return Response.json({ocs:{meta:{status:'ok',statuscode:100},data}});
 }
 const path=decodeURIComponent(u.pathname.slice(root.length))||'/',n=nodes.get(path);
 if(o.method==='PROPFIND'){
  if(fault==='readback-denied'&&moves)return new Response(null,{status:403});
  if(!n)return new Response(null,{status:404});
  const deny=fault==='download-denied'?'<oc:hide-download>true</oc:hide-download>':fault==='attribute-denied'?'<oc:share-attributes>[{"scope":"permissions","key":"download","value":false}]</oc:share-attributes>':'';
  const p='<d:resourcetype>'+(n.type==='folder'?'<d:collection/>':'')+'</d:resourcetype><d:getetag>'+xml(n.etag)+'</d:getetag><oc:fileid>'+n.id+'</oc:fileid><oc:permissions>'+n.rights+'</oc:permissions><d:getcontentlength>22</d:getcontentlength><d:getcontenttype>application/pdf</d:getcontenttype>'+deny;
  let href=u.pathname;
  if(fault==='equivalent-href') href=href.replace(/%2C/gi,',').replace(/%3B/gi,';').replace(/%40/gi,'@').replace(/%2B/gi,'+').replace(/%3A/gi,':').replace(/%24/gi,'$').replace(/%26/gi,'&').replace(/%[0-9A-F]{2}/g,s=>s.toLowerCase());
  if(fault==='different-href') href=root+'/Different.pdf';
  if(fault==='foreign-href') href='https://foreign.test'+href;
  if(fault==='other-account-href') href=href.replace('/ChatGPT/','/Soul/');
  if(fault==='encoded-separator-href') href=root+'/Ziel%2FAkte.pdf';
  if(fault==='literal-comma-href') href=href.replace(/%252C/gi,'%2C');
  let body=row(href,p);
  if(fault==='duplicate-href') body=body.replace('</d:multistatus>',body.slice(body.indexOf('<d:response>'),body.indexOf('</d:multistatus>'))+'</d:multistatus>');
  return new Response(body,{status:207});
 }
 if(o.method==='MOVE'){
  moves++;assert.equal(h.get('overwrite'),'F');assert.equal(h.get('if-match'),n.etag);
  const dest=new URL(h.get('destination'));assert.equal(dest.origin,'https://cloud.example.test');const target=decodeURIComponent(dest.pathname.slice(root.length));
  if(fault==='target-race'){nodes.set(target,{...n,id:'100',bytes:'keep existing'});return new Response(null,{status:412});}
  if(fault==='source-race')return new Response(null,{status:412});
  if(fault==='redirect')return new Response(null,{status:302,headers:{location:'https://foreign.test/'}});
  nodes.set(target,{...n,id:fault==='changed-id'?'100':n.id});nodes.delete(path);
  if(fault==='lost-response')throw new Error('private network message');
  return new Response(null,{status:201});
 }
 assert.equal(o.method,'GET');assert.equal(h.get('if-match'),n.etag);
 if(fault==='redirect')return new Response(null,{status:302,headers:{location:'https://foreign.test/'}});
 return new Response(n.bytes,{status:200,headers:{etag:n.etag,'content-type':'application/pdf'}});
};
async function call(name,args,scopes=['files:read','files:organize','files:pdfread','files:download']){
 const response=await api.withGatewayPrincipal(testPrincipal,()=>handler.fetch(new Request(origin+'/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'test',clientId:'test',scopes,resource:new URL(origin+'/deck-mcp')}}));
 const body=await response.text();return response.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(r=>r.id===1).result:JSON.parse(body).result;
}
const identity={fileId:'99',etag:'"pdf1"'};
const move=()=>call('files_move',{path:'/Akte.pdf',destination:'/Ziel/Akte.pdf',...identity});
const download=()=>call('files_download',{path:'/Akte.pdf',...identity});
test('New capabilities require explicit consent before upstream access; legacy defaults unchanged',async()=>{
 for(const [name,args,scope] of [['files_move',{path:'/Akte.pdf',destination:'/Ziel/Akte.pdf',...identity},'files:organize'],['files_rename',{path:'/Akte.pdf',newName:'Neu.pdf',...identity},'files:organize'],['files_pdf_status',{},'files:pdfread'],['files_read_pdf',{path:'/Akte.pdf'},'files:pdfread'],['files_download',{path:'/Akte.pdf',...identity},'files:download']]){
  reset();const r=await call(name,args,['files:read','files:write']);assert.equal(r.isError,true);assert.ok(r._meta['mcp/www_authenticate'][0].includes(scope));assert.equal(requests.length,0);
 }
 assert.equal(api.normalizeScope(null),'deck:read deck:write calendar:read files:read');
});
test('Stat, Unicode rename and move preserve PDF identity and contents; absent paths are explicit',async()=>{
 reset();const s=await call('files_stat',{path:'/Akte.pdf'});assert.equal(s.structuredContent.fileId,'99');assert.equal(requests.some(r=>r.o.method==='GET'),false);
 const r=await call('files_rename',{path:'/Akte.pdf',newName:'Grüße.pdf',...identity});assert.equal(r.structuredContent.verified,true,JSON.stringify(r));
 const m=await call('files_move',{path:'/Grüße.pdf',destination:'/Ziel/Grüße.pdf',...identity});assert.equal(m.structuredContent.verified,true);
 assert.equal((await call('files_stat',{path:'/Grüße.pdf'})).structuredContent.exists,false);
 assert.equal(nodes.get('/Ziel/Grüße.pdf').bytes,'%PDF-selected-original');assert.equal(moves,2);
});
test('Equivalent DAV encoding supports comma, Unicode and reserved punctuation through stat, rename, move and download',async()=>{
 reset();fault='equivalent-href';
 const path='/Prüfung, 03.10 + @;:$& %2C.pdf',renamed='/Umbenannt, Grüße + %2C.pdf',destination='/Ziel/Umbenannt, Grüße + %2C.pdf';
 nodes.set(path,{...nodes.get('/Akte.pdf')});nodes.delete('/Akte.pdf');
 const s=await call('files_stat',{path});assert.equal(s.isError,undefined,JSON.stringify(s));assert.equal(s.structuredContent.fileId,'99');
 const r=await call('files_rename',{path,newName:renamed.slice(1),...identity});assert.equal(r.structuredContent?.verified,true,JSON.stringify(r));
 const m=await call('files_move',{path:renamed,destination,...identity});assert.equal(m.structuredContent?.verified,true,JSON.stringify(m));
 const d=await call('files_download',{path:destination,...identity});assert.equal(d.isError,undefined,JSON.stringify(d));
 assert.equal(await (await api.serveFileDownload(new Request(d.structuredContent.downloadUrl))).text(),'%PDF-selected-original');
 assert.equal(nodes.get(destination).id,'99');assert.equal(moves,2);
});
test('Metadata still rejects wrong resources, foreign origins, other accounts, encoded separators and ambiguous rows before MOVE',async()=>{
 for(const f of ['different-href','foreign-href','other-account-href','encoded-separator-href','duplicate-href']){
  reset();fault=f;assert.equal((await move()).isError,true,f);assert.equal(moves,0,f);
 }
 reset();nodes.set('/Literal%2C.pdf',{...nodes.get('/Akte.pdf')});fault='literal-comma-href';
 assert.equal((await call('files_stat',{path:'/Literal%2C.pdf'})).isError,true);
});
test('Wrong identity, stale version, existing destination, permissions and traversal prevent MOVE',async()=>{
 for(const patch of [{fileId:'100'},{etag:'"stale"'},{destination:'/Akte.pdf'},{destination:'/../other.pdf'},{path:'/../Akte.pdf'},{destination:'https://foreign.test/a.pdf'}]){
  reset();assert.equal((await call('files_move',{path:'/Akte.pdf',destination:'/Ziel/Akte.pdf',...identity,...patch})).isError,true);assert.equal(moves,0);
 }
 reset();nodes.set('/Ziel/Akte.pdf',{...nodes.get('/Akte.pdf'),id:'100'});assert.equal((await move()).isError,true);assert.equal(moves,0);
 reset();nodes.get('/Akte.pdf').rights='G';assert.equal((await move()).isError,true);assert.equal(moves,0);
 reset();nodes.get('/Ziel').rights='G';assert.equal((await move()).isError,true);assert.equal(moves,0);
});
test('Source/target races and redirects cannot overwrite or automatically retry',async()=>{
 for(const f of ['target-race','source-race','redirect']){
  reset();fault=f;assert.equal((await move()).isError,true);assert.equal(moves,1);assert.equal(nodes.get('/Akte.pdf').id,'99');
  if(f==='target-race')assert.equal(nodes.get('/Ziel/Akte.pdf').bytes,'keep existing');
 }
});
test('Lost response reconciles both paths once; changed IDs and failed reads stay unverified',async()=>{
 reset();fault='lost-response';const r=await move();assert.equal(r.structuredContent.moveAccepted,null);assert.equal(r.structuredContent.verified,true);assert.equal(moves,1);assert.doesNotMatch(JSON.stringify(r),/private network/);
 for(const f of ['changed-id','readback-denied']){reset();fault=f;assert.equal((await move()).structuredContent.verified,false);assert.equal(moves,1);}
});
test('PDF pages require exact follow-up identity and valid ranges; technical errors never become document text',async()=>{
 reset();assert.equal((await call('files_pdf_status',{})).structuredContent.selftest,'passed');
 const first=await call('files_read_pdf',{path:'/Akte.pdf'});assert.equal(first.structuredContent.nextPage,2);
 const next=await call('files_read_pdf',{path:'/Akte.pdf',startPage:2,expectedFileId:'99',expectedEtag:'"pdf1"'});assert.equal(next.structuredContent.pages[0].page,2);assert.equal(next.structuredContent.nextPage,null);
 reset();assert.equal((await call('files_read_pdf',{path:'/Akte.pdf',startPage:2})).isError,true);assert.equal(requests.length,0);
 for(const f of ['library','wrong-account','wrong-sha','wrong-page','wrong-etag']){
  reset();fault=f;const r=await call('files_read_pdf',{path:'/Akte.pdf',expectedFileId:'99',expectedEtag:'"pdf1"'});assert.equal(r.isError,true,f);assert.equal(r.structuredContent?.pages,undefined);
  if(f==='library')assert.match(JSON.stringify(r),/PDF_LIBRARY_VERSION_CHANGED/);
 }
});
test('Download streams a version-bound attachment without credentials in the short-lived link',async()=>{
 reset();const r=await download(),d=r.structuredContent;assert.equal(r.content[1].type,'resource_link');assert.doesNotMatch(d.downloadUrl,/test-only-password|service-login/);
 assert.equal(d.originalBytesIncluded,true);assert.equal(Buffer.from(d.originalChunk.bytesBase64,'base64').toString(),'%PDF-selected-original');assert.equal(d.originalChunk.nextOffset,null);assert.equal(d.originalChunk.source.fileId,'99');assert.equal(d.originalChunk.source.etag,'"pdf1"');assert.equal(d.originalChunk.length,22);assert.match(d.originalChunk.sha256,/^[a-f0-9]{64}$/);
 const response=await api.serveFileDownload(new Request(d.downloadUrl));assert.equal(response.status,200);assert.equal(await response.text(),'%PDF-selected-original');
 assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-disposition'),/attachment/);
 nodes.get('/Akte.pdf').etag='"changed"';assert.equal((await api.serveFileDownload(new Request(d.downloadUrl))).status,409);
});
test('Download rejects expired, forged, wrong-account links and denied download without content GET',async()=>{
 reset();const d=(await download()).structuredContent;
 for(const patch of [{exp:Math.floor(Date.now()/1000)-1},{uid:'Soul'}]){
  const token=await api.signPayload({type:'download',exp:Math.floor(Date.now()/1000)+300,uid:'ChatGPT',path:'/Akte.pdf',...identity,...patch});
  assert.notEqual((await api.serveFileDownload(new Request(origin+'/files-download?token='+token))).status,200);
 }
 assert.notEqual((await api.serveFileDownload(new Request(d.downloadUrl+'x'))).status,200);
 for(const f of ['download-denied','attribute-denied']){reset();fault=f;assert.equal((await download()).isError,true);assert.equal(requests.some(r=>r.o.method==='GET'),false);}
 reset();const link=(await download()).structuredContent.downloadUrl;fault='redirect';assert.equal((await api.serveFileDownload(new Request(link))).status,502);
});
test('Workspace download uses a scoped bearer on a token-free URL with the same identity and version guards',async()=>{
 reset();const d=(await download()).structuredContent,w=d.workspaceDownload;
 assert.equal(w.url,origin+'/files-download');assert.match(w.authorization,/^Bearer /);
 assert.doesNotMatch(JSON.stringify(w),/test-only-password|service-login/);
 const r=await api.serveFileDownload(new Request(w.url,{headers:{Authorization:w.authorization}}));assert.equal(r.status,200);assert.equal(await r.text(),'%PDF-selected-original');
 for(const patch of [{exp:Math.floor(Date.now()/1000)-1},{uid:'Soul'}]){
  reset();const token=await api.signPayload({type:'download',exp:Math.floor(Date.now()/1000)+300,uid:'ChatGPT',path:'/Akte.pdf',...identity,...patch});
  assert.notEqual((await api.serveFileDownload(new Request(w.url,{headers:{Authorization:'Bearer '+token}}))).status,200);assert.equal(requests.some(r=>r.o.method==='GET'),false);
 }
 reset();assert.equal((await api.serveFileDownload(new Request(d.downloadUrl,{headers:{Authorization:w.authorization}}))).status,400);assert.equal(requests.length,0);
 assert.equal((await api.serveFileDownload(new Request(w.url,{headers:{Authorization:w.authorization+'x'}}))).status,403);assert.equal(requests.length,0);
 nodes.get('/Akte.pdf').etag='"changed"';assert.equal((await api.serveFileDownload(new Request(w.url,{headers:{Authorization:w.authorization}}))).status,409);assert.equal(requests.some(r=>r.o.method==='GET'),false);
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});

test('PDF workspace preparation binds one source version and leaves download and inspection pending',async()=>{
 reset();const r=await call('files_prepare_pdf_workspace',{path:'/Akte.pdf',...identity,pages:[1,2]});assert.equal(r.isError,undefined,JSON.stringify(r));const d=r.structuredContent;assert.equal(d.source.fileId,'99');assert.equal(d.source.etag,'"pdf1"');assert.equal(d.source.size,22);assert.equal(d.transfer.tool,'files_read_pdf_original_chunk');assert.equal(d.transfer.chunkSize,524288);assert.equal(d.source.downloadAuthorization,undefined);assert.deepEqual(d.pages,[1,2]);assert.equal(d.downloadCompleted,false);assert.equal(d.renderCompleted,false);assert.equal(d.visualInspectionPerformed,false);assert.equal(d.sourceVersionRecheckRequired,true);assert.equal(requests.some(r=>r.o.method==='GET'),false);
 reset();const missing=await call('files_prepare_pdf_workspace',{path:'/Akte.pdf',...identity,pages:[1]},['files:read']);assert.equal(missing.isError,true);assert.equal(requests.length,0);
 reset();assert.equal((await call('files_prepare_pdf_workspace',{path:'/Akte.pdf',...identity,pages:[1,1]})).isError,true);assert.equal(requests.length,0);
});
