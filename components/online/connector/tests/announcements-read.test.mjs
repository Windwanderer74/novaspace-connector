// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export {createDeckMcpServer} from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {normalizeScope} from './lib/oauth';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/announcements.mjs'});
const api=await import('../.sites-runtime/test/announcements.mjs');
const {createMcpHandler}=await import('@modelcontextprotocol/server');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test/portal',NEXTCLOUD_LOGIN_NAME:'service-login',NEXTCLOUD_APP_PASSWORD:'test-only',OAUTH_SIGNING_SECRET:'local-test-key-not-a-production-key-123',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test'});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const nativeFetch=globalThis.fetch;
let requests=[],replies=[];
globalThis.fetch=async(url,options)=>{requests.push({url,options});const reply=replies.shift();assert.ok(reply,'Unexpected upstream request');return new Response(reply.body,{status:reply.status??200,headers:reply.headers??{'content-type':'application/json'}});};
const ocs=data=>({body:JSON.stringify({ocs:{meta:{status:'ok',statuscode:200},data}})});
const identity=()=>({status:207,body:'<d:multistatus xmlns:d="DAV:"><d:response><d:href>/portal/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/portal/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>'});
const caps=(features=['chat-keep-notifications','chat-read-marker'])=>ocs({version:{string:'34.0.4'},capabilities:{spreed:{features,config:{secret:'not-returned'}},core:{}}});
const room=(token='abcd1234',name='Pilot')=>({id:1,token,name,displayName:name,attendeePin:'PRIVATE-PIN',sessionId:'PRIVATE-SESSION',lastMessage:{message:'PRIVATE-PREVIEW'},lastReadMessage:12,unreadMessages:4});
const message=(id=30,token='abcd1234')=>({id,token,message:'Grüße {user}',messageParameters:{user:{type:'user',id:'Soul',name:'Soul'}},timestamp:1700000000,actorType:'users',actorId:'Soul',systemMessage:''});
const reset=(data=[])=>{requests=[];replies=data;};
async function call(name,args={},scopes=['announcements:read']){
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'mock',clientId:'mock',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const text=await response.text();const data=response.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').filter(x=>x.startsWith('data:')).map(x=>JSON.parse(x.slice(5))).find(x=>x.id===1):JSON.parse(text);
 assert.ok(data.result,JSON.stringify(data));return data.result;
}

