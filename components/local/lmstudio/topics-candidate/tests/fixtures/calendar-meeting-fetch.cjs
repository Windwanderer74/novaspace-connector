// SPDX-License-Identifier: AGPL-3.0-or-later
// Child-process native DAV fixture. No request may leave this process.
const assert=require('node:assert/strict');
const {appendFileSync}=require('node:fs');
const principal='/remote.php/dav/principals/users/Soul/';
const home='/remote.php/dav/calendars/Soul/';
const calendar=home+'novaforge-pilot/';
const event=calendar+'sample-meeting-001.ics';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(path,props)=>`<d:response><d:href>${esc(path)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi=s=>new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">${s}</d:multistatus>`,{status:207});
const zone=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VTIMEZONE','TZID:Europe/Berlin','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0100','TZOFFSETTO:+0100','END:STANDARD','END:VTIMEZONE','END:VCALENDAR',''].join('\r\n');
const original=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Fixture//DE','BEGIN:VEVENT','UID:sample-meeting-001@novaforge','DTSTAMP:20261029T001931Z','LAST-MODIFIED:20261029T001931Z','SEQUENCE:0','DTSTART:20261030T110000Z','DTEND:20261030T110500Z','SUMMARY:NovaSpace – Zustellprobe','DESCRIPTION:Einmalige technische Zustellprobe für NovaSpace. Keine Teilnahme erforderlich.','ORGANIZER:mailto:operator@example.invalid','ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:invitee@example.invalid','END:VEVENT','END:VCALENDAR',''].join('\r\n');
globalThis.fetch=async(url,o={})=>{
 const u=new URL(url),path=u.pathname,method=o.method??'GET';
 assert.equal(u.origin,'https://cloud.example.invalid');
 if(process.env.NS_TEST_CALENDAR_LOG)appendFileSync(process.env.NS_TEST_CALENDAR_LOG,JSON.stringify({path,method})+'\n');
 assert.ok(!['PUT','DELETE','POST','PROPPATCH'].includes(method),'No native write in preview regression');
 if(path==='/remote.php/dav/')return multi(row(path,`<d:current-user-principal><d:href>${principal}</d:href></d:current-user-principal>`));
 if(path===principal){
  if(o.body.includes('calendar-user-address-set'))return multi(row(path,`<c:calendar-user-address-set><d:href>mailto:operator@example.invalid</d:href></c:calendar-user-address-set><c:schedule-inbox-URL><d:href>${home}inbox/</d:href></c:schedule-inbox-URL><c:schedule-outbox-URL><d:href>${home}outbox/</d:href></c:schedule-outbox-URL>`));
  return multi(row(path,`<c:calendar-home-set><d:href>${home}</d:href></c:calendar-home-set>`));
 }
 if(method==='OPTIONS')return new Response(null,{headers:{DAV:'calendar-access, calendar-auto-schedule'}});
 if(path===home+'outbox/'&&method==='PROPFIND')return multi(row(path,`<d:resourcetype><d:collection/><c:schedule-outbox/></d:resourcetype><d:owner><d:href>${principal}</d:href></d:owner><d:current-user-privilege-set><d:privilege><c:schedule-send-invite/></d:privilege></d:current-user-privilege-set>`));
 if(path===calendar&&method==='PROPFIND')return multi(row(path,`<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:owner><d:href>${principal}</d:href></d:owner><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><cs:getctag>fixture-c1</cs:getctag><c:calendar-timezone>${esc(zone)}</c:calendar-timezone>`));
 if(method==='REPORT'&&(path===calendar||path===home+'trashbin/objects/')){
  if(o.body.includes('calendar-query'))return multi('');
  if(process.env.NS_TEST_CALENDAR_EXISTING==='1')return multi(row(event,'<d:getetag>&quot;9e0f94fd13a615b140129a9a7b2c9999&quot;</d:getetag><c:calendar-data>'+esc(original)+'</c:calendar-data>'));
  return multi(`<d:response><d:href>${event}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`);
 }
 throw Error('Unexpected fixture endpoint '+method+' '+path);
};
