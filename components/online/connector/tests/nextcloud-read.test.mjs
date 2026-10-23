// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{ contents:`export { createDeckMcpServer } from './lib/mcp'; export { ALL_SCOPES } from './lib/oauth'; export * from './lib/nextcloud-read'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { GET as consent } from './app/oauth/authorize/route'; export { createClientId } from './lib/oauth';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/nextcloud.mjs'});
const module = await import('../.sites-runtime/test/nextcloud.mjs');
const { createMcpHandler } = await import('@modelcontextprotocol/server');
module.setDeckRuntimeConfig({ NEXTCLOUD_BASE_URL:'https://cloud.example.test', NEXTCLOUD_LOGIN_NAME:'service-login', NEXTCLOUD_APP_PASSWORD:'test-only', OAUTH_SIGNING_SECRET:'local-test-key-not-a-production-key-123',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test' });
const handler = createMcpHandler(()=>module.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const nativeFetch = globalThis.fetch;
let fetched = [];
let replies = [];
globalThis.fetch = async(url,options)=>{
  fetched.push({url, options});
  const next = replies.shift();
  assert.ok(next, 'Unexpected upstream request');
  return new Response(next.body, {status:next.status??207,headers:next.headers??{'content-type':'application/xml'}});
};
const wrap = content=>`<?xml version="1.0"?><x:multistatus xmlns:x="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:oc="http://owncloud.org/ns">${content}</x:multistatus>`;
const row = (href,props)=>`<x:response><x:href>${href}</x:href><x:propstat><x:prop>${props}</x:prop><x:status>HTTP/1.1 200 OK</x:status></x:propstat></x:response>`;
const identity = ()=>({body:wrap(row('/remote.php/dav/','<x:current-user-principal><x:href>/remote.php/dav/principals/users/ChatGPT/</x:href></x:current-user-principal>'))});
const fileMeta = (path,etag='"v2"',id='123')=>({body:wrap(row('/remote.php/dav/files/ChatGPT'+path,`<x:resourcetype/><x:getetag>${etag}</x:getetag><oc:fileid>${id}</oc:fileid><oc:permissions>GW</oc:permissions>`))});
const home = ()=>({body:wrap(row('/remote.php/dav/principals/users/ChatGPT/','<c:calendar-home-set><x:href>/remote.php/dav/calendars/ChatGPT/</x:href></c:calendar-home-set>'))});
async function call(name,args,scopes){
 const request = new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 const response=await handler.fetch(request,{authInfo:{token:'mock',clientId:'mock',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 assert.equal(response.status,200);
 const body=await response.text();
 const data=response.headers.get('content-type')?.includes('text/event-stream') ? body.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5))).find(item=>item.id===1) : JSON.parse(body);
 assert.ok(data.result, JSON.stringify(data));
 return data.result;
}
function setup(data=[]){fetched=[];replies=data;}

test('Legacy Deck scopes cannot access new calendar or file tools',async()=>{
 for(const [name,args] of [['nextcloud_account',{}],['calendar_list',{}],['calendar_read_period',{calendarPath:'/remote.php/dav/calendars/ChatGPT/personal/',start:'2026-09-17T00:00:00+02:00',end:'2026-09-18T00:00:00+02:00'}],['files_list',{folder:'/'}],['files_read_text',{path:'/note.md'}]]){
 setup();const r=await call(name,args,['deck:read','deck:write']);assert.equal(r.isError,true,name);assert.equal(fetched.length,0);
  const scope = name.startsWith('files_') ? 'files:read' : 'calendar:read';
  const challenge = r._meta?.['mcp/www_authenticate']?.[0];
  assert.match(challenge, /error="insufficient_scope"/);
  assert.match(challenge, /error_description="[^"]+"/);
  assert.ok(challenge.includes(`scope="${scope}"`));
  assert.ok(challenge.includes('resource_metadata="https://connector.example.test/.well-known/oauth-protected-resource/deck-mcp"'));
 }
});
test('Tool discovery advertises valid OAuth scopes and explicit exchange requirements',async()=>{
 setup();
 const request = new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})});
 const response=await handler.fetch(request,{authInfo:{token:'mock',clientId:'mock',scopes:['deck:read'],resource:new URL('https://connector.example.test/deck-mcp')}});
 assert.equal(response.status,200);
 const body=await response.text();
 const data=response.headers.get('content-type')?.includes('text/event-stream') ? body.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5))).find(item=>item.id===2) : JSON.parse(body);
 // 1.31.1 adds six bounded GitHub bridge tools to the previous 152 contracts.
 assert.equal(data.result.tools.length,158);
 assert.equal(new Set(data.result.tools.map(t=>t.name)).size,158);
 for(const tool of data.result.tools){
  const schemes=tool._meta?.securitySchemes;
  assert.equal(schemes?.length,1,tool.name);
  assert.equal(schemes[0].type,'oauth2',tool.name);
  assert.ok(schemes[0].scopes.length>0,tool.name);
  assert.equal(new Set(schemes[0].scopes).size,schemes[0].scopes.length,tool.name);
  for(const scope of schemes[0].scopes)assert.ok(module.ALL_SCOPES.includes(scope),tool.name+':'+scope);
 }
 const expected={
  nextcloud_account:['calendar:read'],calendar_list:['calendar:read'],
  calendar_read_event:['calendar:read'],calendar_create_event:['calendar:write'],
  files_create_text:['files:write'],files_read_text:['files:read'],
  calendar_export_ics:['calendar:read','files:read','files:write'],
  calendar_prepare_ics_import:['calendar:read','files:read','files:download'],
  calendar_import_ics:['calendar:write','calendar:read','files:read','files:download'],
  contacts_read_addressbook_settings:['contacts:read'],
  contacts_create_addressbook:['contacts:write','contacts:read'],
  contacts_update_addressbook:['contacts:write','contacts:read'],
  contacts_export_vcf:['contacts:read','files:read','files:write'],
  contacts_prepare_vcf_import:['contacts:read','files:read','files:download'],
  contacts_import_vcf:['contacts:write','contacts:read','files:read','files:download'],
 };
 for(const [name,scopes]of Object.entries(expected))assert.deepEqual(data.result.tools.find(t=>t.name===name)?._meta?.securitySchemes,[{type:'oauth2',scopes}],name);
 assert.equal(fetched.length,0);
});
test('Every existing Deck tool enforces its required scope before accessing the server',async()=>{
 for(const [name,args] of [['search',{query:'x'}],['fetch',{id:'card:10:33:330'}],['get_board',{boardId:10}],['list_boards',{}],['get_board_structure',{boardId:10}],['get_stack',{boardId:10,stackId:33}],['create_card',{boardId:10,stackId:33,title:'x'}],['update_card',{boardId:10,stackId:33,cardId:330,title:'x'}],['move_card',{boardId:10,sourceStackId:31,targetStackId:33,cardId:330}]]){
 setup();const r=await call(name,args,['calendar:read','files:read']);assert.equal(r.isError,true,name);assert.equal(fetched.length,0);
 }
});
test('Existing Deck read works with the existing deck:read token',async()=>{
 setup([{status:200,body:JSON.stringify([{id:10,title:'Existing board',deletedAt:0}]),headers:{'content-type':'application/json'}}]);
 const r=await call('list_boards',{},['deck:read']);assert.equal(r.isError,undefined);assert.equal(r.structuredContent.boards[0].id,10);
});
test('Read-only Deck token cannot invoke any Deck write operation',async()=>{
 for(const [name,args] of [['create_card',{boardId:10,stackId:33,title:'x'}],['update_card',{boardId:10,stackId:33,cardId:330,title:'x'}],['move_card',{boardId:10,sourceStackId:31,targetStackId:33,cardId:330}]]){
 setup();const r=await call(name,args,['deck:read']);assert.equal(r.isError,true,name);assert.equal(fetched.length,0);
 }
});
test('Authenticated discovery uses server identity, handles arbitrary namespace prefixes and shared calendar owner',async()=>{
 const base='/remote.php/dav/calendars/ChatGPT/';
 setup([identity(),home(),{body:wrap(row(base,'<x:resourcetype><x:collection/></x:resourcetype>')+row(base+'novaforge-pilot_shared_by_Soul/','<x:resourcetype><x:collection/><c:calendar/></x:resourcetype><x:displayname>NOVAFORGE &amp; Pilot</x:displayname><x:owner><x:href>/remote.php/dav/principals/users/Soul/</x:href></x:owner><x:current-user-privilege-set><x:privilege><x:read/></x:privilege><x:privilege><x:write/></x:privilege></x:current-user-privilege-set><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>'))}]);
 const r=await call('calendar_list',{},['calendar:read']);assert.equal(r.isError,undefined);assert.equal(r.structuredContent.account,'ChatGPT');assert.equal(r.structuredContent.calendars.length,1);assert.equal(r.structuredContent.calendars[0].title,'NOVAFORGE & Pilot');assert.equal(r.structuredContent.calendars[0].writable,true);
 assert.ok(fetched.every(x=>x.options.method==='PROPFIND' && x.options.redirect==='manual'));
});
test('Period query converts timezone offsets to UTC and requests recurrence expansion',async()=>{
 const path='/remote.php/dav/calendars/ChatGPT/personal/';
 const ics='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:sample\r\nDTSTART:20260917T080000Z\r\nDTEND:20260917T083000Z\r\nSUMMARY:Test &amp; Review\r\nEND:VEVENT\r\nEND:VCALENDAR';
 setup([identity(),home(),{body:wrap(row(path+'a.ics','<x:getetag>&quot;v1&quot;</x:getetag><c:calendar-data>'+ics+'</c:calendar-data>'))}]);
 const r=await call('calendar_read_period',{calendarPath:path,start:'2026-09-17T00:00:00+02:00',end:'2026-09-18T00:00:00+02:00'},['calendar:read']);
 assert.equal(r.isError,undefined);assert.equal(fetched[2].options.method,'REPORT');assert.match(fetched[2].options.body,/<c:expand start="20260916T220000Z" end="20260917T220000Z"/);assert.match(r.structuredContent.objects[0].calendarData,/SUMMARY:Test & Review/);assert.equal(r.structuredContent.objects[0].etag,'"v1"');
});
test('Files scope works independently of calendar-home discovery; text and ETag are preserved',async()=>{
 setup([identity(),fileMeta('/Notizen/Prüfung.md'),{status:200,body:'Prüfung\nZweite Zeile\n',headers:{etag:'"v2"','content-type':'text/markdown'}},fileMeta('/Notizen/Prüfung.md')]);
 const r=await call('files_read_text',{path:'/Notizen/Prüfung.md'},['files:read']);assert.equal(r.isError,undefined);assert.equal(r.structuredContent.text,'Prüfung\nZweite Zeile\n');assert.equal(r.structuredContent.etag,'"v2"');assert.match(fetched[1].url,/Notizen\/Pr%C3%BCfung.md$/);assert.equal(fetched.length,4);
});
test('Folder listing preserves stable IDs and excludes the requested folder itself',async()=>{
 const root='/remote.php/dav/files/ChatGPT/';setup([identity(),{body:wrap(row(root,'<x:resourcetype><x:collection/></x:resourcetype>')+row(root+'note.md','<x:resourcetype/><x:getetag>&quot;v3&quot;</x:getetag><x:getcontentlength>12</x:getcontentlength><oc:fileid>123</oc:fileid><oc:permissions>GW</oc:permissions>'))}]);
 const r=await call('files_list',{folder:'/'},['files:read']);assert.equal(r.isError,undefined);assert.equal(r.structuredContent.entries.length,1);assert.equal(r.structuredContent.entries[0].fileId,'123');assert.equal(r.structuredContent.entries[0].path,'/note.md');
});
test('Folder self row is excluded when comma and Unicode use equivalent DAV encoding',async()=>{
 const root='/remote.php/dav/files/ChatGPT/';
 setup([identity(),{body:wrap(row(root+'Pr%c3%bcfung,%20Ordner/','<x:resourcetype><x:collection/></x:resourcetype>')+row(root+'Pr%c3%bcfung,%20Ordner/note.md','<x:resourcetype/><oc:fileid>123</oc:fileid>'))}]);
 const r=await call('files_list',{folder:'/Prüfung, Ordner'},['files:read']);
 assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.entries.length,1);
 assert.equal(r.structuredContent.entries[0].path,'/Prüfung, Ordner/note.md');
});
test('Malformed XML, entity definitions and partial access errors fail explicitly',()=>{
 assert.throws(()=>module.parseDav('<broken>'));
 assert.throws(()=>module.parseDav('<!DOCTYPE x [<!ENTITY a "xx">]><x/>'));
 assert.throws(()=>module.parseDav(wrap('<x:response><x:href>/test</x:href><x:propstat><x:prop/><x:status>HTTP/1.1 403 Forbidden</x:status></x:propstat></x:response>')));
});
test('Cross-origin and user-path escape rejected; unsupported files rejected before fetch',async()=>{
 assert.throws(()=>module.safeDavPath('https://evil.test/remote.php/dav/files/ChatGPT/a','/remote.php/dav/'));
 assert.throws(()=>module.safeDavPath('/remote.php/dav/files/Soul/a','/remote.php/dav/files/ChatGPT/'));
 assert.throws(()=>module.filePath('/remote.php/dav/files/ChatGPT/','/../Soul/a'));
 setup();const r=await call('files_read_text',{path:'/document.pdf'},['files:read']);assert.equal(r.isError,true);assert.equal(fetched.length,0);
});
test('HTTP failures and oversized bodies are errors, never empty results',async()=>{
 setup([identity(),{status:403,body:'private upstream error detail'}]);const r=await call('files_list',{folder:'/'},['files:read']);assert.equal(r.isError,true);assert.doesNotMatch(JSON.stringify(r),/private upstream/);
 setup([identity(),fileMeta('/big.txt'),{status:200,body:'x'.repeat(128*1024+1),headers:{etag:'"v2"'}}]);const large=await call('files_read_text',{path:'/big.txt'},['files:read']);assert.equal(large.isError,true);
});
test('Worker-compatible redirect handling rejects redirects without following their targets',async()=>{
 for(const status of [301,302,303,307,308]){
  setup([{status,body:'redirect',headers:{location:'https://untrusted.example.test/'}}]);
  const r=await call('nextcloud_account',{},['calendar:read']);
  assert.equal(r.isError,true);
  assert.match(JSON.stringify(r),new RegExp(`HTTP ${status}`));
  assert.equal(fetched.length,1);
  assert.equal(fetched[0].options.redirect,'manual');
  assert.ok(fetched[0].url.startsWith('https://cloud.example.test/'));
 }
});
test('Consent distinguishes requested permissions from unchecked optional read permissions',async()=>{
 const redirect='https://chatgpt.com/connector_platform_oauth_redirect';const client=await module.createClientId([redirect]);
 const query=new URLSearchParams({response_type:'code',client_id:client,redirect_uri:redirect,state:'test',code_challenge:'test',code_challenge_method:'S256',resource:'https://connector.example.test/deck-mcp',scope:'calendar:read'});
 const response=await module.consent(new Request('https://connector.example.test/oauth/authorize?'+query,{headers:{'oai-authenticated-user-email':'owner@example.test'}}));const html=await response.text();assert.equal(response.status,200);assert.match(html,/Kalender und Termine lesen/);assert.doesNotMatch(html,/Karten anlegen/);assert.match(html, /name="additional_scope" value="files:read"/);assert.doesNotMatch(html, /checked/);
});
process.on('exit',()=>{globalThis.fetch=nativeFetch});

