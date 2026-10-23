// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test,after } from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {createMcpHandler} from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export * from './lib/files-shares'; export {createDeckMcpServer} from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {inheritedPolicy,withConnectionPolicy} from './lib/connection-policy'; export {normalizeScope} from './lib/oauth';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/files-shares.mjs'});
const api=await import('../.sites-runtime/test/files-shares.mjs');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'Soul',NEXTCLOUD_APP_PASSWORD:'private-fixture-account-password',OAUTH_SIGNING_SECRET:'fixture-test-only-signing-key-1234567890',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test'});
const saved=globalThis.fetch,root='/remote.php/dav/files/Soul',prefix='/ocs/v2.php/apps/files_sharing/api/v1/shares';
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const multi=(href,props)=>'<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>'+xml(href)+'</d:href><d:propstat><d:prop>'+props+'</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>';
const ocs=(data,code=100)=>Response.json({ocs:{meta:{status:code===100?'ok':'failure',statuscode:code},data}});
let shares,requests,writes,nextId,fault,rights,etag;
function reset(){shares=new Map();requests=[];writes=0;nextId=100;fault=null;rights='GRW';etag='"file-v1"';}
const rawShare=(patch={})=>({id:'99',file_source:9304,path:'/Probe.txt',uid_owner:'Soul',uid_file_owner:'Soul',share_type:0,share_with:'recipient-uid',permissions:1,expiration:null,password:null,can_edit:true,can_delete:true,hide_download:0,attributes:null,label:'',url:null,...patch});
const args={path:'/Probe.txt',fileId:'9304',etag:'"file-v1"',expectedAccount:'Soul'};
const future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const create=patch=>api.createFileShare({...args,recipientType:'user',recipientId:'recipient-uid',permissions:1,...patch});
globalThis.fetch=async(url,o)=>{
 requests.push({url,o});const u=new URL(url);assert.equal(u.origin,'https://cloud.example.test');assert.equal(o.redirect,'manual');
 if(u.pathname==='/remote.php/dav/')return new Response(multi(u.pathname,'<d:current-user-principal><d:href>/remote.php/dav/principals/users/Soul/</d:href></d:current-user-principal>'),{status:207});
 if(u.pathname.startsWith(root)){
  assert.equal(o.method,'PROPFIND');
  return new Response(multi(u.pathname,'<d:resourcetype/><oc:fileid>9304</oc:fileid><d:getetag>'+xml(etag)+'</d:getetag><oc:permissions>'+rights+'</oc:permissions><d:getcontentlength>22</d:getcontentlength>'),{status:207});
 }
 assert.ok(u.pathname===prefix||new RegExp('^'+prefix+'/[1-9]\\d*$').test(u.pathname));
 const sid=u.pathname===prefix?null:u.pathname.slice(prefix.length+1);
 if(o.method==='GET'){
  if(fault==='bad-json')return new Response('<html>login</html>',{status:200});
  if(!sid){assert.equal(u.searchParams.get('path'),'/Probe.txt');assert.equal(u.searchParams.get('reshares'),'false');assert.equal(u.searchParams.get('subfiles'),'false');return ocs([...shares.values()]);}
  return shares.has(sid)?ocs(shares.get(sid)):new Response(null,{status:404});
 }
 writes++;
 const p=new URLSearchParams(o.body);
 if(o.method==='POST'){
  assert.equal(p.get('sendMail'),'false');assert.equal(p.get('publicUpload'),'false');
  const sid=String(nextId++),type=Number(p.get('shareType'));
  const s=rawShare({id:sid,share_type:type,share_with:type===3?'redacted':p.get('shareWith'),permissions:Number(p.get('permissions')),expiration:p.get('expireDate')?p.get('expireDate')+' 00:00:00':null,password:type===3?'redacted':null,url:type===3?'https://cloud.example.test/s/fixture-link':null});shares.set(sid,s);
  if(fault==='lost-post')throw Error('private-fixture-account-password network details');
  if(fault==='wrong-create-owner')s.uid_owner='Other';
  return ocs(s);
 }
 assert.ok(sid&&shares.has(sid));
 if(o.method==='DELETE'){shares.delete(sid);return ocs([]);}
 assert.equal(o.method,'PUT');const s=shares.get(sid);
 if(p.has('permissions'))s.permissions=Number(p.get('permissions'));
 if(p.has('expireDate'))s.expiration=p.get('expireDate')+' 00:00:00';
 if(p.has('password'))s.password='redacted';
 if(p.has('attributes'))s.attributes=p.get('attributes');
 return ocs(s);
};
after(()=>globalThis.fetch=saved);
test('Read is path-bound, bounded, excludes password values, and does not enumerate sharees',async()=>{
 reset();shares.set('99',rawShare());const r=await api.listFileShares('/Probe.txt');assert.equal(r.shares[0].recipientId,'recipient-uid');assert.match(r.shares[0].version,/^[a-f0-9]{64}$/);assert.equal(writes,0);
 shares.set('100',rawShare({id:'100',uid_owner:'Other'}));assert.equal((await api.listFileShares('/Probe.txt')).shares.length,1);
 shares.set('101',rawShare({id:'101',file_source:123}));await assert.rejects(api.listFileShares('/Probe.txt'));assert.equal(writes,0);
 reset();fault='bad-json';await assert.rejects(api.listFileShares('/Probe.txt'));
});
test('User/group/public creation uses explicit rights, source identity and readback; public password never returned',async()=>{
 for(const type of ['user','group','link']){
  reset();const r=await create(type==='link'?{recipientType:type,recipientId:undefined,password:'separate-fixture-share-password',expireDate:future}:{recipientType:type});
  assert.equal(r.verified,true,JSON.stringify(r));assert.equal(r.share.owner,'Soul');assert.equal(r.share.permissions,1);assert.equal(r.share.recipientType,type);assert.equal(r.atomicVersionCheck,false);assert.equal(writes,1);assert.doesNotMatch(JSON.stringify(r),/separate-fixture-share-password|private-fixture-account-password/);
 }
});
test('Wrong account/version, missing source sharing rights, duplicates and invalid public grants never POST',async()=>{
 for(const patch of [{expectedAccount:'ChatGPT'},{fileId:'999'},{etag:'"stale"'},{permissions:31},{recipientId:'../other'},{recipientType:'link',recipientId:undefined},{recipientType:'link',recipientId:undefined,password:'long-fixture-value',expireDate:'2020-01-01'}]){reset();await assert.rejects(create(patch));assert.equal(writes,0,JSON.stringify(patch));}
 reset();rights='GW';await assert.rejects(create({}));assert.equal(writes,0);
 reset();shares.set('99',rawShare());await assert.rejects(create({}));assert.equal(writes,0);
});
test('Lost POST is unknown and not retried; a later list exposes the actual native result',async()=>{
 reset();fault='lost-post';const r=await create({});assert.equal(r.outcome,'unknown');assert.equal(r.verified,false);assert.equal(writes,1);assert.doesNotMatch(JSON.stringify(r),/private-fixture-account-password/);
 assert.equal((await api.listFileShares('/Probe.txt')).shares.length,1);await assert.rejects(create({}));assert.equal(writes,1);
});
test('Update changes one explicit field; stale fingerprints and foreign/noneditable shares stop before PUT',async()=>{
 reset();shares.set('99',rawShare());const s=(await api.readFileShare('/Probe.txt','99')).share;
 const r=await api.updateFileShare({...args,shareId:'99',expectedVersion:s.version,field:'permissions',permissions:3});assert.equal(r.verified,true);assert.equal(r.share.permissions,3);assert.equal(writes,1);
 await assert.rejects(api.updateFileShare({...args,shareId:'99',expectedVersion:s.version,field:'permissions',permissions:1}));assert.equal(writes,1);
 for(const patch of [{uid_owner:'Other'},{can_edit:false}]){reset();shares.set('99',rawShare(patch));const current=(await api.readFileShare('/Probe.txt','99')).share;await assert.rejects(api.updateFileShare({...args,shareId:'99',expectedVersion:current.version,field:'permissions',permissions:3}));assert.equal(writes,0);}
});
test('Download attribute update preserves other attributes; guarded revoke preserves the source',async()=>{
 reset();shares.set('99',rawShare({attributes:JSON.stringify([{scope:'other',key:'keep',value:'unchanged'}])}));let s=(await api.readFileShare('/Probe.txt','99')).share;
 const u=await api.updateFileShare({...args,shareId:'99',expectedVersion:s.version,field:'downloadAllowed',downloadAllowed:false});assert.equal(u.verified,true);assert.equal(u.share.downloadAllowed,false);assert.deepEqual(JSON.parse(shares.get('99').attributes)[0],{scope:'other',key:'keep',value:'unchanged'});
 s=(await api.readFileShare('/Probe.txt','99')).share;const r=await api.revokeFileShare({...args,shareId:'99',expectedVersion:s.version});assert.equal(r.verified,true);assert.equal(r.sourcePreserved,true);assert.equal(shares.size,0);assert.equal(requests.some(x=>x.o.method==='DELETE'&&!x.url.includes(prefix)),false);
});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
async function call(name,a,scopes,policy) {
 const run=()=>handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:a}})}),{authInfo:{token:'fixture',clientId:'fixture',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const response=await(policy?api.withConnectionPolicy(policy,run):run());const raw=await response.text();return(response.headers.get('content-type')?.includes('text/event-stream')?JSON.parse(raw.split('\n').find(l=>l.startsWith('data:')).slice(5)):JSON.parse(raw)).result;
}
test('New share scope is opt-in and Files read/off policy blocks mutations before network',async()=>{
 assert.doesNotMatch(api.normalizeScope(null),/files:share/);
 for(const scopes of [['files:read','files:write'],['files:share']]){reset();const r=await call('files_share_create',{...args,recipientType:'user',recipientId:'recipient-uid'},scopes);assert.equal(r.isError,true);assert.equal(requests.length,0);}
 reset();const policy=api.inheritedPolicy();policy.apps.files='read';const r=await call('files_share_create',{...args,recipientType:'user',recipientId:'recipient-uid'},['files:read','files:share'],policy);assert.equal(r.structuredContent.outcome,'app_write_disabled');assert.equal(requests.length,0);
 policy.apps.files='off';assert.equal((await call('files_shares_list',{path:'/Probe.txt'},['files:read'],policy)).structuredContent.outcome,'app_access_disabled');assert.equal(requests.length,0);
});
