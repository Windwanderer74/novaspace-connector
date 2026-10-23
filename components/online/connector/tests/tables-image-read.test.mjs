// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('.sites-runtime/test', {recursive:true});
await build({stdin:{contents:"export {createDeckMcpServer} from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/tables-images.mjs'});
const api=await import('../.sites-runtime/test/tables-images.mjs');
const {createMcpHandler}=await import('@modelcontextprotocol/server');
const origin='https://connector.example.test';
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test/portal',NEXTCLOUD_LOGIN_NAME:'service-login',NEXTCLOUD_APP_PASSWORD:'test-only-password',OAUTH_SIGNING_SECRET:'test-signing-secret-not-production-1234',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:origin});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const table=id=>({id,title:'Test '+id,rowsCount:4,columnsCount:1,onSharePermissions:{read:true,create:false,update:false,delete:false,manage:false},lastEditAt:'2026-10-03 01:00:00'});
const column={id:7,tableId:1,title:'Datei-ID',type:'text',subtype:'line'};
const row=(id,value)=>({id,tableId:1,createdAt:'2026-10-03 01:00:00',lastEditAt:'2026-10-03 01:00:00',data:[{columnId:7,value}]});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
const ocs=data=>Response.json({ocs:{meta:{status:'ok',statuscode:100},data}});
const xml=p=>new Response('<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>'+p.href+'</d:href><d:propstat><d:prop>'+p.props+'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});
let requests, fault, tables, imageReads, metadataReads;
function reset(){requests=[];fault=null;tables=[table(1),table(2)];imageReads=0;metadataReads=0;}
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{
 requests.push({url,init}); assert.equal(init.redirect,'manual');assert.ok(['GET','PROPFIND'].includes(init.method));
 const u=new URL(url);assert.equal(u.origin,'https://cloud.example.test');
 assert.notEqual(u.pathname,'/portal/index.php/apps/tables/api/1/tables','Native list may create tutorials and must never be called');
 if(u.pathname==='/portal/remote.php/dav/')return xml({href:u.pathname,props:'<d:current-user-principal><d:href>/portal/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>'});
 if(fault==='redirect')return new Response(null,{status:302,headers:{location:'https://foreign.test'}});
 if(fault==='denied')return new Response('PRIVATE error detail',{status:403});
 if(fault==='bad-json')return new Response('not json',{status:200});
 if(u.pathname.endsWith('/cloud/capabilities'))return ocs({capabilities:{tables:{enabled:true,version:'2.3.1',apiVersions:['1.0','2.0','2.1'],features:['archive'],column_types:['text-line']}}});
 if(u.pathname.endsWith('/novaforge_tables/api/v1/list'))return ocs({account:fault==='foreign-account'?'Soul':'ChatGPT',bridgeVersion:'0.1.0',protocol:1,tutorialCreation:fault==='tutorial-enabled',tables});
 if(u.pathname.endsWith('/tables/api/1/tables/1'))return Response.json(fault==='wrong-table'?table(2):table(1));
 if(u.pathname.endsWith('/tables/1/columns'))return Response.json([{...column,tableId:fault==='wrong-column'?2:1}]);
 if(u.pathname.endsWith('/tables/1/rows')){
  if(fault==='oversize-rows')return Response.json(Array.from({length:102},(_,i)=>row(i+1,'x')));
  const offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit'));
  const rows=[row(10,'6405'),row(11,'6421'),row(12,'6405'),row(13,'none')];
  if(fault==='wrong-row')rows[0].tableId=2;
  if(fault==='missing-data')rows[0].data=null;
  if(fault==='duplicate-cell')rows[0].data.push({...rows[0].data[0]});
  return Response.json(rows.slice(offset,offset+limit));
 }
 if(u.pathname.endsWith('/rows/10'))return Response.json(fault==='wrong-row-id'?row(11,'6405'):row(10,'6405'));
 if(u.pathname.endsWith('/remote.php/dav/files/ChatGPT/Test.png')){
  if(init.method==='PROPFIND'){
   metadataReads++;const etag=fault==='changed-image'&&metadataReads>1?'&quot;new&quot;':'&quot;image1&quot;';
   const rights=fault==='no-rights'?'': 'G';
   const deny=fault==='download-denied'?'<oc:hide-download>true</oc:hide-download>':'';
   return xml({href:u.pathname,props:'<d:resourcetype/><oc:fileid>99</oc:fileid><d:getetag>'+etag+'</d:getetag><oc:permissions>'+rights+'</oc:permissions><d:getcontentlength>'+ (fault==='large-image'?10485761:png.length) +'</d:getcontentlength><d:getcontenttype>image/png</d:getcontenttype>'+deny});
  }
  imageReads++;assert.equal(new Headers(init.headers).get('if-match'),'"image1"');
  const bytes=fault==='fake-image'?Buffer.alloc(png.length):fault==='wrong-size'?png.subarray(0,8):png;
  return new Response(bytes,{status:200,headers:{etag:'"image1"','content-type':fault==='wrong-mime'?'text/html':'image/png'}});
 }
 throw new Error('Unexpected test path '+u.pathname);
};
async function call(name,args={},scopes=['tables:read','files:download']){
 const r=await handler.fetch(new Request(origin+'/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'test',clientId:'test',scopes,resource:new URL(origin+'/deck-mcp')}});
 const text=await r.text();const data=r.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(r=>r.id===1):JSON.parse(text);return data.result;
}
const imageArgs={path:'/Test.png',fileId:'99',etag:'"image1"'};
test('Tables and images require their own consent before any upstream request',async()=>{
 for(const [name,args,scope] of [['tables_status',{},'tables:read'],['tables_list',{},'tables:read'],['tables_read',{tableId:1},'tables:read'],['tables_list_rows',{tableId:1},'tables:read'],['tables_read_row',{tableId:1,rowId:10},'tables:read'],['tables_search_rows',{tableId:1,filters:[{columnId:7,value:'x'}]},'tables:read'],['files_read_image',imageArgs,'files:download']]){
  reset();const r=await call(name,args,['nextcloud:read','files:read','files:write']);assert.equal(r.isError,true,name);assert.match(r._meta['mcp/www_authenticate'][0],new RegExp(scope));assert.equal(requests.length,0);
 }
});
test('Tables status reports actual API evidence without claiming atomic writes',async()=>{
 reset();const r=await call('tables_status');assert.equal(r.isError,undefined);assert.equal(r.structuredContent.version,'2.3.1');assert.equal(r.structuredContent.atomicWriteVerified,false);assert.equal(r.structuredContent.writeImplemented,true);assert.equal(r.structuredContent.registerHostAcceptanceVerified,false);
});
test('Table list uses non-creating bridge, binds account and checks continuation snapshot',async()=>{
 reset();let r=await call('tables_list',{limit:1});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.tables[0].id,1);assert.equal(r.structuredContent.nextOffset,1);
 const snapshot=r.structuredContent.snapshot;r=await call('tables_list',{offset:1,limit:1,expectedSnapshot:snapshot});assert.equal(r.structuredContent.tables[0].id,2);assert.equal(r.structuredContent.nextOffset,null);
 tables[0].title='Changed';assert.equal((await call('tables_list',{offset:1,expectedSnapshot:snapshot})).isError,true);
 for(const f of ['foreign-account','tutorial-enabled']){reset();fault=f;assert.equal((await call('tables_list')).isError,true);}
});
test('Table structure and individual row verify IDs and expose advisory fingerprint',async()=>{
 reset();let r=await call('tables_read',{tableId:1});assert.equal(r.structuredContent.columns[0].id,7);
 r=await call('tables_read_row',{tableId:1,rowId:10});assert.equal(r.structuredContent.row.data[0].value,'6405');assert.match(r.structuredContent.row.readFingerprint,/^[a-f0-9]{64}$/);
 for(const f of ['wrong-table','wrong-column','wrong-row-id']){reset();fault=f;assert.equal((await call('tables_read_row',{tableId:1,rowId:10})).isError,true,f);}
});
test('Paged search continues through empty matches and identifies only its scanned page',async()=>{
 reset();const r=await call('tables_search_rows',{tableId:1,limit:1,filters:[{columnId:7,value:'6421'}]});assert.equal(r.isError,undefined);assert.equal(r.structuredContent.rows.length,0);assert.equal(r.structuredContent.nextOffset,1);assert.equal(r.structuredContent.scanned,1);assert.equal(r.structuredContent.paginationConsistency,'not_guaranteed');
 const n=await call('tables_search_rows',{tableId:1,offset:1,limit:1,filters:[{columnId:7,value:'6421'}]});assert.equal(n.structuredContent.rows[0].id,11);
 reset();const bad=await call('tables_search_rows',{tableId:1,filters:[{columnId:8,value:'x'}]});assert.equal(bad.isError,true);assert.equal(requests.some(r=>new URL(r.url).pathname.endsWith('/rows')),false);
});
test('Wrong table, missing row data, duplicate cells and unbounded responses never appear as valid rows',async()=>{
 for(const f of ['wrong-row','missing-data','duplicate-cell','oversize-rows']){reset();fault=f;assert.equal((await call('tables_list_rows',{tableId:1})).isError,true,f);}
 for(const args of [{tableId:0},{tableId:1,limit:101},{tableId:'https://evil.test'}]){reset();assert.equal((await call('tables_list_rows',args)).isError,true);assert.equal(requests.length,0);}
});
test('Image result contains exact visible bytes, actual hash and verified version',async()=>{
 reset();const r=await call('files_read_image',imageArgs);assert.equal(r.isError,undefined,JSON.stringify(r));const img=r.content.find(c=>c.type==='image');assert.ok(img);assert.equal(img.mimeType,'image/png');assert.deepEqual(Buffer.from(img.data,'base64'),png);assert.equal(r.structuredContent.sha256,createHash('sha256').update(png).digest('hex'));assert.equal(r.structuredContent.versionVerified,true);assert.equal(metadataReads,2);assert.equal(imageReads,1);
 assert.doesNotMatch(JSON.stringify(r),/test-only-password|service-login/);
});
test('Stale IDs, denied downloads and oversize images stop before content retrieval',async()=>{
 for(const patch of [{fileId:'100'},{etag:'"stale"'},{path:'/../Test.png'}]){reset();assert.equal((await call('files_read_image',{...imageArgs,...patch})).isError,true);assert.equal(imageReads,0);}
 for(const f of ['no-rights','download-denied','large-image']){reset();fault=f;assert.equal((await call('files_read_image',imageArgs)).isError,true);assert.equal(imageReads,0);}
});
test('Wrong MIME, corrupt signatures, truncated bytes and changed image never return image content',async()=>{
 for(const f of ['wrong-mime','fake-image','wrong-size','changed-image']){reset();fault=f;const r=await call('files_read_image',imageArgs);assert.equal(r.isError,true,f);assert.equal(r.content.some(c=>c.type==='image'),false,f);}
});
test('Redirects, authorization failures and malformed Tables answers stay technical errors without private details',async()=>{
 for(const f of ['redirect','denied','bad-json']){reset();fault=f;const r=await call('tables_read',{tableId:1});assert.equal(r.isError,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE error detail/);}
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});
