// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export {createDeckMcpServer} from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {normalizeScope} from './lib/oauth';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/mail.mjs'});
const api=await import('../.sites-runtime/test/mail.mjs');
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
async function call(name,args={},scopes=['mail:read']){
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'mock',clientId:'mock',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const text=await response.text();const data=response.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').filter(x=>x.startsWith('data:')).map(x=>JSON.parse(x.slice(5))).find(x=>x.id===1):JSON.parse(text);
 assert.ok(data.result,JSON.stringify(data));return data.result;
}
const json=data=>({body:JSON.stringify(data)});
const accountRows=[{accountId:1,name:'Pilot',emailAddress:'pilot@example.test',isDelegated:false,imapUser:'PRIVATE',signature:'PRIVATE',smtpHost:'PRIVATE'}];
const folderReply={id:1,email:'pilot@example.test',mailboxes:[{databaseId:2,accountId:1,name:'INBOX',displayName:'Inbox',specialUse:['inbox'],attributes:[],unread:7,cacheBuster:'PRIVATE'}]};
const header=(id=30,date=1700000000)=>({databaseId:id,uid:id+100,mailboxId:2,subject:'Grüße',dateInt:date,flags:{seen:false,flagged:true},messageId:`<${id}@example.test>`,from:[{label:'Pilot',email:'pilot@example.test'}],to:[],cc:[],previewText:'PRIVATE preview'});
const body=()=>({id:30,uid:130,messageId:'<30@example.test>',body:'<p>Grüße vom Pilot</p><img src="https://external.invalid/tracker">',flags:{seen:false,flagged:true},attachments:[{id:'1',fileName:'a.pdf',mime:'application/pdf',size:123,downloadUrl:'PRIVATE'}]});
const folderContext=()=>[identity(),json(accountRows),json(folderReply)];
test('Mail requires explicit mail:read before any upstream access; old and scopeless rights stay unchanged',async()=>{
 for(const [n,a] of [['mail_list_accounts',{}],['mail_list_folders',{accountId:1}],['mail_list_messages',{accountId:1,mailboxId:2}],['mail_read_message',{accountId:1,mailboxId:2,messageId:30}]]){
  reset();const r=await call(n,a,['deck:read','nextcloud:read','talk:read']);assert.equal(r.isError,true);assert.match(r._meta['mcp/www_authenticate'][0],/mail:read/);assert.equal(requests.length,0);
 }
 assert.doesNotMatch(api.normalizeScope(null),/mail:read/);
});
test('Accounts preserve identity, bound pages and exclude server configuration',async()=>{
 reset([identity(),json([...accountRows,{...accountRows[0],accountId:3}])]);const r=await call('mail_list_accounts',{limit:1});assert.equal(r.isError,undefined);const d=r.structuredContent;
 assert.equal(d.account,'ChatGPT');assert.equal(d.total,2);assert.equal(d.nextOffset,1);assert.equal(d.accounts[0].accountId,1);assert.doesNotMatch(JSON.stringify(d),/PRIVATE/);
 reset([identity(),json([])]);assert.deepEqual((await call('mail_list_accounts')).structuredContent.accounts,[]);
});
test('Folders require a visible account and expose database mailbox IDs; no forced sync',async()=>{
 reset(folderContext());const r=await call('mail_list_folders',{accountId:1});assert.equal(r.isError,undefined);assert.equal(r.structuredContent.folders[0].mailboxId,2);assert.equal(r.structuredContent.folders[0].unread,7);assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);
 assert.equal(new URL(requests[2].url).searchParams.get('forceSync'),'false');assert.ok(requests.every(x=>['GET','PROPFIND'].includes(x.options.method)&&x.options.redirect==='manual'));assert.equal(requests[2].options.headers['OCS-APIRequest'],'true');
 reset([identity(),json(accountRows)]);assert.equal((await call('mail_list_folders',{accountId:99})).isError,true);assert.equal(requests.length,2);
});
test('Message list uses singleton and timestamp cursor without leaking previews or setting flags',async()=>{
 reset([...folderContext(),json([header(30,1700000000),header(29,1699999999)])]);const r=await call('mail_list_messages',{accountId:1,mailboxId:2,limit:2,cursor:1700000010});assert.equal(r.isError,undefined);const d=r.structuredContent;assert.equal(d.nextCursor,1699999999);assert.equal(d.messages[0].messageId,30);assert.equal(d.messages[0].flags.seen,false);assert.doesNotMatch(JSON.stringify(d),/PRIVATE preview/);
 const q=new URL(requests[3].url).searchParams;assert.equal(q.get('view'),'singleton');assert.equal(q.get('cursor'),'1700000010');assert.equal(q.get('limit'),'2');assert.equal(requests.length,4);
});
test('Selected body has account/mailbox/message identity, bounded source markup and no remote resource fetch',async()=>{
 reset([...folderContext(),json(header()),ocs(body())]);const r=await call('mail_read_message',{accountId:1,mailboxId:2,messageId:30,maxChars:10});assert.equal(r.isError,undefined);const d=r.structuredContent;
 assert.equal(d.body,body().body.slice(0,10));assert.equal(d.truncated,true);assert.equal(d.bodyChars,body().body.length);assert.equal(d.message.flags.seen,false);assert.equal(d.seenMatchesCachedValue,true);assert.equal(d.attachments[0].name,'a.pdf');assert.doesNotMatch(JSON.stringify(d),/PRIVATE/);assert.equal(requests.length,5);assert.equal(new URL(requests[4].url).pathname,'/portal/ocs/v2.php/apps/mail/message/30');
 assert.ok(requests.every(x=>['GET','PROPFIND'].includes(x.options.method)&&new URL(x.url).hostname==='cloud.example.test'));
});
test('Wrong account/mailbox/message/UID cannot produce a trusted body',async()=>{
 reset([identity(),json(accountRows),json({...folderReply,id:99})]);assert.equal((await call('mail_list_folders',{accountId:1})).isError,true);
 reset([...folderContext(),json({...header(),mailboxId:99})]);assert.equal((await call('mail_read_message',{accountId:1,mailboxId:2,messageId:30})).isError,true);assert.equal(requests.length,4);
 for(const bad of [{...body(),id:31},{...body(),uid:999},{...body(),messageId:'other'}]){reset([...folderContext(),json(header()),ocs(bad)]);assert.equal((await call('mail_read_message',{accountId:1,mailboxId:2,messageId:30})).isError,true);}
});
test('HTTP, CSRF/cache/access, malformed, redirect, OCS errors and oversized answers are never empty mail',async()=>{
 for(const reply of [{status:403,body:'PRIVATE'},{status:404,body:'PRIVATE'},{status:423,body:'PRIVATE'},{status:302,body:'PRIVATE',headers:{location:'https://evil.invalid'}},{body:'not json'},{body:'x'.repeat(2*1024*1024+1)},json({status:'error',message:'PRIVATE'})]){
  reset([identity(),reply]);const r=await call('mail_list_accounts');assert.equal(r.isError,true);assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);assert.equal(requests.length,2);
 }
 reset([...folderContext(),json(header()),json({ocs:{meta:{status:'failure',statuscode:404},data:[]}})]);assert.equal((await call('mail_read_message',{accountId:1,mailboxId:2,messageId:30})).isError,true);
});
test('Encrypted partial content is explicit and changed server flags are reported, not overwritten',async()=>{
 const b={...body(),flags:{seen:true},body:undefined};reset([...folderContext(),json(header()),{...ocs(b),status:206}]);const r=await call('mail_read_message',{accountId:1,mailboxId:2,messageId:30});assert.equal(r.isError,undefined);assert.equal(r.structuredContent.partial,true);assert.equal(r.structuredContent.body,null);assert.equal(r.structuredContent.seenMatchesCachedValue,false);assert.equal(requests.length,5);
});
test('Invalid IDs/limits stop before fetch; inconsistent page and cursor responses fail',async()=>{
 for(const args of [{accountId:0,mailboxId:2},{accountId:1,mailboxId:'../2'},{accountId:1,mailboxId:2,limit:101},{accountId:1,mailboxId:2,cursor:-1}]){reset();assert.equal((await call('mail_list_messages',args)).isError,true);assert.equal(requests.length,0);}
 reset([...folderContext(),json([header(),header()])]);assert.equal((await call('mail_list_messages',{accountId:1,mailboxId:2})).isError,true);
 reset([...folderContext(),json([header()])]);assert.equal((await call('mail_list_messages',{accountId:1,mailboxId:2,cursor:1700000000})).isError,true);
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});
