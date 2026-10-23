// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudAccount, parseDav, safeDavPath } from './nextcloud-read';
import { calendarPath, calendarRequest, fullCalendarAccess, readCalendarSettingsAt } from './calendar-settings';
import { planningVersion } from './planning-json';
import { unfoldGroupware, propertyName, propertyValue, utcGroupwareStamp, xmlText } from './groupware-codec';

type Span={start:string;end:string};
type Interval={start:number;end:number};
const iso=(n:number)=>new Date(n).toISOString().replace('.000Z','Z');
export function planningInstant(input:string){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(input))throw new Error('Datum/Uhrzeit mit Sekunden und ausdrücklichem gültigen UTC-Offset erforderlich.');
 const n=Date.parse(input),date=input.slice(0,10),time=input.slice(11,19),offset=input.endsWith('Z')?0:(input.at(-6)==='-'?-1:1)*(Number(input.slice(-5,-3))*60+Number(input.slice(-2)));
 if(!Number.isFinite(n)||new Date(n+offset*60000).toISOString().slice(0,19)!==date+'T'+time||Math.abs(offset)>14*60)throw new Error('Unmögliches Datum oder ungültige Uhrzeit.');
 return n;
}
function range(a:Span){const start=planningInstant(a.start),end=planningInstant(a.end);if(end<=start||end-start>31*86400000)throw new Error('Zeitraum muss positiv und höchstens31Tage lang sein.');return {start,end};}
const value=(x:any)=>typeof x==='string'?x:typeof x?.['#text']==='string'?x['#text']:'';
function utc(input:string){if(!/^\d{8}T\d{6}Z$/.test(input))throw new Error('Belegungsantwort benötigt UTC-Zeitpunkte.');return planningInstant(input.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6Z'));}
function duration(input:string){
 const m=/^P(?:(\d+)W|(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)$/.exec(input);
 if(!m||!m.slice(1).some(x=>x!==undefined)||input.endsWith('T'))throw new Error('Ungültige Belegungsdauer.');
 const n=(Number(m[1]??0)*7*86400+Number(m[2]??0)*86400+Number(m[3]??0)*3600+Number(m[4]??0)*60+Number(m[5]??0))*1000;
 if(!Number.isSafeInteger(n)||n<=0)throw new Error('Ungültige Belegungsdauer.');return n;
}
export function parseFreeBusy(data:string,bounds:Interval){
 const lines=unfoldGroupware(data),stack:string[]=[],props:string[]=[];let roots=0,components=0;const versions:string[]=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],k=propertyName(line),v=propertyValue(line);
  if(k==='BEGIN'){if(v==='VCALENDAR'&&stack.length===0&&i===0)roots++;else if(v==='VFREEBUSY'&&stack.join()==='VCALENDAR')components++;else throw new Error('Unbekannte Belegungsstruktur.');stack.push(v);}
  else if(k==='END'){if(stack.pop()!==v||(!stack.length&&i!==lines.length-1))throw new Error('Unvollständige Belegungsstruktur.');}
  else if(stack.join()==='VCALENDAR,VFREEBUSY')props.push(line);
  else if(stack.join()==='VCALENDAR'){if(k==='VERSION')versions.push(v);}
  else throw new Error('Ungültige Belegungszeile.');
 }
 if(stack.length||roots!==1||components!==1||versions.join(',')!=='2.0')throw new Error('Keine eindeutige VFREEBUSY-Antwort.');
 for(const [key,expected]of [['DTSTART',bounds.start],['DTEND',bounds.end]] as const){const found=props.filter(l=>propertyName(l)===key);if(found.length!==1||found[0].slice(0,found[0].indexOf(':'))!==key||utc(propertyValue(found[0]))!==expected)throw new Error('Belegungszeitraum nicht vollständig bestätigt.');}
 if(props.some(l=>['RRULE','RDATE','EXRULE','EXDATE','RECURRENCE-ID'].includes(propertyName(l))))throw new Error('Unerwartete Serie in Belegungsantwort.');
 const periods:(Interval&{type:string})[]=[];let count=0;
 for(const line of props.filter(l=>propertyName(l)==='FREEBUSY')){
  const header=line.slice(0,line.indexOf(':')).toUpperCase(),params=header.split(';').slice(1);let type='BUSY';const used=new Set<string>();
  for(const p of params){const [key,v,...tail]=p.split('=');if(used.has(key)||tail.length||(key!=='FBTYPE'&&key!=='VALUE')||(key==='VALUE'&&v!=='PERIOD'))throw new Error('Unbekannter Belegungsparameter.');used.add(key);if(key==='FBTYPE'){if(!['FREE','BUSY','BUSY-TENTATIVE','BUSY-UNAVAILABLE'].includes(v))throw new Error('Unbekannter Belegungsstatus.');type=v;}}
  for(const p of propertyValue(line).split(',')){if(++count>5000)throw new Error('Mehr als5000 Belegungsperioden.');const pair=p.split('/');if(pair.length!==2)throw new Error('Ungültige Belegungsperiode.');const start=utc(pair[0]),end=pair[1].startsWith('P')?start+duration(pair[1]):utc(pair[1]);if(!Number.isSafeInteger(end)||end<=start)throw new Error('Ungültiges Belegungsende.');if(type!=='FREE'&&end>bounds.start&&start<bounds.end)periods.push({start:Math.max(start,bounds.start),end:Math.min(end,bounds.end),type});}
 }
 return {periods,count};
}
/** Native35 FreeBusyGenerator silently caps dense RRULEs and ignores bare RDATE.
 * Inspect projected recurrence fields before relying on its result. No event text returned. */
export function auditRecurrence(data:string){
 const lines=unfoldGroupware(data),stack:string[]=[],events:string[][]=[];let current:string[]|null=null,closed=false;
 for(let i=0;i<lines.length;i++){
  const l=lines[i],k=propertyName(l),v=propertyValue(l);
  if(k==='BEGIN'){if(v==='VCALENDAR'&&!stack.length&&i===0&&!closed)stack.push(v);else if(v==='VEVENT'&&stack.join()==='VCALENDAR'){stack.push(v);current=[];}else throw new Error('Unbekannte Serien-Prüfstruktur.');}
  else if(k==='END'){if(stack.pop()!==v)throw new Error('Unvollständige Serien-Prüfstruktur.');if(v==='VEVENT'){events.push(current!);current=null;}if(!stack.length){closed=true;if(i!==lines.length-1)throw new Error('Mehrere Kalenderobjekte.');}}
  else if(current)current.push(l);
 }
 if(stack.length||!closed||!events.length||events.length>128)throw new Error('Serienbestand nicht begrenzt prüfbar.');
 const uids=new Set<string>(),keys=new Set<string>();let masters=0;
 for(const event of events){const ids=event.filter(l=>propertyName(l)==='UID'),rules=event.filter(l=>propertyName(l)==='RRULE'),rec=event.filter(l=>propertyName(l)==='RECURRENCE-ID');if(ids.length!==1||!propertyValue(ids[0])||rec.length>1||rules.length>1)throw new Error('Serie nicht eindeutig.');uids.add(propertyValue(ids[0]));if(rec.some(l=>/;RANGE=/i.test(l)))throw new Error('Serienänderung ab einem Vorkommen nicht sicher auswertbar.');const key=rec.length?propertyValue(rec[0]):'master';if(keys.has(key))throw new Error('Doppelte Serienkennung.');keys.add(key);if(!rec.length)masters++;
  if(event.some(l=>['RDATE','EXRULE'].includes(propertyName(l))))throw new Error('RDATE/EXRULE kann der native Belegungsweg nicht vollständig bestätigen. Kalenderplanung abgebrochen.');
  for(const rule of rules){const tokens=propertyValue(rule).toUpperCase().split(';'),names=tokens.map(t=>t.split('=')[0]);const allowed=['FREQ','UNTIL','COUNT','INTERVAL','BYDAY','BYMONTHDAY','BYYEARDAY','BYWEEKNO','BYMONTH','BYSETPOS','WKST'];if(new Set(names).size!==names.length||tokens.some(t=>t.split('=').length!==2)||names.some(n=>!allowed.includes(n))||!tokens.some(t=>/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(t)))throw new Error('Dichte oder unbekannte Serienregel: vollständige Belegung nicht bestätigt.');}
 }
 if(events.length>1&&!events.some(e=>!e.some(l=>propertyName(l)==='RECURRENCE-ID')&&e.some(l=>propertyName(l)==='RRULE')))throw new Error('Serienausnahmen ohne unterstützte Wiederholungsregel.');
 if(uids.size!==1||masters!==1)throw new Error('Kein eindeutiger Serienmaster.');return {components:events.length};
}
function merged(input:Interval[]):Interval[]{const out:Interval[]=[];for(const p of input.toSorted((a,b)=>a.start-b.start||a.end-b.end)){const prev=out.at(-1);if(prev&&p.start<=prev.end)prev.end=Math.max(prev.end,p.end);else out.push({...p});}return out;}
async function batches<T,R>(input:T[],fn:(x:T)=>Promise<R>){const out:R[]=[];for(let i=0;i<input.length;i+=3)out.push(...await Promise.all(input.slice(i,i+3).map(fn)));return out;}
export async function calendarFreeBusy(a:Span&{calendarPaths:string[]}){
 const bounds=range(a);if(!Array.isArray(a.calendarPaths)||a.calendarPaths.length<1||a.calendarPaths.length>10)throw new Error('1–10 Kalender ausdrücklich auswählen.');
 const account=await nextcloudAccount(),paths=a.calendarPaths.map(p=>calendarPath(account,p));if(new Set(paths).size!==paths.length)throw new Error('Kalender doppelt ausgewählt.');
 const before=await batches(paths,p=>readCalendarSettingsAt(account,p));
 for(const c of before)if(!fullCalendarAccess(c)||!c.reports.includes('free-busy-query')||(!c.ctag&&!c.syncToken))throw new Error('Vollständige Kalenderbelegung nicht bestätigt. Nur eigene vollständig lesbare VEVENT-Kalender mit nativer Belegungsabfrage und Änderungskennung verwenden. Freigegebene Kalender können private Termine ausblenden.');
 const stamp=`start="${utcGroupwareStamp(new Date(bounds.start))}" end="${utcGroupwareStamp(new Date(bounds.end))}"`;
 let bytes=0,objects=0,periodCount=0;
 const sources=await batches(paths,async(path)=>{
  const projected=['UID','DTSTART','DTEND','DURATION','RRULE','RDATE','EXRULE','EXDATE','RECURRENCE-ID','STATUS','TRANSP'].map(name=>`<c:prop name="${name}"/>`).join('');
  const audit=await calendarRequest(path,'REPORT',`<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data><c:comp name="VCALENDAR"><c:prop name="VERSION"/><c:comp name="VEVENT">${projected}</c:comp></c:comp></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${stamp}/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,'1');
  bytes+=new TextEncoder().encode(audit.text).length;if(bytes>2*1024*1024||audit.status!==207)throw new Error('Serienprüfung nicht vollständig bestätigt oder zu groß.');
  const rows=parseDav(audit.text);objects+=rows.length;if(rows.length>100||objects>500)throw new Error('Mehr als100 Ereignisobjekte je Kalender/500 insgesamt. Zeitraum eingrenzen.');
  const seen=new Set<string>();for(const row of rows){const p=safeDavPath(row.href,path);if(!p.slice(path.length)||p.slice(path.length).includes('/')||seen.has(p)||!value(row.props.getetag))throw new Error('Ereignisquelle nicht eindeutig.');seen.add(p);auditRecurrence(value(row.props['calendar-data']));}
  const r=await calendarRequest(path,'REPORT',`<?xml version="1.0"?><c:free-busy-query xmlns:c="urn:ietf:params:xml:ns:caldav"><c:time-range ${stamp}/></c:free-busy-query>`,undefined,256*1024);
  bytes+=new TextEncoder().encode(r.text).length;if(bytes>2*1024*1024||r.status!==200||r.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='text/calendar')throw new Error('Keine vollständige native Belegungsantwort.');
  const parsed=parseFreeBusy(r.text,bounds);if(!rows.length&&parsed.periods.length)throw new Error('Belegung und Ereignisprüfung widersprechen sich.');periodCount+=parsed.count;if(periodCount>5000)throw new Error('Mehr als5000 Belegungsperioden insgesamt.');
  return {calendarPath:path,periods:parsed.periods,objectsAudited:rows.length};
 });
 const after=await batches(paths,p=>readCalendarSettingsAt(account,p));if(after.some((c,i)=>c.version!==before[i].version)||(await nextcloudAccount()).uid!==account.uid)throw new Error('Kalender, Rechte oder Konto während Belegungsprüfung verändert. Neu lesen.');
 const busy=merged(sources.flatMap(s=>s.periods));const snapshot=await planningVersion({account:account.uid,bounds,calendars:before,sources});
 return {account:account.uid,start:iso(bounds.start),end:iso(bounds.end),sources:sources.map((s,i)=>({...s,version:before[i].version,periods:s.periods.map(p=>({start:iso(p.start),end:iso(p.end),type:p.type}))})),busy:busy.map(p=>({start:iso(p.start),end:iso(p.end)})),snapshot,observedCoverage:'selected_owned_calendars_supported_recurrence',atomic:false,note:'Beobachtete native Belegung ausgewählter eigener Kalender, keine Reservierung oder allgemeine Anwesenheitsgarantie. Tentative und nicht verfügbare Zeiten blockieren ebenfalls. Vor tatsächlicher Buchung neu prüfen. Keine Termintexte ausgegeben und keine Einladung gesendet.'};
}
export function calendarLocalTime(n:number,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone,calendar:'iso8601',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(n),get=(k:string)=>parts.find(p=>p.type===k)?.value;
 const offset=get('timeZoneName')!;if(!/^GMT(?:[+-]\d{2}:\d{2})?$/.test(offset))throw new Error('Zeitzonenoffset nicht eindeutig.');return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset==='GMT'?'+00:00':offset.slice(3)}`;
}
const local = calendarLocalTime;
export async function calendarFindSlots(a:{calendarPaths:string[];timeZone:string;windows:Span[];durationMinutes:number;bufferMinutes:number;unavailable?:Span[];limit:number}){
 if(!Number.isInteger(a.durationMinutes)||a.durationMinutes<1||a.durationMinutes>1440||!Number.isInteger(a.bufferMinutes)||a.bufferMinutes<0||a.bufferMinutes>240||!Number.isInteger(a.limit)||a.limit<1||a.limit>50||a.windows.length<1||a.windows.length>62||(a.unavailable?.length??0)>100)throw new Error('Ungültige Planungsgrenzen.');
 try{new Intl.DateTimeFormat('en-GB',{timeZone:a.timeZone}).format(0);}catch{throw new Error('Gültige IANA-Zeitzone erforderlich.');}
 const windows=merged(a.windows.map(w=>{const r=range(w);for(const [s,n] of [[w.start,r.start],[w.end,r.end]] as const)if(local(n,a.timeZone).replace('+00:00','Z')!==s.replace('+00:00','Z'))throw new Error('Zeitfenster-Offset passt nicht zur benannten Zeitzone des Datums.');return r;}));
 const start=windows[0].start,end=windows.at(-1)!.end;range({start:iso(start),end:iso(end)});
 const extra=(a.unavailable??[]).map(range),padding=a.bufferMinutes*60000;
 // Include surrounding busy periods so padding near the selected window edges is respected.
 const paddedStart=start-padding,paddedEnd=end+padding;if(paddedEnd-paddedStart>31*86400000)throw new Error('Zeitraum einschließlich Puffer größer als31Tage.');
 const observed=await calendarFreeBusy({calendarPaths:a.calendarPaths,start:iso(paddedStart),end:iso(paddedEnd)});
 const busy=merged([...observed.busy.map(range),...extra].map(p=>({start:p.start-padding,end:p.end+padding}))),duration=a.durationMinutes*60000,gaps:Interval[]=[];
 for(const window of windows){let cursor=window.start;for(const b of busy){if(b.end<=cursor)continue;if(b.start>=window.end)break;if(b.start-cursor>=duration)gaps.push({start:cursor,end:Math.min(b.start,window.end)});cursor=Math.max(cursor,b.end);if(cursor>=window.end)break;}if(window.end-cursor>=duration)gaps.push({start:cursor,end:window.end});}
 return {account:observed.account,timeZone:a.timeZone,durationMinutes:a.durationMinutes,bufferMinutes:a.bufferMinutes,calendarPaths:a.calendarPaths,snapshot:observed.snapshot,totalWindows:gaps.length,truncated:gaps.length>a.limit,slots:gaps.slice(0,a.limit).map(p=>({start:iso(p.start),end:iso(p.start+duration),availableUntil:iso(p.end),latestStart:iso(p.end-duration),localStart:local(p.start,a.timeZone),localEnd:local(p.start+duration,a.timeZone),localLatestStart:local(p.end-duration,a.timeZone)})),reserved:false,atomic:false,note:'Je freiem zusammenhängendem Zeitfenster ein frühester Vorschlag; latestStart erlaubt spätere Starts. Nur ausdrücklich gewählte Arbeitsfenster/Kalender und zusätzliche Abwesenheiten berücksichtigt. Symmetrischer Puffer um vorhandene Belegungen/Abwesenheiten. Noch kein Termin angelegt; vor Buchung neu prüfen.'};
}
