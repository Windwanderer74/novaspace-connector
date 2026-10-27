// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export {createDeckMcpServer} from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {normalizeScope} from './lib/oauth';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/talk.mjs'});
const api=await import('../.sites-runtime/test/talk.mjs');
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
async function call(name,args={},scopes=['talk:read']){
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'mock',clientId:'mock',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const text=await response.text();const data=response.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').filter(x=>x.startsWith('data:')).map(x=>JSON.parse(x.slice(5))).find(x=>x.id===1):JSON.parse(text);
 assert.ok(data.result,JSON.stringify(data));return data.result;
}
test('Old scopes cannot reach capabilities or Talk; no scope-less grant of new rights',async()=>{
 for(const [name,args,scope] of [['nextcloud_capabilities',{},'nextcloud:read'],['talk_list_rooms',{},'talk:read'],['talk_read_messages',{token:'abcd1234'},'talk:read']]){
  reset();const r=await call(name,args,['deck:read','deck:write','calendar:read','calendar:write','files:read','files:write']);assert.equal(r.isError,true);assert.match(r._meta['mcp/www_authenticate'][0],new RegExp(scope));assert.equal(requests.length,0);
 }
 assert.doesNotMatch(api.normalizeScope(null),/nextcloud:read|talk:read/);
 reset();const r=await call('talk_list_rooms',{},['nextcloud:read']);assert.equal(r.isError,true);assert.equal(requests.length,0);
});
test('Capabilities reports actual scopes and server evidence without leaking app configuration',async()=>{
 reset([identity(),caps()]);const r=await call('nextcloud_capabilities',{},['nextcloud:read','files:read']);assert.equal(r.isError,undefined);const d=r.structuredContent;assert.equal(d.deck.crossBoardTransferImplemented,true);assert.equal(d.deck.crossBoardTransferPreviewImplemented,true);assert.equal(d.deck.crossBoardMindmapRebindImplemented,true);assert.equal(d.deck.crossBoardMovePreservesCardId,true);assert.equal(d.deck.crossBoardMoveArchivedCardsSupported,false);assert.equal(d.deck.crossBoardMoveUpdatesGithubMappings,false);assert.equal(d.deck.crossBoardMoveHostAcceptanceVerified,false);
 assert.equal(d.account,'ChatGPT');assert.equal(d.serverVersion,'34.0.4');assert.equal(d.connectorVersion,'1.35.1');assert.deepEqual(d.grantedConnectorScopes,['files:read','nextcloud:read']);assert.equal(d.mindmap.readAuthorized,true);assert.equal(d.mindmap.writeAuthorized,false);assert.equal(d.mindmap.automaticDeckSyncImplemented,false);assert.equal(d.talk.readAuthorized,false);assert.equal(d.mail.readImplemented,true);assert.equal(d.files.pdfHealthVerified,false);assert.equal(d.files.deleteImplemented,true);assert.equal(d.files.binaryUploadImplemented,true);assert.equal(d.files.binaryUploadAuthorized,false);assert.equal(d.files.binaryUploadMaxBytes,52428800);assert.equal(d.files.binaryUploadOverwrite,false);assert.equal(d.files.deleteAuthorized,false);assert.equal(d.contacts.contactMergeImplemented,true);assert.equal(d.contacts.addressBookShareWriteImplemented,true);assert.equal(d.contacts.addressBookSharingAuthorized,false);assert.equal(d.contacts.addressBookManageAuthorized,false);assert.equal(d.deck.trashWriteAuthorized,false);assert.equal(d.calendar.selectedCalendarSearchImplemented,true);assert.equal(d.calendar.seriesTimeShiftImplemented,true);assert.equal(d.calendar.seriesFutureChangeImplemented,false);assert.equal(d.calendar.displayReminderDeliveryVerified,false);assert.doesNotMatch(JSON.stringify(d),/not-returned|test-only|service-login/);
 assert.equal(new URL(requests[1].url).pathname,'/portal/ocs/v2.php/cloud/capabilities');
});
test('Room selection is bounded and excludes private PIN/session/message previews',async()=>{
 reset([identity(),caps(),ocs([room(),room('efgh5678','Pilot 2'),room('ijkl9012','Other')])]);const r=await call('talk_list_rooms',{query:'pilot',limit:1});assert.equal(r.isError,undefined);const d=r.structuredContent;
 assert.equal(d.totalMatches,2);assert.equal(d.nextOffset,1);assert.equal(d.rooms[0].token,'abcd1234');assert.equal(d.rooms[0].lastReadMessage,12);assert.equal(d.rooms[0].url,'https://cloud.example.test/portal/index.php/call/abcd1234');assert.doesNotMatch(JSON.stringify(d),/PRIVATE/);
 const url=new URL(requests[2].url);assert.equal(url.searchParams.get('noStatusUpdate'),'1');assert.equal(url.searchParams.get('includeLastMessage'),'false');assert.equal(url.searchParams.get('includeStatus'),'false');assert.ok(requests.every(x=>['PROPFIND','GET'].includes(x.options.method)&&x.options.redirect==='manual'));
});
test('History preserves message identity and source text, with read effects disabled and server cursor',async()=>{
 reset([identity(),caps(),{...ocs([message()]),headers:{'X-Chat-Last-Given':'29'}}]);const r=await call('talk_read_messages',{token:'abcd1234',limit:2,beforeMessageId:40});assert.equal(r.isError,undefined);assert.deepEqual(r.structuredContent.messages,[message()]);assert.equal(r.structuredContent.nextBeforeMessageId,29);
 const q=new URL(requests[2].url).searchParams;for(const [key,value] of Object.entries({lookIntoFuture:'0',limit:'2',lastKnownMessageId:'40',setReadMarker:'0',noStatusUpdate:'1',markNotificationsAsRead:'0',includeLastKnown:'0'}))assert.equal(q.get(key),value,key);
 assert.ok(requests.every(x=>['PROPFIND','GET'].includes(x.options.method)));
});
test('Empty history page uses hidden-message cursor; only 304 explicitly reports no older messages',async()=>{
 reset([identity(),caps(),{...ocs([]),headers:{'X-Chat-Last-Given':'20'}}]);let r=await call('talk_read_messages',{token:'abcd1234',beforeMessageId:30});assert.equal(r.isError,undefined);assert.deepEqual(r.structuredContent.messages,[]);assert.equal(r.structuredContent.nextBeforeMessageId,20);assert.equal(r.structuredContent.noOlderMessages,false);
 reset([identity(),caps(),{status:304,body:null}]);r=await call('talk_read_messages',{token:'abcd1234',beforeMessageId:20});assert.equal(r.isError,undefined);assert.equal(r.structuredContent.noOlderMessages,true);assert.equal(r.structuredContent.nextBeforeMessageId,null);
});
test('Missing Talk or notification preservation stops before history; magic paths and invalid limits cannot fetch',async()=>{
 for(const reply of [caps([]),ocs({version:{string:'34.0.4'},capabilities:{core:{}}})]){reset([identity(),reply]);const r=await call('talk_read_messages',{token:'abcd1234'});assert.equal(r.isError,true);assert.equal(requests.length,2);}
 for(const args of [{token:'note-to-self'},{token:'../evil'},{token:'https://evil.test/a'},{token:'abcd1234',limit:101},{token:'abcd1234',beforeMessageId:0}]){reset();const r=await call('talk_read_messages',args);assert.equal(r.isError,true);assert.equal(requests.length,0);}
});
test('Redirects, access failures, malformed or oversized OCS responses are errors, never empty rooms',async()=>{
 for(const reply of [{status:302,body:'PRIVATE upstream',headers:{location:'https://evil.test'}},{status:403,body:'PRIVATE upstream'},{status:404,body:'PRIVATE upstream'},{body:'not json'},{body:JSON.stringify({ocs:{meta:{status:'failure',statuscode:403,message:'PRIVATE upstream'},data:[]}})},{body:'x'.repeat(2*1024*1024+1)}]){
  reset([identity(),caps(),reply]);const r=await call('talk_list_rooms');assert.equal(r.isError,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE upstream/);assert.equal(requests.length,3);assert.equal(requests[2].options.redirect,'manual');
 }
});
test('Reject wrong-room messages, absent/nonprogressing cursors and invalid room payloads',async()=>{
 for(const reply of [{...ocs([message(30,'wrong123')]),headers:{'X-Chat-Last-Given':'29'}},ocs([message()]),{...ocs([message()]),headers:{'X-Chat-Last-Given':'40'}},{...ocs([message()]),headers:{'X-Chat-Last-Given':'not-an-id'}}]){reset([identity(),caps(),reply]);const r=await call('talk_read_messages',{token:'abcd1234',beforeMessageId:40});assert.equal(r.isError,true);}
 reset([identity(),caps(),ocs({rooms:[]})]);assert.equal((await call('talk_list_rooms')).isError,true);
 reset([identity(),caps(),ocs([room('../x')])]);assert.equal((await call('talk_list_rooms')).isError,true);
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});
