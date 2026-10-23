// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createMcpHandler} from '@modelcontextprotocol/server';
import {registryConfig,registryResponse,testPrincipal} from './platform-registry-fixture.mjs';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export * from './lib/files-trash'; export {createDeckMcpServer} from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {withGatewayPrincipal} from './lib/platform-registry'; export {inheritedPolicy} from './lib/connection-policy';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/files-trash.mjs'});
const api=await import('../.sites-runtime/test/files-trash.mjs');
api.setDeckRuntimeConfig({...registryConfig,NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'fixture',NEXTCLOUD_APP_PASSWORD:'fixture-only',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',OAUTH_SIGNING_SECRET:'local-test-key-not-production-1234567890'});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const home='/remote.php/dav/files/ChatGPT',trash='/remote.php/dav/trashbin/ChatGPT/trash';
const originalFetch=globalThis.fetch;
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(href,p)=>`<d:response><d:href>${esc(href)}</d:href><d:propstat><d:prop>${p}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi=rows=>`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${rows}</d:multistatus>`;
const meta=n=>`<d:resourcetype>${n.type==='folder'?'<d:collection/>':''}</d:resourcetype><oc:fileid>${n.id}</oc:fileid><d:getetag>${esc(n.etag)}</d:getetag><oc:permissions>${n.rights}</oc:permissions><d:getcontentlength>${n.size??''}</d:getcontentlength><oc:owner-id>${n.owner??'ChatGPT'}</oc:owner-id><nc:mount-type>${n.mount??'home'}</nc:mount-type><nc:is-mount-root>${n.mountRoot??'false'}</nc:is-mount-root>`;
const trashProps=n=>meta(n)+`<nc:trashbin-filename>${esc(n.name)}</nc:trashbin-filename><nc:trashbin-original-location>${esc(n.original)}</nc:trashbin-original-location><nc:trashbin-deletion-time>1792630200</nc:trashbin-deletion-time>`;
let nodes,items,calls,mutations,fault,policy,undelete;
const fixture=()=>({id:'99',etag:'"v1"',rights:'RGWD',size:7,type:'file'});
function reset(){nodes=new Map([['/',{id:'1',etag:'"root"',rights:'RGCK',type:'folder'}],['/Ordner',{id:'2',etag:'"dir"',rights:'RGDCK',type:'folder'}],['/Ordner/Test.txt',fixture()]]);items=new Map();calls=[];mutations=0;fault=null;policy=api.inheritedPolicy();undelete=true;}
function addTrash(key='Test.txt.d1792630200',patch={}){items.set(key,{...fixture(),id:'700',etag:'',name:'Test.txt',original:'Ordner/Test.txt',...patch});return key;}
globalThis.fetch=async(url,o)=>{
 const p=new URL(url).pathname,h=new Headers(o.headers);assert.equal(o.redirect,'manual');assert.ok(url.startsWith('https://cloud.example.test/'));
 if(p.endsWith('/registry/status')){const r=await registryResponse('active').json();r.ocs.data.connection.accessPolicy=policy;return Response.json(r);}
 calls.push({url,o});
 if(p==='/ocs/v2.php/cloud/capabilities')return Response.json({ocs:{meta:{status:'ok',statuscode:100},data:{capabilities:{files:{undelete}}}}});
 if(p==='/remote.php/dav/')return new Response(multi(row(p,'<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>')),{status:207});
 if(p===trash||p.startsWith(trash+'/')){
  if(o.method==='MOVE'){
   mutations++;assert.ok(p!==trash);assert.ok(h.get('Destination').startsWith('https://cloud.example.test/remote.php/dav/trashbin/ChatGPT/restore/'));assert.equal(h.get('Overwrite'),'F');
   if(fault==='move412')return new Response(null,{status:412});
   const key=decodeURIComponent(p.slice(trash.length+1)),n=items.get(key);assert.ok(n);items.delete(key);
   if(fault==='collision'){nodes.set('/Ordner/Test.txt',{...fixture(),id:'400'});nodes.set('/Ordner/Test (restored).txt',{...fixture(),id:'500'});}
   else nodes.set('/Ordner/Test.txt',{...fixture(),id:'501'});
   if(fault==='lostMove')throw Error('SECRET EXCEPTION DETAIL');
   return new Response(null,{status:201});
  }
  assert.equal(o.method,'PROPFIND');
  if(fault==='trash404')return new Response(null,{status:404});
  const key=decodeURIComponent(p.slice(trash.length+1));
  if(p!==trash&&p!==trash+'/')return items.has(key)?new Response(multi(row(p,trashProps(items.get(key)))),{status:207}):new Response(null,{status:404});
  let result=row(trash, '<d:resourcetype><d:collection/></d:resourcetype>');
  for(const [k,n] of items){const href=fault==='foreign'?'https://foreign.test'+trash+'/'+k:fault==='otherAccount'?trash.replace('ChatGPT','Soul')+'/'+k:fault==='nested'?trash+'/nested/'+k:trash+'/'+encodeURIComponent(k);result+=row(href,trashProps(n));if(fault==='duplicate')result+=row(href,trashProps(n));}
  if(fault==='malformed')result='<!DOCTYPE x><x/>';
  return new Response(fault==='malformed'?result:multi(result),{status:207});
 }
 assert.ok(p===home||p.startsWith(home+'/'));
 const path=decodeURIComponent(p.slice(home.length))||'/',n=nodes.get(path);
 if(o.method==='DELETE'){
  mutations++;assert.ok(['/Ordner/Test.txt','/Ordner'].includes(path));assert.equal(h.get('If-Match'),n.etag);
  if(fault==='delete412')return new Response(null,{status:412});
  if(fault==='deleteRedirect')return new Response(null,{status:302});
  for(const child of [...nodes.keys()])if(child===path||child.startsWith(path+'/'))nodes.delete(child);if(fault!=='noTrash')addTrash(path==='/Ordner'?'Ordner.d1792630200':'Test.txt.d1792630200',path==='/Ordner'?{type:'folder',name:'Ordner',original:'Ordner',size:null}:{});
  if(fault==='ambiguous')addTrash('Test.txt.d1792630201');
  if(fault==='lostDelete')throw Error('SECRET EXCEPTION DETAIL');
  return new Response(null,{status:fault==='partialDelete'?207:204});
 }
 assert.equal(o.method,'PROPFIND');if(!n)return new Response(null,{status:404});
 let result=row(p,meta(n));
 if(h.get('Depth')==='1')for(const [child,nn] of nodes)if(child!==path&&child.startsWith(path==='/'?'/':path+'/')&&!child.slice(path==='/'?1:path.length+1).includes('/'))result+=row(home+child,meta(nn));
 return new Response(multi(result),{status:207});
};
after(()=>globalThis.fetch=originalFetch);
async function call(name,args,scopes=['files:read','files:trash']){
 const r=await api.withGatewayPrincipal(testPrincipal,()=>handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'fixture',clientId:'fixture',scopes,resource:new URL('https://connector.example.test/deck-mcp')}}));
 const s=await r.text();return(r.headers.get('content-type')?.includes('text/event-stream')?JSON.parse(s.split('\n').find(s=>s.startsWith('data:')).slice(5)):JSON.parse(s)).result;
}
const deleteArgs={path:'/Ordner/Test.txt',fileId:'99',etag:'"v1"',expectedAccount:'ChatGPT'};
async function restoreArgs(){const k=[...items.keys()][0],r=await api.readTrash(k);return{trashId:k,expectedAccount:'ChatGPT',originalPath:'/Ordner/Test.txt',expectedVersion:r.item.version};}
test('Own top-level trash listing is bounded and opaque; read fingerprints bind original path/time',async()=>{
 reset();const k=addTrash();addTrash('Other.d1792630200',{name:'Other',original:'Other'});
 const r=await call('files_trash_list',{limit:1});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.entries.length,1);assert.equal(r.structuredContent.hasMore,true);
 const e=await api.readTrash(k);assert.equal(e.item.originalPath,'/Ordner/Test.txt');assert.match(e.item.version,/^[a-f0-9]{64}$/);assert.equal(e.item.etag,'');
 assert.equal((await api.readTrash('Missing')).exists,false);assert.equal(mutations,0);
 for(const id of ['../x','/x','a/b','..','x\0'])await assert.rejects(()=>api.readTrash(id));
});
test('Trash refuses foreign, cross-account, nested, duplicate or malformed DAV responses',async()=>{
 for(const f of ['foreign','otherAccount','nested','duplicate','malformed']){reset();addTrash();fault=f;await assert.rejects(()=>api.listTrash(),undefined,f);assert.equal(mutations,0);}
 reset();addTrash('Bad',{original:'../Test.txt'});await assert.rejects(()=>api.listTrash());
});
test('Delete requires explicit right, account, current identity and owned home-storage preflight',async()=>{
 for(const scopes of [['files:read'],['files:trash'],['files:read','files:write','files:organize']]){reset();assert.equal((await call('files_trash',deleteArgs,scopes)).isError,true);assert.equal(calls.length,0);}
 for(const patch of [{fileId:'100'},{etag:'"stale"'},{expectedAccount:'Soul'},{path:'/'},{path:'/../bad'}]){reset();assert.equal((await call('files_trash',{...deleteArgs,...patch})).isError,true);assert.equal(mutations,0);}
 for(const patch of [{rights:'RGW'},{owner:'Soul'},{mount:'external'},{mountRoot:'true'}]){reset();Object.assign(nodes.get('/Ordner/Test.txt'),patch);assert.equal((await call('files_trash',deleteArgs)).isError,true);assert.equal(mutations,0);}
 reset();undelete=false;assert.equal((await call('files_trash',deleteArgs)).isError,true);assert.equal(mutations,0);
 reset();fault='trash404';assert.equal((await call('files_trash',deleteArgs)).isError,true);assert.equal(mutations,0);
 reset();assert.equal((await call('files_trash',{...deleteArgs,path:'/Ordner',fileId:'2',etag:'"dir"'})).isError,true);assert.equal(mutations,0);
});
test('Delete verifies source absent plus one new trash entry; unknown/partial replies never retry',async()=>{
 reset();const r=await call('files_trash',deleteArgs);assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.verified,true);assert.equal(r.structuredContent.trashItem.originalPath,'/Ordner/Test.txt');assert.equal(nodes.has('/Ordner/Test.txt'),false);assert.equal(mutations,1);
 for(const f of ['lostDelete','partialDelete','noTrash','ambiguous']){reset();fault=f;const x=await call('files_trash',deleteArgs);assert.equal(x.structuredContent?.verified,false,f);assert.equal(mutations,1);assert.ok(x.structuredContent.warning);assert.doesNotMatch(JSON.stringify(x),/SECRET/);}
 for(const f of ['delete412','deleteRedirect']){reset();fault=f;assert.equal((await call('files_trash',deleteArgs)).isError,true);assert.equal(mutations,1);}
});
test('Restore accepts empty native trash ETag, binds new target, and retains explicit verification limits',async()=>{
 reset();addTrash();nodes.delete('/Ordner/Test.txt');const args=await restoreArgs();const r=await call('files_restore',args);assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.verified,true);assert.equal(r.structuredContent.targetBindingVerified,true);assert.equal(r.structuredContent.target.fileId,'501');assert.equal(r.structuredContent.fileIdPreservationVerified,false);assert.equal(r.structuredContent.contentHashVerified,false);assert.equal(items.size,0);assert.equal(mutations,1);
});
test('Restore rejects stale/path/account/parent/collision before MOVE; concurrent fallback stays unverified',async()=>{
 for(const patch of [{expectedVersion:'0'.repeat(64)},{expectedAccount:'Soul'},{originalPath:'/Other'}]){reset();addTrash();nodes.delete('/Ordner/Test.txt');const args=await restoreArgs();assert.equal((await call('files_restore',{...args,...patch})).isError,true);assert.equal(mutations,0);}
 for(const f of ['target','parent','rights']){reset();addTrash();if(f!=='target')nodes.delete('/Ordner/Test.txt');if(f==='parent')nodes.delete('/Ordner');if(f==='rights')nodes.get('/Ordner').rights='RG';assert.equal((await call('files_restore',await restoreArgs())).isError,true);assert.equal(mutations,0);}
 for(const f of ['collision','lostMove']){reset();addTrash();nodes.delete('/Ordner/Test.txt');fault=f;const r=await call('files_restore',await restoreArgs());assert.equal(r.structuredContent?.verified,false,f);assert.equal(mutations,1);assert.ok(r.structuredContent.warning);}
});
test('Native Files read/off policies block mutation or every trash tool before data access',async()=>{
 reset();policy.apps.files='read';const r=await call('files_trash',deleteArgs);assert.equal(r.structuredContent.outcome,'app_write_disabled');assert.equal(mutations,0);assert.equal(calls.length,0);
 const read=await call('files_trash_list',{});assert.equal(read.isError,undefined,JSON.stringify(read));
 for(const name of ['files_trash_list','files_trash_read','files_restore','files_trash']){reset();policy.apps.files='off';const args=name==='files_trash'?deleteArgs:name==='files_trash_read'?{trashId:'x'}:name==='files_restore'?{trashId:'x',originalPath:'/x',expectedAccount:'ChatGPT',expectedVersion:'0'.repeat(64)}:{};assert.equal((await call(name,args)).structuredContent.outcome,'app_access_disabled');assert.equal(calls.length,0);}
});

test('Folders require explicit contents, reject nested mounts and bound preflight before DELETE',async()=>{
 const args={path:'/Ordner',fileId:'2',etag:'"dir"',expectedAccount:'ChatGPT',includeContents:true};
 reset();nodes.get('/Ordner/Test.txt').mount='external';assert.equal((await call('files_trash',args)).isError,true);assert.equal(mutations,0);
 reset();for(let i=0;i<501;i++)nodes.set('/Ordner/File'+i,{...fixture(),id:String(1000+i)});assert.equal((await call('files_trash',args)).isError,true);assert.equal(mutations,0);
 reset();const r=await call('files_trash',args);assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.verified,true);assert.equal(r.structuredContent.trashItem.type,'folder');assert.equal(r.structuredContent.recursiveContentVerified,false);assert.equal(mutations,1);
});
