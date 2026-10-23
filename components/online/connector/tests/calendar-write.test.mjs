// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export { createDeckMcpServer } from './lib/mcp'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { normalizeScope } from './lib/oauth';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/calendar.mjs'});
const api = await import('../.sites-runtime/test/calendar.mjs');
const { createMcpHandler } = await import('@modelcontextprotocol/server');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service',NEXTCLOUD_APP_PASSWORD:'test-only',OAUTH_SIGNING_SECRET:'local-test-key-not-a-production-key-123',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test'});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const home='/remote.php/dav/calendars/ChatGPT/';
const calendarPath=home+'pilot_shared_by_Soul/';
const eventId='novaforge-test-20260917';
const eventPath=calendarPath+eventId+'.ics';
const input={calendarPath,eventId,title:'Test – Grüße; Termin, Planung',description:'Zeile eins\nZeile zwei\\Ende',location:'Bonn',start:'2026-09-18T10:00:00+02:00',end:'2026-09-18T10:30:00+02:00',reminderMinutes:15};
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const wrap=s=>`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${s}</d:multistatus>`;
const row=(path,props)=>`<d:response><d:href>${path}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
let data, revision, requests, fault, emptyReport, getStatus;
function reset(){data=undefined;revision=0;requests=[];fault=undefined;emptyReport=false;getStatus=undefined;}
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 requests.push({url,options});
 assert.equal(options.redirect,'manual');
 assert.ok(url.startsWith('https://cloud.example.test/remote.php/dav/'));
 if(options.method==='PROPFIND')return new Response(wrap(row(url.endsWith('/dav/')?'/remote.php/dav/':'/remote.php/dav/principals/users/ChatGPT/',url.endsWith('/dav/')?'<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>':`<c:calendar-home-set><d:href>${home}</d:href></c:calendar-home-set>`)),{status:207});
 if(options.method==='REPORT'){
  if(fault==='read-after-write'&&revision>0)return new Response('',{status:503});
  if(fault==='forbidden-read')return new Response('',{status:403});
  if(emptyReport)return new Response(wrap(''),{status:207});
  if(fault==='wrong-report-path')return new Response(wrap(row(calendarPath+'another.ics',`<d:getetag>"v1"</d:getetag><c:calendar-data>${xml(data)}</c:calendar-data>`)),{status:207});
  const response=data===undefined?`<d:response><d:href>${eventPath}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`:row(eventPath,`<d:getetag>"v${revision}"</d:getetag><c:calendar-data>${xml(data)}</c:calendar-data>`);
  return new Response(wrap(response),{status:207});
 }
 assert.equal(url,'https://cloud.example.test'+eventPath);
 if(options.method==='GET')return new Response(getStatus===undefined&&data!==undefined?data:null,{status:getStatus??(data===undefined?404:200),headers:{etag:`"v${revision}"`}});
 if(fault==='redirect')return new Response(null,{status:302,headers:{location:'https://other.test/'}});
 if(fault==='race')return new Response(null,{status:412});
 if(options.method==='PUT'){
  if(new Headers(options.headers).get('If-None-Match')==='*'){
   if(data!==undefined)return new Response(null,{status:412});
  }else assert.equal(new Headers(options.headers).get('If-Match'),`"v${revision}"`);
  const existed=data!==undefined;data=options.body;revision++;
  if(fault==='lost-response')throw new Error('simulated connection loss');
  return new Response(null,{status:existed?204:201});
 }
 if(options.method==='DELETE'){assert.equal(new Headers(options.headers).get('If-Match'),`"v${revision}"`);data=undefined;return new Response(null,{status:204});}
 throw new Error('Unexpected method');
};
async function call(name,args,scopes=['calendar:read','calendar:write']){
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'test',clientId:'test',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 assert.equal(response.status,200);const body=await response.text();const value=response.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(r=>r.id===1):JSON.parse(body);assert.ok(value.result,JSON.stringify(value));return value.result;
}
const writes=()=>requests.filter(r=>['PUT','DELETE'].includes(r.options.method));

test('Empty multiget confirms absence with exact-object GET, including deletion verification',async()=>{
 reset();const created=await call('calendar_create_event',input);emptyReport=true;
 const existing=await call('calendar_read_event',{calendarPath,eventPath});
 assert.equal(existing.isError,undefined);assert.equal(existing.structuredContent.found,true);
 assert.equal(existing.structuredContent.calendarData,data);assert.equal(existing.structuredContent.etag,created.structuredContent.etag);
 const removed=await call('calendar_delete_event',{calendarPath,eventPath,etag:created.structuredContent.etag});
 assert.equal(removed.structuredContent.verified,true);assert.equal(removed.structuredContent.found,false);
 const absent=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(absent.structuredContent.found,false);
 assert.equal(absent.structuredContent.absenceConfirmedBy,'GET 404 after empty calendar-multiget');
 assert.deepEqual(writes().map(r=>r.options.method),['PUT','DELETE']);
 assert.ok(requests.filter(r=>r.options.method==='GET').every(r=>r.url==='https://cloud.example.test'+eventPath));
});

test('Empty multiget does not turn redirects, access failures, or invalid GET content into absence',async()=>{
 for(const status of [301,302,401,403,429,500,503,204]){
  reset();emptyReport=true;getStatus=status;
  const r=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(r.isError,true);assert.match(JSON.stringify(r),new RegExp(`HTTP ${status}`));assert.equal(writes().length,0);
 }
 reset();emptyReport=true;data='not a calendar';const invalid=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(invalid.isError,true);
 reset();await call('calendar_create_event',input);fault='wrong-report-path';const wrong=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(wrong.isError,true);assert.equal(requests.filter(r=>r.options.method==='GET').length,0);
});

test('Calendar writes require explicit write scope, not existing read or Deck write rights',async()=>{
 for(const [name,args] of [['calendar_create_event',input],['calendar_update_event',{calendarPath,eventPath,etag:'"v1"',title:'x'}],['calendar_delete_event',{calendarPath,eventPath,etag:'"v1"'}]]){
  reset();const r=await call(name,args,['deck:read','deck:write','calendar:read','files:read']);assert.equal(r.isError,true);assert.match(r._meta['mcp/www_authenticate'][0],/calendar:write/);assert.equal(requests.length,0);
 }
 assert.ok(!api.normalizeScope(null).includes('calendar:write'));
});

test('Create, read, shift across Berlin DST, preserve fields and reminder, delete and confirm absence',async()=>{
 reset();const created=await call('calendar_create_event',input);assert.equal(created.isError,undefined,JSON.stringify(created));assert.equal(created.structuredContent.verified,true);assert.equal(created.structuredContent.etag,'"v1"');assert.equal(created.structuredContent.event.title,input.title);assert.equal(created.structuredContent.event.description,input.description);
 assert.match(data,/DTSTART:20260918T080000Z/);assert.match(data,/TRIGGER:-PT15M/);
 // Simulate a property introduced by another calendar client before a fresh read.
 data=data.replace('END:VEVENT','X-CLIENT-PROPERTY:behalten\r\nEND:VEVENT');revision++;
 const read=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(read.structuredContent.etag,'"v2"');
 const updated=await call('calendar_update_event',{calendarPath,eventPath,etag:'"v2"',start:'2026-10-26T10:00:00+01:00',end:'2026-10-26T10:30:00+01:00'});
 assert.equal(updated.isError,undefined);assert.equal(updated.structuredContent.verified,true);assert.match(data,/DTSTART:20261026T090000Z/);assert.match(data,/DTEND:20261026T093000Z/);assert.match(data,/X-CLIENT-PROPERTY:behalten/);assert.match(data,/TRIGGER:-PT15M/);assert.match(data,/UID:novaforge-test-20260917@novaforge/);assert.equal(updated.structuredContent.event.title,input.title);assert.equal(updated.structuredContent.event.description,input.description);
 const removed=await call('calendar_delete_event',{calendarPath,eventPath,etag:updated.structuredContent.etag});assert.equal(removed.structuredContent.verified,true);assert.equal(removed.structuredContent.found,false);
 const absent=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(absent.structuredContent.found,false);
 assert.deepEqual(writes().map(r=>r.options.method),['PUT','PUT','DELETE']);
});

test('Duplicate create is not an overwrite and stale ETags stop before any write',async()=>{
 reset();await call('calendar_create_event',input);const original=data;
 const duplicate=await call('calendar_create_event',{...input,title:'Overwrite'});assert.equal(duplicate.isError,true);assert.equal(data,original);
 for(const tool of ['calendar_update_event','calendar_delete_event']){
  const n=writes().length;const r=await call(tool,{calendarPath,eventPath,etag:'"old"',...(tool==='calendar_update_event'?{title:'x'}:{})});assert.equal(r.isError,true);assert.equal(writes().length,n);
 }
 fault='race';const r=await call('calendar_update_event',{calendarPath,eventPath,etag:'"v1"',title:'changed'});assert.equal(r.isError,true);assert.match(JSON.stringify(r),/Versionskonflikt/);assert.equal(data,original);
});

test('Uncertain create returns stable path; accepted mutation with failed readback never claims verification',async()=>{
 reset();fault='lost-response';let r=await call('calendar_create_event',input);assert.equal(r.isError,true);assert.match(JSON.stringify(r),/Schreibergebnis unklar/);assert.ok(JSON.stringify(r).includes(eventPath));assert.equal(writes().length,1);
 fault=undefined;r=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(r.structuredContent.found,true);
 reset();fault='read-after-write';r=await call('calendar_create_event',input);assert.equal(r.structuredContent.writeAccepted,true);assert.equal(r.structuredContent.verified,false);assert.equal(writes().length,1);
});

test('Series, invitations and malformed all-day dates cannot be modified or deleted',async()=>{
 for(const extra of ['RRULE:FREQ=DAILY','ATTENDEE:mailto:someone@example.test','ORGANIZER:mailto:owner@example.test','RDATE:20260919T080000Z']){
  reset();await call('calendar_create_event',input);data=data.replace('END:VEVENT',extra+'\r\nEND:VEVENT');
  for(const tool of ['calendar_update_event','calendar_delete_event']){const n=writes().length;const r=await call(tool,{calendarPath,eventPath,etag:'"v1"',...(tool==='calendar_update_event'?{title:'x'}:{})});assert.equal(r.isError,true);assert.equal(writes().length,n);}
 }
 reset();await call('calendar_create_event',input);data=data.replace('DTSTART:20260918T080000Z','DTSTART;VALUE=DATE:20260918');const r=await call('calendar_delete_event',{calendarPath,eventPath,etag:'"v1"'});assert.equal(r.isError,true);assert.equal(writes().length,1);
});

test('Unicode folding and newlines cannot inject iCalendar properties',async()=>{
 reset();const title='Grüße 🌍 '.repeat(45)+'\nATTENDEE:mailto:someone@example.test';
 const r=await call('calendar_create_event',{...input,title});assert.equal(r.isError,undefined);assert.equal(r.structuredContent.event.title,title);assert.ok(data.split('\r\n').every(l=>Buffer.byteLength(l)<=75));assert.doesNotMatch(data,/\r\nATTENDEE:/);
});

test('Unsafe paths, weak ETags, incomplete times and redirects are rejected',async()=>{
 reset();let r=await call('calendar_create_event',{...input,calendarPath:'/remote.php/dav/calendars/Soul/personal/'});assert.equal(r.isError,true);assert.equal(writes().length,0);
 r=await call('calendar_update_event',{calendarPath,eventPath,etag:'W/"v1"',title:'x'});assert.equal(r.isError,true);assert.equal(writes().length,0);
 r=await call('calendar_update_event',{calendarPath,eventPath,etag:'"v1"',start:input.start});assert.equal(r.isError,true);assert.equal(writes().length,0);
 r=await call('calendar_create_event',{...input,end:input.start});assert.equal(r.isError,true);assert.equal(writes().length,0);
 reset();fault='redirect';r=await call('calendar_create_event',input);assert.equal(r.isError,true);assert.equal(writes().length,1);assert.match(JSON.stringify(r),/HTTP 302/);
 reset();fault='forbidden-read';r=await call('calendar_read_event',{calendarPath,eventPath});assert.equal(r.isError,true);assert.match(JSON.stringify(r),/403/);
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});

test('All-day events use real date values and exclusive end, retain UID and can be moved/deleted',async()=>{
 reset();let r=await call('calendar_create_event',{...input,start:undefined,end:undefined,startDate:'2026-10-24',endDate:'2026-10-26'});
 assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.event.allDay,true);assert.match(data,/DTSTART;VALUE=DATE:20261024/);assert.match(data,/DTEND;VALUE=DATE:20261026/);
 data=data.replace('END:VEVENT','X-CLIENT:keep\r\nEND:VEVENT');
 r=await call('calendar_update_event',{calendarPath,eventPath,etag:'"v1"',startDate:'2026-10-25',endDate:'2026-10-27'});
 assert.equal(r.isError,undefined,JSON.stringify(r));assert.match(data,/DTSTART;VALUE=DATE:20261025/);assert.match(data,/X-CLIENT:keep/);assert.match(data,/UID:novaforge-test-20260917@novaforge/);
 r=await call('calendar_delete_event',{calendarPath,eventPath,etag:r.structuredContent.etag});assert.equal(r.structuredContent.verified,true);
});
test('One DISPLAY alarm can be changed, removed and added while preserving unfamiliar alarm fields',async()=>{
 reset();await call('calendar_create_event',input);data=data.replace('END:VALARM','X-ALARM-CUSTOM:keep\r\nEND:VALARM');
 let r=await call('calendar_update_event',{calendarPath,eventPath,etag:'"v1"',reminderMinutes:60});assert.equal(r.isError,undefined,JSON.stringify(r));assert.match(data,/TRIGGER:-PT60M/);assert.match(data,/X-ALARM-CUSTOM:keep/);
 r=await call('calendar_update_event',{calendarPath,eventPath,etag:r.structuredContent.etag,reminderMinutes:null});assert.equal(r.isError,undefined);assert.doesNotMatch(data,/BEGIN:VALARM/);
 r=await call('calendar_update_event',{calendarPath,eventPath,etag:r.structuredContent.etag,reminderMinutes:10});assert.equal(r.isError,undefined);assert.match(data,/TRIGGER:-PT10M/);
 const oldWrites=writes().length;data=data.replace('END:VEVENT','BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT5M\r\nEND:VALARM\r\nEND:VEVENT');
 r=await call('calendar_update_event',{calendarPath,eventPath,etag:r.structuredContent.etag,reminderMinutes:20});assert.equal(r.isError,true);assert.equal(writes().length,oldWrites);
});
test('Impossible dates, mixed modes and missing exclusive end stop before writes',async()=>{
 for(const patch of [{startDate:'2026-02-30',endDate:'2026-03-01'},{startDate:'2026-10-23',endDate:'2026-10-23'},{startDate:'2026-10-23'},{startDate:'2026-10-23',endDate:'2026-10-24',start:input.start,end:input.end}]){
  reset();const r=await call('calendar_create_event',{...input,start:undefined,end:undefined,...patch});assert.equal(r.isError,true);assert.equal(writes().length,0);
 }
});