const announcement=(id=10)=>({id,author_id:'Soul',author:'Soul',time:1700000000,subject:'Betrieb',message:'Grüße <b>Quelle</b>',groups:null,comments:0,schedule_time:null,delete_time:null});
const permission=(value)=>({body:`<html><input value="${btoa(JSON.stringify(value))}" type="hidden" id="initial-state-announcementcenter-isAdmin"><input id="private" value="SECRET"></html>`,headers:{'content-type':'text/html'}});
test('New Announcements scope is required before any upstream request and never added implicitly',async()=>{
 for(const [n,a] of [['announcements_status',{}],['announcements_list',{}],['announcements_read',{id:10}]]){
 reset();const r=await call(n,a,['deck:read','nextcloud:read','mail:read']);assert.equal(r.isError,true);assert.match(r._meta['mcp/www_authenticate'][0],/announcements:read/);assert.equal(requests.length,0);
 }
 assert.doesNotMatch(api.normalizeScope(null),/announcements:read/);
});
test('Publisher status is an exact boolean server report and the UI notification route is never opened',async()=>{
 for(const value of [true,false]){
 reset([identity(),permission(value)]);const r=await call('announcements_status');assert.equal(r.isError,undefined);assert.equal(r.structuredContent.account,'ChatGPT');assert.equal(r.structuredContent.publisherPermissionReported,value);assert.equal(r.structuredContent.writeTestPerformed,false);assert.doesNotMatch(JSON.stringify(r),/SECRET|test-only|service-login/);
 assert.equal(requests[1].url,'https://cloud.example.test/portal/index.php/apps/announcementcenter/');assert.equal(requests[1].options.method,'GET');assert.equal(requests[1].options.redirect,'manual');
 }
});
test('Missing duplicate or nonboolean publisher state never becomes false or admin by assumption',async()=>{
 for(const reply of [permission('true'),permission(null),{body:'<html>login</html>'},{body:'<input id="initial-state-announcementcenter-isAdmin" value="dHJ1ZQ=="><input id="initial-state-announcementcenter-isAdmin" value="ZmFsc2U=">'},{body:'<input id="initial-state-announcementcenter-isAdmin" value="not-base64">'}]){
 reset([identity(),reply]);assert.equal((await call('announcements_status')).isError,true);
 }
});
test('Visible page is bounded, body-free in summary, and uses minimum ID despite time ordering',async()=>{
 const rows=[10,7,9,8,6,5,4].map(announcement);rows[0].groups=[{id:'admin',name:'Administrators'}];rows[0].notifications=true;rows[0].schedule_time=1800000000;
 reset([identity(),ocs(rows)]);const r=await call('announcements_list',{beforeId:11});assert.equal(r.isError,undefined);const d=r.structuredContent;assert.equal(d.nextBeforeId,4);assert.equal(d.announcements.length,7);assert.equal(d.announcements[0].pageBeforeId,11);assert.equal(d.announcements[0].message,undefined);assert.deepEqual(d.announcements[0].groups,rows[0].groups);assert.equal(d.announcements[0].scheduleTime,1800000000);
 const u=new URL(requests[1].url);assert.equal(u.pathname,'/portal/ocs/v2.php/apps/announcementcenter/api/v1/announcements');assert.equal(u.searchParams.get('offset'),'11');assert.equal(u.searchParams.get('format'),'json');assert.equal(requests[1].options.method,'GET');
});
test('Empty pages are valid only after successful OCS response',async()=>{
 reset([identity(),ocs([])]);const r=await call('announcements_list');assert.equal(r.isError,undefined);assert.deepEqual(r.structuredContent.announcements,[]);assert.equal(r.structuredContent.nextBeforeId,null);
});
test('Normal-user responses omit publisher-only fields and remain readable',async()=>{
 const a=announcement();delete a.schedule_time;delete a.delete_time;
 reset([identity(),ocs([a])]);const listed=await call('announcements_list');
 assert.equal(listed.isError,undefined);assert.equal(listed.structuredContent.announcements[0].scheduleTime,null);assert.equal(listed.structuredContent.announcements[0].deleteTime,null);
 reset([identity(),ocs([a])]);const read=await call('announcements_read',{id:a.id});
 assert.equal(read.isError,undefined);assert.equal(read.structuredContent.announcement.message,a.message);assert.equal(read.structuredContent.announcement.notifications,null);
 assert.ok(requests.every(r=>['PROPFIND','GET'].includes(r.options.method)));
});
test('Selected body refetch uses its exact page and preserves source with explicit truncation',async()=>{
 const a=announcement(8);a.message='äöü 123456';
 reset([identity(),ocs([announcement(10),a])]);let r=await call('announcements_read',{id:8,pageBeforeId:11,maxChars:3});assert.equal(r.isError,undefined);assert.equal(r.structuredContent.announcement.id,8);assert.equal(r.structuredContent.announcement.message,'äöü');assert.equal(r.structuredContent.messageChars,10);assert.equal(r.structuredContent.truncated,true);assert.equal(new URL(requests[1].url).searchParams.get('offset'),'11');
 reset([identity(),ocs([a])]);r=await call('announcements_read',{id:8});assert.equal(r.structuredContent.announcement.message,a.message);assert.equal(r.structuredContent.truncated,false);assert.ok(requests.every(r=>['PROPFIND','GET'].includes(r.options.method)));
 reset([identity(),ocs([announcement(9)])]);r=await call('announcements_read',{id:8});assert.equal(r.isError,true);assert.match(JSON.stringify(r),/Übersicht erneut lesen/);assert.equal(requests.length,2);
});
test('Invalid locators and bounds fail without upstream requests',async()=>{
 for(const [n,a] of [['announcements_read',{id:0}],['announcements_read',{id:1,pageBeforeId:-1}],['announcements_read',{id:1,maxChars:65537}],['announcements_read',{id:'https://evil.test'}],['announcements_list',{beforeId:-1}]]){reset();assert.equal((await call(n,a)).isError,true);assert.equal(requests.length,0);}
});
test('Redirects auth failures malformed OCS and oversize errors do not leak source or become empty',async()=>{
 for(const reply of [{status:302,body:'SECRET',headers:{location:'https://evil.test'}},{status:403,body:'SECRET'},{status:404,body:'SECRET'},{body:'not json'},{body:JSON.stringify({ocs:{meta:{status:'failure',statuscode:403,message:'SECRET'},data:[]}})},{body:'x'.repeat(2*1024*1024+1)}]){
 reset([identity(),reply]);const r=await call('announcements_list');assert.equal(r.isError,true);assert.doesNotMatch(JSON.stringify(r),/SECRET/);assert.equal(requests.length,2);assert.equal(requests[1].options.redirect,'manual');
 }
});
test('Malformed items duplicate and nonprogressing IDs and oversized pages are rejected',async()=>{
 for(const rows of [[{...announcement(),id:'10'}],[{...announcement(),groups:{}}],[{...announcement(),message:null}],[{...announcement(),schedule_time:'1700000000'}],[{...announcement(),delete_time:-1}],[announcement(10),announcement(10)],[announcement(11)],Array.from({length:8},(_,i)=>announcement(i+1))]){
 reset([identity(),ocs(rows)]);assert.equal((await call('announcements_list',{beforeId:11})).isError,true);
 }
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});
