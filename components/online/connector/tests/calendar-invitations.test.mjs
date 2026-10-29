// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({ stdin: { contents: "export * from './lib/calendar-invitations';export * from './lib/mcp-calendar-invitations';export {ALL_SCOPES,normalizeScope} from './lib/oauth';export {setDeckRuntimeConfig} from './lib/runtime-config';export {inheritedPolicy,withConnectionPolicy,accessOverview} from './lib/connection-policy';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: '.sites-runtime/test/calendar-invitations.mjs' });
const api = await import('../.sites-runtime/test/calendar-invitations.mjs');
api.setDeckRuntimeConfig({ NEXTCLOUD_BASE_URL: 'https://calendar.test', NEXTCLOUD_LOGIN_NAME: 'fixture', NEXTCLOUD_APP_PASSWORD: 'private-calendar-secret', CONNECTOR_PUBLIC_ORIGIN: 'https://connector.test', CONNECTOR_ALLOWED_EMAIL: 'owner@example.test', OAUTH_SIGNING_SECRET: 'test-only-signing-key-12345678901234567890' });
const originalFetch = globalThis.fetch; after(() => globalThis.fetch = originalFetch);
const principal = '/remote.php/dav/principals/users/ChatGPT/', home = '/remote.php/dav/calendars/ChatGPT/', calendarPath = home + 'personal/', eventPath = calendarPath + 'invite.ics';
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const row = (path, props) => `<d:response><d:href>${esc(path)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi = text => new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">${text}</d:multistatus>`, { status: 207 });
let data, etag, aliases, organizer, attendees, rights, owner, fault, calls, support, outbox, calendarKind;
const seed = (extra = []) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fixture//EN', 'BEGIN:VEVENT', 'UID:invite-123@example.test', 'DTSTAMP:20261023T010000Z', 'SEQUENCE:4', 'DTSTART:20261025T190000Z', 'DTEND:20261025T200000Z', 'SUMMARY:Besprechung', 'LOCATION:Ort behalten', 'X-KEEP:Unverändert', organizer, ...attendees, ...extra, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'DESCRIPTION:Behalten', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
function reset() { aliases = ['mailto:chatgpt@example.test', 'mailto:alias@example.test']; organizer = 'ORGANIZER;CN="Fremder: Name":mailto:organizer@example.test'; attendees = ['ATTENDEE;CN="Eigener: Name";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;X-KEEP=yes:mailto:chatgpt@example.test', 'ATTENDEE;PARTSTAT=ACCEPTED:mailto:other@example.test']; rights = ['read', 'write']; owner = principal; etag = '"v1"'; fault = null; calls = []; support = true; outbox = home + 'outbox/'; calendarKind = ''; data = seed(); }
const writes = () => calls.filter(x => ['PUT', 'POST', 'DELETE', 'PROPPATCH'].includes(x.method));
globalThis.fetch = async (url, o) => {
  const path = new URL(url).pathname, method = o.method, headers = new Headers(o.headers); calls.push({ path, method, headers, body: o.body });
  assert.equal(new URL(url).origin, 'https://calendar.test'); assert.equal(o.redirect, 'manual'); assert.ok(o.signal);
  if (method === 'OPTIONS') return new Response(null, { headers: { DAV: support ? '1, calendar-access, calendar-auto-schedule' : '1, calendar-access' } });
  if (path === '/remote.php/dav/') return multi(row(path, `<d:current-user-principal><d:href>${principal}</d:href></d:current-user-principal>`));
  if (path === principal) {
    if (o.body.includes('calendar-user-address-set')) return multi(row(fault === 'foreignPrincipal' ? '/remote.php/dav/principals/users/Other/' : principal, `<c:calendar-user-address-set>${aliases.map(x => `<d:href>${esc(x)}</d:href>`).join('')}</c:calendar-user-address-set><c:schedule-inbox-URL><d:href>${home}inbox/</d:href></c:schedule-inbox-URL><c:schedule-outbox-URL><d:href>${esc(outbox)}</d:href></c:schedule-outbox-URL>`));
    return multi(row(path, `<c:calendar-home-set><d:href>${home}</d:href></c:calendar-home-set>`));
  }
  if (method === 'PROPFIND' && path === calendarPath) return multi(row(path, `<d:resourcetype><d:collection/><c:calendar/>${calendarKind}</d:resourcetype><d:owner><d:href>${owner}</d:href></d:owner><d:current-user-privilege-set>${rights.map(p => `<d:privilege><d:${p}/></d:privilege>`).join('')}</d:current-user-privilege-set><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><cs:getctag>c1</cs:getctag>`));
  if (method === 'REPORT' && path === calendarPath) {
    if (writes().length && fault === 'readback') return new Response(null, { status: 503 });
    return multi(row(eventPath, `<d:getetag>${esc(etag)}</d:getetag><c:calendar-data>${esc(data)}</c:calendar-data>`));
  }
  if (method === 'PUT' && path === eventPath) {
    assert.equal(headers.get('If-Match'), '"v1"'); assert.equal(headers.get('Schedule-Reply'), 'T'); assert.equal(headers.get('x-nc-scheduling'), null); assert.match(headers.get('Content-Type'), /text\/calendar/);
    if (fault === 'conflict') return new Response(null, { status: 412 });
    data = o.body; etag = '"v2"';
    if (fault === 'lost') throw Error('private-calendar-secret');
    if (fault === 'status') data = data.replace('ORGANIZER;', 'ORGANIZER;SCHEDULE-STATUS=1.2;');
    if (fault === 'otherAttendee') data = data.replace('PARTSTAT=ACCEPTED:mailto:other', 'PARTSTAT=DECLINED:mailto:other');
    if (fault === 'time') data = data.replace('DTSTART:20261025T190000Z', 'DTSTART:20261025T180000Z');
    if (fault === 'uid') data = data.replace('UID:invite-123', 'UID:other');
    if (fault === 'sequence') data = data.replace('SEQUENCE:4', 'SEQUENCE:5');
    return new Response(null, { status: 204 });
  }
  throw Error('Unexpected ' + method + ' ' + path);
};
async function args(response = 'ACCEPTED') { const p = await api.readCalendarInvitation(calendarPath, eventPath); return { calendarPath, eventPath, expectedAccount: p.account, expectedUid: p.uid, expectedResponseVersion: p.responseVersion, etag: p.etag, attendeeAddress: p.ownAttendee?.address ?? 'mailto:chatgpt@example.test', response, acknowledgeNativeReply: true }; }
async function seriesArgs(response = 'ACCEPTED') { const p = await api.readCalendarInvitation(calendarPath, eventPath, 'series'); return { calendarPath, eventPath, expectedAccount: p.account, expectedUid: p.uid, expectedResponseVersion: p.responseVersion, etag: p.etag, attendeeAddress: p.ownAttendee?.address ?? 'mailto:chatgpt@example.test', response, responseScope: 'series', acknowledgeNativeReply: true }; }
test('A recurring master requires explicit series selection; rule and exclusions are only read', async () => {
 reset(); data=seed(['RRULE:FREQ=WEEKLY;COUNT=5','EXDATE:20261108T190000Z']);const before=data;
 assert.equal((await api.readCalendarInvitation(calendarPath,eventPath)).supportedForResponse,false);
 const p=await api.readCalendarInvitation(calendarPath,eventPath,'series');
 assert.equal(p.responseScope,'series');assert.equal(p.seriesMaster,true);assert.equal(p.supportedForResponse,true,JSON.stringify(p.reasons));
 assert.equal(data,before);assert.equal(writes().length,0);
});
test('All three explicit master-series answers preserve recurrence, exclusions, attendees and original fields', async () => {
 for(const response of ['ACCEPTED','TENTATIVE','DECLINED']){
  reset();data=seed(['RRULE:FREQ=WEEKLY;COUNT=5','EXDATE:20261108T190000Z']);const before=data;
  const r=await api.respondCalendarInvitation(await seriesArgs(response));
  assert.equal(r.outcome,'verified');assert.equal(r.responseScope,'series');assert.equal(r.nativeDeliveryVerified,false);assert.equal(r.nativeReplyRequested,true);
  assert.equal(data.replace(/\r\n[ \t]/g,'').replace(`PARTSTAT=${response};RSVP=FALSE;X-KEEP=yes`,'PARTSTAT=NEEDS-ACTION;RSVP=TRUE;X-KEEP=yes'),before);
  assert.equal(writes().length,1);
 }
});
test('A master defined by additional dates uses the same explicit whole-series answer', async () => {
 reset();data=seed(['RDATE:20261101T190000Z,20261108T190000Z']);
 const p=await api.readCalendarInvitation(calendarPath,eventPath,'series');assert.equal(p.supportedForResponse,true);
 const r=await api.respondCalendarInvitation(await seriesArgs());assert.equal(r.outcome,'verified');assert.match(data,/RDATE:20261101T190000Z,20261108T190000Z/);
});
test('Equivalent series answer performs no write or notification request', async () => {
 reset();data=seed(['RRULE:FREQ=WEEKLY;COUNT=5']).replace('PARTSTAT=NEEDS-ACTION','PARTSTAT=ACCEPTED');
 const r=await api.respondCalendarInvitation(await seriesArgs());assert.equal(r.outcome,'unchanged');assert.equal(r.responseScope,'series');assert.equal(r.nativeReplyRequested,false);assert.equal(writes().length,0);
});
test('Response version binds the chosen scope and refuses a single-event preview for a series answer', async () => {
 reset();data=seed(['RRULE:FREQ=WEEKLY;COUNT=5']);
 const single=await api.readCalendarInvitation(calendarPath,eventPath),series=await api.readCalendarInvitation(calendarPath,eventPath,'series');
 assert.notEqual(single.responseVersion,series.responseVersion);
 await assert.rejects(api.respondCalendarInvitation({...await args(),responseScope:'series'}));assert.equal(writes().length,0);
});
test('Series mode does not accept ordinary events, detached instances, EXRULE or multi-component exceptions', async () => {
 for(const mode of ['ordinary','detached','exrule','exceptions']){
  reset();if(mode==='detached')data=seed(['RECURRENCE-ID:20261025T190000Z']);
  if(mode==='exrule')data=seed(['RRULE:FREQ=WEEKLY;COUNT=5','EXRULE:FREQ=WEEKLY;COUNT=2']);
  if(mode==='exceptions')data=seed(['RRULE:FREQ=WEEKLY;COUNT=5']).replace('END:VCALENDAR','BEGIN:VEVENT\r\nUID:invite-123@example.test\r\nRECURRENCE-ID:20261101T190000Z\r\nDTSTART:20261101T200000Z\r\nDTEND:20261101T210000Z\r\n'+organizer+'\r\n'+attendees.join('\r\n')+'\r\nEND:VEVENT\r\nEND:VCALENDAR');
  const p=await api.readCalendarInvitation(calendarPath,eventPath,'series');assert.equal(p.supportedForResponse,false,mode);
  await assert.rejects(api.respondCalendarInvitation(await seriesArgs()));assert.equal(writes().length,0,mode);
 }
});
test('Series answers retain account, ownership, scheduling and explicit acknowledgement guards', async () => {
 for(const mode of ['organizer','alias','rights','support','cancelled','acknowledgement']){
  reset();data=seed(['RRULE:FREQ=WEEKLY;COUNT=5']);
  if(mode==='organizer')data=data.replace(organizer,'ORGANIZER:mailto:chatgpt@example.test');
  if(mode==='alias')aliases=['mailto:other@example.test','mailto:chatgpt@example.test'];
  if(mode==='rights')rights=['read'];if(mode==='support')support=false;if(mode==='cancelled')data=data.replace('BEGIN:VEVENT','BEGIN:VEVENT\r\nSTATUS:CANCELLED');
  const a=await seriesArgs();if(mode==='acknowledgement')a.acknowledgeNativeReply=false;
  await assert.rejects(api.respondCalendarInvitation(a));assert.equal(writes().length,0,mode);
 }
});
test('Conflict, uncertain reply and concurrent series edits do not trigger a second PUT', async () => {
 for(const f of ['conflict','lost','sequence','otherAttendee','readback']){
  reset();data=seed(['RRULE:FREQ=WEEKLY;COUNT=5']);const a=await seriesArgs();fault=f;
  const r=await api.respondCalendarInvitation(a);assert.equal(r.outcome,f==='conflict'?'conflict':'unknown');assert.equal(r.responseScope,'series');assert.equal(r.nativeDeliveryVerified,false);assert.equal(writes().length,1,f);
 }
});
test('Both invitation schemas default to single and require a literal series scope without new tools', async () => {
 reset();const tools=new Map();api.registerCalendarInvitationTools({registerTool(n,c){tools.set(n,c);}});assert.equal(tools.size,3);
 for(const name of ['calendar_read_invitation','calendar_respond_invitation']){
  const schema=tools.get(name).inputSchema,a=name==='calendar_read_invitation'?{calendarPath,eventPath}:await args();
  assert.equal(schema.parse(a).responseScope,'single');assert.equal(schema.parse({...a,responseScope:'series'}).responseScope,'series');
  for(const responseScope of ['occurrence','all',false])assert.equal(schema.safeParse({...a,responseScope}).success,false);
 }
 await assert.rejects(api.readCalendarInvitation(calendarPath,eventPath,'all'));assert.equal(writes().length,0);
});
test('Actual read and reply handlers carry the parsed series scope through preview, guards and native readback', async () => {
 reset();data=seed(['RRULE:FREQ=WEEKLY;COUNT=5','EXDATE:20261108T190000Z']);
 const tools=new Map();api.registerCalendarInvitationTools({registerTool(n,c,f){tools.set(n,{c,f});}});
 const reader=tools.get('calendar_read_invitation'),writer=tools.get('calendar_respond_invitation');
 const context=t=>({http:{authInfo:{scopes:t.c.securitySchemes[0].scopes}}});
 const read=await reader.f(reader.c.inputSchema.parse({calendarPath,eventPath,responseScope:'series'}),context(reader));
 assert.equal(read.isError,undefined);const p=read.structuredContent;assert.equal(p.supportedForResponse,true);assert.equal(p.responseScope,'series');assert.equal(writes().length,0);
 const input={calendarPath,eventPath,responseScope:'series',expectedAccount:p.account,expectedUid:p.uid,expectedResponseVersion:p.responseVersion,etag:p.etag,attendeeAddress:p.ownAttendee.address,response:'TENTATIVE',acknowledgeNativeReply:true};
 const replied=await writer.f(writer.c.inputSchema.parse(input),context(writer));
 assert.equal(replied.isError,undefined);assert.equal(replied.structuredContent.outcome,'verified');assert.equal(replied.structuredContent.responseScope,'series');assert.equal(replied.structuredContent.nativeDeliveryVerified,false);assert.equal(writes().length,1);
});
test('Scheduling discovery binds native aliases/endpoints and does not send a message', async () => { reset(); aliases.push('urn:uuid:fixture'); const p = await api.readCalendarScheduling(); assert.equal(p.account, 'ChatGPT'); assert.deepEqual(p.addresses, ['mailto:alias@example.test', 'mailto:chatgpt@example.test']); assert.equal(p.autoSchedulingAdvertised, true); assert.equal(p.nativeDeliveryVerified, false); assert.equal(writes().length, 0); });
test('Foreign principal, outside scheduling endpoint and excessive aliases fail before any write', async () => { for (const f of ['principal', 'endpoint', 'aliases']) { reset(); if (f === 'principal') fault = 'foreignPrincipal'; if (f === 'endpoint') outbox = 'https://other.invalid/outbox/'; if (f === 'aliases') aliases = Array.from({ length: 51 }, (_, i) => `mailto:p${i}@example.test`); await assert.rejects(api.readCalendarScheduling()); assert.equal(writes().length, 0); } });
test('Selected invitation exposes exact native own participant and a version without mutating it', async () => { reset(); const before = data; const p = await api.readCalendarInvitation(calendarPath, eventPath); assert.equal(p.supportedForResponse, true); assert.deepEqual(p.ownAttendee, { address: 'mailto:chatgpt@example.test', partstat: 'NEEDS-ACTION' }); assert.equal(p.organizer.name, 'Fremder: Name'); assert.equal(p.responseVersion.length, 64); assert.equal(data, before); assert.equal(writes().length, 0); });
test('All three responses change only own PARTSTAT/RSVP; UID, sequence, times, others and alarms survive', async () => { for (const status of ['ACCEPTED', 'TENTATIVE', 'DECLINED']) { reset(); const before = data, r = await api.respondCalendarInvitation(await args(status)); assert.equal(r.outcome, 'verified'); assert.equal(r.localResponseVerified, true); assert.equal(r.nativeReplyRequested, true); assert.equal(r.nativeDeliveryVerified, false); assert.equal(data.replace(/\r\n[ \t]/g, '').replace(`PARTSTAT=${status};RSVP=FALSE;X-KEEP=yes`, 'PARTSTAT=NEEDS-ACTION;RSVP=TRUE;X-KEEP=yes'), before); assert.equal(writes().length, 1); } });
test('Equivalent existing answer performs no write or notification request', async () => { reset(); data = data.replace('PARTSTAT=NEEDS-ACTION', 'PARTSTAT=ACCEPTED'); const r = await api.respondCalendarInvitation(await args()); assert.equal(r.outcome, 'unchanged'); assert.equal(r.nativeReplyRequested, false); assert.equal(writes().length, 0); });
test('Native organizer schedule-status annotation is read without claiming delivery', async () => { reset(); const a = await args(); fault = 'status'; const r = await api.respondCalendarInvitation(a); assert.equal(r.outcome, 'verified'); assert.equal(r.nativeScheduleStatus, '1.2'); assert.equal(r.nativeDeliveryVerified, false); });
test('Account, UID, ETag, fingerprint, chosen participant and acknowledgement must all match', async () => { for (const [key, value] of [['expectedAccount', 'Soul'], ['expectedUid', 'other'], ['etag', '"old"'], ['expectedResponseVersion', 'a'.repeat(64)], ['attendeeAddress', 'mailto:other@example.test'], ['acknowledgeNativeReply', false]]) { reset(); const a = await args(); await assert.rejects(api.respondCalendarInvitation({ ...a, [key]: value })); assert.equal(writes().length, 0, key); } });
test('Missing or multiple own aliases and own-organizer events cannot be answered', async () => { for (const f of ['missing', 'multiple', 'organizer']) { reset(); if (f === 'missing') aliases = ['mailto:else@example.test']; if (f === 'multiple') aliases.push('mailto:other@example.test'); if (f === 'organizer') organizer = 'ORGANIZER:mailto:chatgpt@example.test'; data = seed(); assert.equal((await api.readCalendarInvitation(calendarPath, eventPath)).supportedForResponse, false); await assert.rejects(api.respondCalendarInvitation(await args())); assert.equal(writes().length, 0); } });
test('Shared/read-only/subscribed calendars and unsupported scheduling stay read-only', async () => { for (const f of ['shared', 'readonly', 'subscribed', 'noAuto']) { reset(); if (f === 'shared') owner = principal.replace('ChatGPT', 'Soul'); if (f === 'readonly') rights = ['read']; if (f === 'subscribed') calendarKind = '<cs:subscribed/>'; if (f === 'noAuto') support = false; assert.equal((await api.readCalendarInvitation(calendarPath, eventPath)).supportedForResponse, false); await assert.rejects(api.respondCalendarInvitation(await args())); assert.equal(writes().length, 0); } });
test('Series, cancellation, delegation, client agent and forced sends cannot trigger replies', async () => { for (const extra of ['RRULE:FREQ=DAILY;COUNT=2', 'RECURRENCE-ID:20261025T190000Z', 'STATUS:CANCELLED', 'ATTENDEE;DELEGATED-TO="mailto:x@example.test":mailto:delegate@example.test', 'ATTENDEE;SCHEDULE-AGENT=CLIENT:mailto:client@example.test', 'ATTENDEE;SCHEDULE-FORCE-SEND=REQUEST:mailto:forced@example.test']) { reset(); data = seed([extra]); const p = await api.readCalendarInvitation(calendarPath, eventPath); assert.equal(p.supportedForResponse, false, extra); await assert.rejects(api.respondCalendarInvitation(await args())); assert.equal(writes().length, 0); } });
test('Duplicate properties, participants and parameters are not silently collapsed', async () => { for (const extra of ['UID:duplicate', 'ORGANIZER:mailto:another@example.test', 'ATTENDEE:mailto:chatgpt@example.test', 'ATTENDEE;PARTSTAT=ACCEPTED;PARTSTAT=DECLINED:mailto:duplicate@example.test']) { reset(); data = seed([extra]); await assert.rejects(api.readCalendarInvitation(calendarPath, eventPath)); assert.equal(writes().length, 0); } });
test('Raw METHOD payloads and unsupported personal attendee types remain read-only', async () => { for (const f of ['method', 'resource', 'delegated']) { reset(); if (f === 'method') data = data.replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:REQUEST'); if (f === 'resource') data = data.replace('ROLE=REQ-PARTICIPANT', 'CUTYPE=RESOURCE'); if (f === 'delegated') data = data.replace('PARTSTAT=NEEDS-ACTION', 'PARTSTAT=DELEGATED'); assert.equal((await api.readCalendarInvitation(calendarPath, eventPath)).supportedForResponse, false); await assert.rejects(api.respondCalendarInvitation(await args())); assert.equal(writes().length, 0); } });
test('A changed principal address set invalidates the response version', async () => { reset(); const a = await args(); aliases.push('mailto:new@example.test'); await assert.rejects(api.respondCalendarInvitation(a)); assert.equal(writes().length, 0); });
test('Concurrent UID, sequence, time or other-participant edits report unknown, never retry', async () => { for (const f of ['otherAttendee', 'time', 'uid', 'sequence', 'readback']) { reset(); const a = await args(); fault = f; const r = await api.respondCalendarInvitation(a); assert.equal(r.outcome, 'unknown', f); assert.equal(r.nativeDeliveryVerified, false); assert.equal(writes().length, 1); } });
test('Lost PUT response reports unknown without leaking credentials or automatic resubmission', async () => { reset(); const a = await args(); fault = 'lost'; const r = await api.respondCalendarInvitation(a); assert.equal(r.outcome, 'unknown'); assert.doesNotMatch(JSON.stringify(r), /private-calendar-secret/); assert.equal(writes().length, 1); });
test('If-Match conflict reports conflict and preserves original data', async () => { reset(); const a = await args(), before = data; fault = 'conflict'; const r = await api.respondCalendarInvitation(a); assert.equal(r.outcome, 'conflict'); assert.equal(data, before); assert.equal(writes().length, 1); });
test('Three tool contracts enforce scope and central app switch before native access', async () => { reset(); const tools = new Map(); api.registerCalendarInvitationTools({ registerTool(n, c, f) { tools.set(n, { c, f }); } }); assert.equal(tools.size, 3); assert.ok(api.ALL_SCOPES.includes('calendar:schedule')); assert.doesNotMatch(api.normalizeScope(null), /calendar:schedule/); for (const [n, { c, f }] of tools) { for (const missing of c.securitySchemes[0].scopes) { const r = await f({}, { http: { authInfo: { scopes: c.securitySchemes[0].scopes.filter(s => s !== missing) } } }); assert.equal(r.isError, true, n); } const policy = api.inheritedPolicy(); policy.apps.calendar = n === 'calendar_respond_invitation' ? 'read' : 'off'; assert.equal((await api.withConnectionPolicy(policy, () => f({}, { http: { authInfo: { scopes: [...api.ALL_SCOPES] } } }))).isError, true); } assert.equal(calls.length, 0); const p = api.inheritedPolicy(); p.apps.calendar = 'read'; assert.equal(api.accessOverview(p, ['calendar:schedule']).find(x => x.app === 'calendar').writeAvailable, false); });
test('Response schema requires explicit acknowledgement and rejects hidden recipient/notification fields', async () => { reset(); const tools = new Map(); api.registerCalendarInvitationTools({ registerTool(n, c) { tools.set(n, c); } }); const schema = tools.get('calendar_respond_invitation').inputSchema, a = await args(); assert.equal(schema.safeParse(a).success, true); for (const patch of [{ acknowledgeNativeReply: false }, { organizer: 'mailto:changed@example.test' }, { notify: false }, { etag: 'W/"weak"' }, { response: 'DELEGATED' }]) assert.equal(schema.safeParse({ ...a, ...patch }).success, false); });