test('Compressed content ETag is separate from verified DAV version, never normalized into a strong tag',async()=>{
 setup([identity(),fileMeta('/note.md'),{status:200,body:'Grüße',headers:{etag:'W/"v2-br"'}},fileMeta('/note.md')]);
 const r=await call('files_read_text',{path:'/note.md'},['files:read']);assert.equal(r.isError,undefined);assert.equal(r.structuredContent.etag,'"v2"');assert.equal(r.structuredContent.contentEtag,'W/"v2-br"');assert.equal(r.structuredContent.versionVerified,true);assert.equal(new Headers(fetched[2].options.headers).get('if-match'),'"v2"');
});
test('Conditional text reads reject concurrent version/identity changes and weak metadata versions',async()=>{
 for(const after of [fileMeta('/note.md','"v3"'),fileMeta('/note.md','"v2"','999')]){
  setup([identity(),fileMeta('/note.md'),{status:200,body:'text',headers:{etag:'W/"v2-br"'}},after]);
  const r=await call('files_read_text',{path:'/note.md'},['files:read']);assert.equal(r.isError,true);assert.match(JSON.stringify(r),/während des Lesens geändert/);
 }
 setup([identity(),fileMeta('/note.md','W/"v2"')]);const weak=await call('files_read_text',{path:'/note.md'},['files:read']);assert.equal(weak.isError,true);assert.equal(fetched.length,2);
 setup([identity(),fileMeta('/note.md'),{status:412}]);const conflict=await call('files_read_text',{path:'/note.md'},['files:read']);assert.equal(conflict.isError,true);assert.match(JSON.stringify(conflict),/412/);
});
