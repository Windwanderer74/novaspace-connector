// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';import {test} from 'node:test';import {build} from 'esbuild';import {mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
await mkdir('.sites-runtime/test',{recursive:true});await build({stdin:{contents:"export {createDeckMcpServer} from './lib/mcp';export {setDeckRuntimeConfig} from './lib/runtime-config';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/pdf-chunk.mjs'});
const api=await import('../.sites-runtime/test/pdf-chunk.mjs');const {createMcpHandler}=await import('@modelcontextprotocol/server');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.test',NEXTCLOUD_LOGIN_NAME:'ChatGPT',NEXTCLOUD_APP_PASSWORD:'private-test-password',OAUTH_SIGNING_SECRET:'local-key-long-enough-for-mcp-012345',CONNECTOR_ALLOWED_EMAIL:'owner@test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.test'});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});const chunk=524288;
let bytes,mode,requests,stats;
function reset(){bytes=Buffer.alloc(chunk+37,65);bytes.write('%PDF-1.7');mode='ok';requests=[];stats=0;}
const xml=props=>new Response('<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>/remote.php/dav/files/ChatGPT/Test.pdf</d:href><d:propstat><d:prop>'+props+'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});
globalThis.fetch=async(url,init)=>{
 requests.push({url,init});const u=new URL(url);assert.equal(u.origin,'https://cloud.test');assert.equal(init.redirect,'manual');
 if(u.pathname==='/remote.php/dav/')return xml('<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>');
 if(init.method==='PROPFIND'){stats++;return xml('<d:resourcetype/><oc:fileid>6452</oc:fileid><d:getetag>'+((mode==='changed'&&stats>1)?'&quot;other&quot;':'&quot;original&quot;')+'</d:getetag><oc:permissions>'+(mode==='no-download'?'R':'RG')+'</oc:permissions><d:getcontentlength>'+(mode==='too-large'?536870913:bytes.length)+'</d:getcontentlength><d:getcontenttype>application/pdf</d:getcontenttype>');}
 assert.equal(init.method,'GET');const h=new Headers(init.headers);assert.equal(h.get('if-match'),'"original"');assert.equal(h.get('accept-encoding'),'identity');const [start,end]=h.get('range').slice(6).split('-').map(Number);let body=bytes.subarray(start,end+1);
 if(mode==='truncated')body=body.subarray(0,body.length-1);if(mode==='oversized')body=Buffer.concat([body,Buffer.from('x')]);if(mode==='not-pdf')body=Buffer.alloc(body.length,65);
 return new Response(body,{status:mode==='full-response'?200:206,headers:{etag:mode==='get-etag'?'"other"':'"original"','content-range':mode==='range-mismatch'?'bytes 1-2/3':`bytes ${start}-${end}/${bytes.length}`,...(mode==='gzip'?{'content-encoding':'gzip'}:{})}});
};
async function call(offset=0,patch={},scopes=['files:download']){
 const r=await handler.fetch(new Request('https://connector.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'files_read_pdf_original_chunk',arguments:{path:'/Test.pdf',fileId:'6452',etag:'"original"',offset,...patch}}})}),{authInfo:{token:'test',clientId:'test',scopes,resource:new URL('https://connector.test/deck-mcp')}});
 const s=await r.text();return (r.headers.get('content-type')?.includes('text/event-stream')?s.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(r=>r.id===1):JSON.parse(s)).result;
}
test('Original binary chunks reconstruct exact bytes with hashes and source versions',async()=>{
 reset();const parts=[];for(const offset of [0,chunk]){const r=await call(offset);assert.equal(r.isError,undefined);const d=r.structuredContent,b=Buffer.from(d.bytesBase64,'base64');parts.push(b);assert.equal(d.offset,offset);assert.equal(d.length,b.length);assert.equal(d.sha256,createHash('sha256').update(b).digest('hex'));assert.equal(d.source.etag,'"original"');assert.equal(d.sourceVersionStillCurrent,true);assert.equal(d.nextOffset,offset===0?chunk:null);}
 assert.deepEqual(Buffer.concat(parts),bytes);assert.equal(requests.filter(x=>x.init.method==='GET').length,2);assert.equal(stats,4);
});
test('Single small original accepts a bounded full response',async()=>{reset();bytes=Buffer.from('%PDF-original-bytes');mode='full-response';const r=await call();assert.equal(r.isError,undefined);assert.deepEqual(Buffer.from(r.structuredContent.bytesBase64,'base64'),bytes);});
test('Scope, selection, identity, permission and size stop before original GET',async()=>{
 reset();assert.equal((await call(0,{},['files:read'])).isError,true);assert.equal(requests.length,0);
 for(const [offset,patch] of [[1,{}],[0,{fileId:'wrong'}],[0,{fileId:'3'}],[0,{etag:'"stale"'}],[0,{path:'/Test.png'}],[chunk*2,{}]]){reset();assert.equal((await call(offset,patch)).isError,true);assert.equal(requests.some(x=>x.init.method==='GET'),false);}
 for(const fault of ['no-download','too-large']){reset();mode=fault;assert.equal((await call()).isError,true);assert.equal(requests.some(x=>x.init.method==='GET'),false);}
});
test('Wrong ranges, ignored range, truncated or oversized body, compressed bytes, changed ETag and source drift return no binary success',async()=>{
 for(const fault of ['range-mismatch','full-response','truncated','oversized','gzip','get-etag','changed','not-pdf']){reset();mode=fault;const r=await call();assert.equal(r.isError,true,fault);assert.equal(r.structuredContent?.bytesBase64,undefined);assert.doesNotMatch(JSON.stringify(r),/private-test-password/);assert.equal(requests.filter(x=>x.init.method==='GET').length,1);}
});
