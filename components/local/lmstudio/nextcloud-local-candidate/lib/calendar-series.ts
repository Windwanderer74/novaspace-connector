// SPDX-License-Identifier: AGPL-3.0-or-later
import ICAL from 'ical.js';
import { nextcloudAccount } from './nextcloud-read';
import { calendarPath, fullCalendarAccess, readCalendarSettingsAt } from './calendar-settings';
import { calendarLocalTime } from './calendar-planning';
import { calendarWriteInternals as dav } from './calendar-write';
import { realDate } from './groupware-codec';

const MAX = 256 * 1024, MAX_OCCURRENCES = 500;
const name = (line:string) => line.split(/[;:]/,1)[0].toUpperCase();
const value = (line:string) => line.slice(line.indexOf(':')+1);
type Block = { start:number; end:number; indices:number[] };

// Keep unfolded source lines for mutations. The RFC parser is used for values,
// recurrence and semantic readback, never as a lossy whole-object rewrite.
function structure(data:string) {
 if(new TextEncoder().encode(data).length>MAX||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data))throw Error('Kalenderobjekt zu groß oder ungültig.');
 const lines=data.replace(/\r\n[ \t]|\n[ \t]/g,'').split(/\r?\n/).filter(Boolean);
 const stack:string[]=[], events:Block[]=[], zones:Block[]=[];let active:Block|undefined, zone:Block|undefined, components=0;
 if(lines.length>5000||lines[0]!=='BEGIN:VCALENDAR'||lines.at(-1)!=='END:VCALENDAR')throw Error('Genau ein VCALENDAR-Original erforderlich.');
 for(let i=0;i<lines.length;i++){
  const l=lines[i],k=name(l),v=value(l).toUpperCase();if(l.indexOf(':')<1||/\r/.test(l))throw Error('Ungültige Kalenderzeile.');
  if(k==='BEGIN'){
   if(++components>128||stack.length>=8)throw Error('Kalenderstruktur zu groß.');
   if(!stack.length&&(i!==0||v!=='VCALENDAR'))throw Error('Mehrere Kalenderobjekte.');
   if(v==='VEVENT'){if(stack.join()!=='VCALENDAR')throw Error('Ungültige Ereignisstruktur.');active={start:i,end:-1,indices:[]};events.push(active);}
   if(v==='VTIMEZONE'){if(stack.join()!=='VCALENDAR')throw Error('Ungültige Zeitzonenstruktur.');zone={start:i,end:-1,indices:[]};zones.push(zone);}
   stack.push(v);
  }else if(k==='END'){
   if(stack.pop()!==v)throw Error('Unvollständige Kalenderstruktur.');
   if(v==='VEVENT'){active!.end=i;active=undefined;}if(v==='VTIMEZONE'){zone!.end=i;zone=undefined;}
   if(!stack.length&&i!==lines.length-1)throw Error('Mehrere Kalenderobjekte.');
  }else if(stack.join()==='VCALENDAR,VEVENT')active!.indices.push(i);
 }
 if(stack.length)throw Error('Unvollständiger Kalender.');
 const component=ICAL.Component.fromString(dav.serialize(lines));
 if(component.name!=='vcalendar'||component.getAllProperties('version').length!==1||component.getFirstPropertyValue('version')!=='2.0')throw Error('iCalendar-Version nicht eindeutig.');
 return {lines,events,zones,component};
}
type Parsed=ReturnType<typeof structure>;
function one(p:Parsed,b:Block,k:string,required=false){const found=b.indices.map(i=>p.lines[i]).filter(l=>name(l)===k);if(found.length>1||(required&&found.length!==1))throw Error(`Serieneigenschaft ${k} nicht eindeutig.`);return found[0];}
function dateValue(s:string){if(!/^\d{8}$/.test(s))throw Error('Ungültiges Seriendatum.');const d=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;realDate(d);return d;}
function validTime(t:ICAL.Time){dateValue(`${String(t.year).padStart(4,'0')}${String(t.month).padStart(2,'0')}${String(t.day).padStart(2,'0')}`);if(t.year<1970||t.year>2100||t.hour>23||t.minute>59||t.second>59)throw Error('Serienzeit außerhalb des unterstützten Bereichs1970–2100.');}
function rawTime(s:string,date:boolean){
 if(!(date?/^\d{8}$/:/^\d{8}T\d{6}Z?$/).test(s))throw Error('Nicht unterstützter Zeitwert.');dateValue(s.slice(0,8));
 if(!date&&(Number(s.slice(9,11))>23||Number(s.slice(11,13))>59||Number(s.slice(13,15))>59))throw Error('Ungültige Uhrzeit.');
}
function zoneMatches(t:ICAL.Time){
 if(t.isDate||t.zone.tzid==='UTC')return;
 try{if(calendarLocalTime(t.toUnixTime()*1000,t.zone.tzid).slice(0,19)===t.toString().slice(0,19))return;}catch{/* Unknown native TZID is not silently interpreted as UTC. */}
 throw Error('Native Zeitzone/Zeit stimmt nicht mit IANA überein; Lücke oder unbekannte Zone.');
}

export type SeriesRule={frequency:'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY';interval?:number;count?:number;until?:string;byDay?:string[]};
function ruleString(a:SeriesRule,start:ICAL.Time){
 if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(a.frequency)||!Number.isInteger(a.interval??1)||(a.interval??1)<1||(a.interval??1)>99)throw Error('Nicht unterstützte Wiederholung.');
 if((a.count!==undefined)===(a.until!==undefined))throw Error('Genau ein Serienende angeben: count oder until.');
 const parts=[`FREQ=${a.frequency}`,`INTERVAL=${a.interval??1}`];
 if(a.count!==undefined){if(!Number.isInteger(a.count)||a.count<2||a.count>MAX_OCCURRENCES)throw Error('Serienanzahl2–500 erforderlich.');parts.push(`COUNT=${a.count}`);}
 if(a.until!==undefined){
  if(start.isDate){if(!/^\d{4}-\d{2}-\d{2}$/.test(a.until))throw Error('Ganztagsserie benötigt ein Enddatum.');parts.push(`UNTIL=${realDate(a.until)}`);}
  else{if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(a.until))throw Error('Zeitgebundene Serie benötigt until mit Sekunden in UTC/Z.');const d=new Date(a.until);if(!Number.isFinite(+d)||d.toISOString().slice(0,19)!==a.until.slice(0,19))throw Error('Ungültiges Serienende.');parts.push(`UNTIL=${dav.stamp(d)}`);}
 }
 if(a.byDay!==undefined){if(a.frequency!=='WEEKLY'||!a.byDay.length||a.byDay.length>7||new Set(a.byDay).size!==a.byDay.length||a.byDay.some(d=>!['MO','TU','WE','TH','FR','SA','SU'].includes(d)))throw Error('byDay nur als eindeutige Wochentage einer Wochenserie.');parts.push(`BYDAY=${a.byDay.join(',')}`);}
 const rule=parts.join(';');checkRule(rule,start);boundedOccurrences(rule,start,true);return rule;
}
function checkRule(raw:string,start:ICAL.Time){
 if(raw.length>255)throw Error('Serienregel zu groß.');const pairs=raw.split(';').map(p=>p.split('=')),map=new Map(pairs.map(p=>[p[0],p[1]]));
 if(pairs.some(p=>p.length!==2)||map.size!==pairs.length||[...map.keys()].some(k=>!['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','WKST'].includes(k))||!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(map.get('FREQ')??''))throw Error('Nur einfache tägliche/wöchentliche/monatliche/jährliche Serien bearbeiten.');
 for(const k of ['INTERVAL','COUNT'])if(map.has(k)&&(!/^[1-9]\d{0,3}$/.test(map.get(k)!)||Number(map.get(k))>(k==='COUNT'?500:99)))throw Error('Seriengrenze überschritten.');
 if(map.has('COUNT')&&map.has('UNTIL'))throw Error('COUNT und UNTIL dürfen nicht zusammen vorkommen.');
 if(map.has('WKST')&&!['MO','TU','WE','TH','FR','SA','SU'].includes(map.get('WKST')!))throw Error('Ungültiger Wochenbeginn.');
 if(map.has('BYDAY')){const days=map.get('BYDAY')!.split(',');if(map.get('FREQ')!=='WEEKLY'||new Set(days).size!==days.length||days.some(d=>!['MO','TU','WE','TH','FR','SA','SU'].includes(d)))throw Error('Nicht unterstützte Wochentagsregel.');if(!days.includes(['','SU','MO','TU','WE','TH','FR','SA'][start.dayOfWeek()]))throw Error('Serienbeginn muss zur Wochentagsregel gehören.');}
 if(map.has('UNTIL')){const s=map.get('UNTIL')!;rawTime(s,start.isDate);if(!start.isDate&&!s.endsWith('Z'))throw Error('Zeitgebundene Serie benötigt UTC-Serienende.');const until=ICAL.Recur.fromString(raw).until!;validTime(until);if(until.compare(start)<0)throw Error('Serienende liegt vor Beginn.');}
 return ICAL.Recur.fromString(raw);
}
function boundedOccurrences(raw:string,start:ICAL.Time,requireEnd:boolean,target?:string){
 const r=checkRule(raw,start);if(requireEnd&&!r.count&&!r.until)throw Error('Neues Serienende erforderlich.');
 const it=r.iterator(start),limitYear=start.year+5;let count=0,first=true,matched=false;const instants:ICAL.Time[]=[];
 while(true){const t=it.next();if(!t)break;if(t.year>limitYear||t.toUnixTime()-start.toUnixTime()>5*366*86400)throw Error('Serienprüfung auf fünf Jahre begrenzt.');if(++count>MAX_OCCURRENCES)throw Error('Mehr als500 Serienvorkommen.');if(first&&t.compare(start)!==0)throw Error('Serienbeginn passt nicht zur Regel.');first=false;validTime(t);zoneMatches(t);instants.push(t.clone());if(target&&t.toICALString()===target){matched=true;break;}if(target&&t.toICALString()>target)break;}
 if(target&&!matched)throw Error('Gewählter Originalbeginn ist kein bestätigtes Serienvorkommen innerhalb der Prüfgrenzen.');return instants;
}
function timezoneGuard(p:Parsed){
 const ids:string[]=[];
 for(const z of p.component.getAllSubcomponents('vtimezone')){
  const id=z.getFirstPropertyValue('tzid');if(typeof id!=='string'||ids.includes(id)||z.getAllProperties('tzid').length!==1||!z.getAllSubcomponents().length)throw Error('Zeitzone nicht eindeutig.');ids.push(id);
  for(const c of z.getAllSubcomponents()){
   if(!['standard','daylight'].includes(c.name)||c.getAllSubcomponents().length)throw Error('Unbekannte Zeitzonenstruktur.');
   for(const prop of c.getAllProperties('rrule')){const r=String(prop.getFirstValue());if(r.length>255||!r.includes('FREQ=YEARLY')||r.split(';').some(s=>! /^(FREQ=YEARLY|BYMONTH=(?:[1-9]|1[0-2])|BYMONTHDAY=-?\d{1,2}|BYDAY=-?[1-5]?(?:MO|TU|WE|TH|FR|SA|SU)|UNTIL=\d{8}T\d{6}Z)$/.test(s)))throw Error('Unbekannte/dichte Zeitzonenregel.');}
   for(const prop of c.getAllProperties('rrule'))for(const part of String(prop.getFirstValue()).split(';'))if(part.startsWith('BYMONTHDAY=')){const d=Number(part.slice(11));if(!d||Math.abs(d)>31)throw Error('Ungültiger Zeitzonen-Monatstag.');}
   if(c.getAllProperties('rdate').flatMap(x=>x.getValues()).length>500||c.getAllProperties('rrule').length>1||c.getAllProperties('dtstart').length!==1||c.getAllProperties('tzoffsetfrom').length!==1||c.getAllProperties('tzoffsetto').length!==1)throw Error('Zeitzonengrenze/Grundlage ungültig.');
  }
 }
 for(const z of p.zones)for(const line of p.lines.slice(z.start+1,z.end)){
  if(name(line)==='DTSTART'){const v=value(line);rawTime(v,false);if(v.endsWith('Z')||Number(v.slice(0,4))<1601||Number(v.slice(0,4))>2100)throw Error('Zeitzonenbeginn nicht unterstützt.');}
  if(['TZOFFSETFROM','TZOFFSETTO'].includes(name(line))){const v=value(line);if(!/^[+-]\d{4}(?:\d{2})?$/.test(v)||Number(v.slice(1,3))>23||Number(v.slice(3,5))>59||Number(v.slice(5)||0)>59||v==='-0000')throw Error('Ungültiger Zeitzonenoffset.');}
 }
 return ids;
}
function editable(p:Parsed){
 const ids=timezoneGuard(p);
 if(p.events.length!==1||p.component.getAllSubcomponents().some(c=>!['vevent','vtimezone'].includes(c.name)))throw Error('Nur eine Masterserie ohne abweichende Einzelvorkommen bearbeiten.');
 if(p.lines.some((l,i)=>['METHOD','ATTENDEE','ORGANIZER','RECURRENCE-ID','RDATE','EXRULE'].includes(name(l))&& !p.zones.some(z=>i>z.start&&i<z.end)))throw Error('Einladungen, zusätzliche Termine oder abweichende Einzelvorkommen bleiben in der nativen App.');
 const b=p.events[0],c=p.component.getFirstSubcomponent('vevent')!;
 for(const k of ['UID','DTSTART','DTEND','RRULE','SEQUENCE','DTSTAMP','LAST-MODIFIED','SUMMARY','DESCRIPTION','LOCATION'])one(p,b,k,['UID','DTSTART','DTEND','RRULE'].includes(k));
 if(one(p,b,'DURATION'))throw Error('Nur Serien mit ausdrücklichem Ende bearbeiten.');
 const uid=String(c.getFirstPropertyValue('uid'));if(!uid||uid.length>255)throw Error('Ungültige Serien-UID.');
 const times=['dtstart','dtend'].map(k=>{
  const prop=c.getFirstProperty(k)!;const tz=prop.getParameter('tzid');
  if(Object.keys(prop.toJSON()[1]).some(k=>k!=='tzid'))throw Error('Nicht unterstützte Zeitparameter.');
  if(tz&&(typeof tz!=='string'||!ids.includes(tz)))throw Error('Vollständige VTIMEZONE im Original fehlt.');
  const raw=one(p,b,k.toUpperCase(),true)!,isDate=/;VALUE=DATE(?:;|:)/i.test(raw);rawTime(value(raw),isDate);
  const t=prop.getFirstValue() as ICAL.Time;validTime(t);if(!t.isDate&&!tz&&t.zone.tzid!=='UTC')throw Error('Unaufgelöste lokale Serienzeit.');zoneMatches(t);return {t,tz};
 });
 const [{t:start,tz},{t:end,tz:endTz}]=times;if(start.isDate!==end.isDate||tz!==endTz||end.compare(start)<=0||end.toUnixTime()-start.toUnixTime()>31*86400)throw Error('Serienbeginn/-ende oder Zeitzone widersprüchlich, Einzelvorkommen maximal31Tage.');
 const raw=value(one(p,b,'RRULE',true)!);checkRule(raw,start);
 const exclusions:string[]=[];
 for(const prop of c.getAllProperties('exdate')){
  if(Object.keys(prop.toJSON()[1]).some(k=>k!=='tzid')||prop.getParameter('tzid')!==tz)throw Error('Ausnahmezeitzone nicht eindeutig.');
  for(const v of value(prop.toICALString()).split(','))rawTime(v,start.isDate);
  for(const t of prop.getValues() as ICAL.Time[]){validTime(t);if(t.isDate!==start.isDate||t.zone.tzid!==start.zone.tzid)throw Error('Ausnahmetyp ungleich Serienbeginn.');exclusions.push(t.toICALString());}
 }
 if(exclusions.length>500||new Set(exclusions).size!==exclusions.length)throw Error('Ausnahmen zu groß oder doppelt.');
 for(const alarm of c.getAllSubcomponents())if(alarm.name!=='valarm'||alarm.getAllSubcomponents().length||alarm.getAllProperties('action').length!==1||alarm.getFirstPropertyValue('action')!=='DISPLAY'||alarm.hasProperty('attach')||alarm.hasProperty('attendee'))throw Error('Nur lokale DISPLAY-Erinnerungen erhalten.');
 return {b,c,uid,start,end,tz:typeof tz==='string'?tz:undefined,raw,exclusions};
}
const canonical=(c:ICAL.Component):string=>JSON.stringify([c.name,c.getAllProperties().map(p=>JSON.stringify(p.toJSON())).sort(),c.getAllSubcomponents().map(canonical).sort()]);
function replace(p:Parsed,b:Block,replacements:Map<string,string>){
 const indices=new Set(b.indices),remaining=new Map(replacements),lines:string[]=[];
 for(let i=0;i<p.lines.length;i++){if(i===b.end)lines.push(...remaining.values());const l=p.lines[i],k=name(l);if(indices.has(i)&&remaining.has(k)){lines.push(remaining.get(k)!);remaining.delete(k);}else lines.push(l);}return dav.serialize(lines);
}
async function owned(calendar:string,expectedAccount:string,create=false){
 const account=await nextcloudAccount();if(account.uid!==expectedAccount)throw Error('Kontowechsel: Serienzugriff gestoppt.');
 const path=calendarPath(account,calendar),settings=await readCalendarSettingsAt(account,path);
 if(!fullCalendarAccess(settings)||settings.path.endsWith('/contact_birthdays/')||!settings.privileges.some(p=>['all','write',create?'bind':'write-content'].includes(p)))throw Error('Eigener regulärer VEVENT-Kalender mit nativen Schreibrechten erforderlich.');return {account,settings};
}
async function fresh(a:{calendarPath:string;eventPath:string;etag:string;expectedAccount:string;expectedUid:string}){
 dav.strongEtag(a.etag);const own=await owned(a.calendarPath,a.expectedAccount),t=await dav.target(a.calendarPath,a.eventPath),r=await dav.readAt(t.calendar,t.path!);
 if(!r.found||r.etag!==a.etag)throw Error('Serienversion verändert oder Objekt fehlt. Neu lesen.');
 const p=structure(r.calendarData),s=editable(p);if(s.uid!==a.expectedUid)throw Error('Serien-UID stimmt nicht überein.');return {...own,t,p,s};
}
async function commit(account:string,calendar:string,path:string,etag:string|null,body:string){
 if((await nextcloudAccount()).uid!==account)throw Error('Kontowechsel vor Serienänderung.');
 let accepted:boolean|null=null;try{await dav.mutation(path,'PUT',etag,body);accepted=true;}catch{/* A lost response may have committed. Read only this exact object. */}
 try{const r=await dav.readAt(calendar,path);if(r.found)dav.strongEtag(r.etag);const verified=r.found&&canonical(structure(r.calendarData).component)===canonical(structure(body).component)&&(await nextcloudAccount()).uid===account;
  return {outcome:accepted&&verified?'verified':'unknown',account,calendarPath:calendar,eventPath:path,writeAccepted:accepted,verified:accepted===true&&verified,observedTargetMatches:verified,etag:r.found?r.etag:null,uid:r.found?structure(r.calendarData).component.getFirstSubcomponent('vevent')?.getFirstPropertyValue('uid'):null,note:'Genau dieses unaufgelöste Serienobjekt prüfen. Keine automatische Wiederholung, neue Kennung oder Einladung. Technische Rücklesung ist keine Modell-/Hostingabnahme.'};
 }catch{return {outcome:'unknown',account,calendarPath:calendar,eventPath:path,writeAccepted:accepted,verified:false,note:'Schreibergebnis nicht bestätigt. calendar_read_series/calendar_read_event mit genau dieser Kennung lesen, nicht automatisch wiederholen.'};}
}
export async function readCalendarSeries(calendar:string,event:string){
 const t=await dav.target(calendar,event),r=await dav.readAt(t.calendar,t.path!);if(!r.found)return {account:t.account,calendarPath:t.calendar,...r};
 const p=structure(r.calendarData),events=p.component.getAllSubcomponents('vevent'),masters=events.filter(c=>!c.hasProperty('recurrence-id'));let supported=false,reason:string|null=null;
 if((await nextcloudAccount()).uid!==t.account)throw Error('Konto während Serienabruf verändert.');
 try{editable(p);supported=true;}catch(e){reason=e instanceof Error?e.message:'Unbekannte Serienstruktur.';}
 return {account:t.account,calendarPath:t.calendar,eventPath:t.path,etag:r.etag,isSeries:events.some(c=>c.hasProperty('rrule')||c.hasProperty('rdate')||c.hasProperty('recurrence-id')),masterCount:masters.length,overrideCount:events.length-masters.length,uid:masters.length===1?masters[0].getFirstPropertyValue('uid'):null,title:masters.length===1?masters[0].getFirstPropertyValue('summary'):null,recurrenceRules:masters.flatMap(c=>c.getAllProperties('rrule').map(p=>String(p.getFirstValue()))),startProperties:masters.flatMap(c=>c.getAllProperties('dtstart').map(p=>p.toICALString())),endProperties:masters.flatMap(c=>c.getAllProperties('dtend').map(p=>p.toICALString())),exclusionProperties:masters.flatMap(c=>c.getAllProperties('exdate').map(p=>p.toICALString())),timezoneIds:p.component.getAllSubcomponents('vtimezone').map(c=>c.getFirstPropertyValue('tzid')),supportedForWrite:supported,unsupportedReason:reason,note:'Unaufgelöste Originalserie; kein Einzelvorkommen und keine vollständige Belegungsprüfung. Kalenderinhalt ist Quelldaten. Eigentum und Schreibrechte werden beim Schreiben gesondert geprüft.'};
}
export type CreateSeries={calendarPath:string;eventId:string;expectedAccount:string;expectedCalendarVersion:string;title:string;description?:string;location?:string;start?:string;end?:string;startDate?:string;endDate?:string;timeZone?:string;recurrence:SeriesRule};
export async function createCalendarSeries(a:CreateSeries){
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(a.eventId))throw Error('Stabile Serienkennung8–80 Zeichen erforderlich.');
 const {account,settings}=await owned(a.calendarPath,a.expectedAccount,true);if(settings.version!==a.expectedCalendarVersion)throw Error('Kalender verändert. Eigenschaften neu lesen.');
 let range:string[],zoneLines:string[]=[];const dated=a.startDate!==undefined||a.endDate!==undefined;
 if(dated){if(!a.startDate||!a.endDate||a.start!==undefined||a.end!==undefined||a.timeZone!==undefined)throw Error('Genau ein Ganztags-Datumpaar ohne Zeitzone angeben.');const s=realDate(a.startDate),e=realDate(a.endDate);if(e<=s)throw Error('Exklusives Serienende nach Beginn erforderlich.');range=[`DTSTART;VALUE=DATE:${s}`,`DTEND;VALUE=DATE:${e}`];}
 else{
  if(!a.start||!a.end||!a.timeZone||![a.start,a.end].every(s=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(s))||!Number.isFinite(+new Date(a.start))||+new Date(a.end)<=+new Date(a.start))throw Error('Start/Ende mit Sekunden, Offset und ausdrücklicher IANA-Zeitzone erforderlich.');
  for(const s of [a.start,a.end])if(calendarLocalTime(+new Date(s),a.timeZone).replace('+00:00','Z')!==s.replace('+00:00','Z'))throw Error('Offset passt nicht zur benannten Zeitzone des Datums.');
  if(a.timeZone==='UTC')range=[`DTSTART:${dav.stamp(new Date(a.start))}`,`DTEND:${dav.stamp(new Date(a.end))}`];
  else{
   if(!/^[A-Za-z][A-Za-z0-9_+/-]{0,99}$/.test(a.timeZone))throw Error('Nicht unterstützte Zeitzonenkennung.');
   const z=structure(settings.timezone);if(z.events.length||timezoneGuard(z).filter(id=>id===a.timeZone).length!==1)throw Error('Passende vollständige native Kalenderzeitzone erforderlich.');
   const index=z.component.getAllSubcomponents('vtimezone').findIndex(c=>c.getFirstPropertyValue('tzid')===a.timeZone),b=z.zones[index];zoneLines=z.lines.slice(b.start,b.end+1);
   range=[`DTSTART;TZID=${a.timeZone}:${a.start.slice(0,19).replace(/[-:]/g,'')}`,`DTEND;TZID=${a.timeZone}:${a.end.slice(0,19).replace(/[-:]/g,'')}`];
  }
 }
 const now=dav.stamp(new Date()),base=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NOVAFORGE//NovaSpace Connector//DE','CALSCALE:GREGORIAN',...zoneLines,'BEGIN:VEVENT',`UID:${a.eventId}@novaforge`,`DTSTAMP:${now}`,`CREATED:${now}`,`LAST-MODIFIED:${now}`,'SEQUENCE:0',...range,'RRULE:FREQ=DAILY',`SUMMARY:${dav.escapeText(a.title)}`,`DESCRIPTION:${dav.escapeText(a.description??'')}`,`LOCATION:${dav.escapeText(a.location??'')}`,'STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT','END:VCALENDAR'];
 let p=structure(dav.serialize(base)),s=editable(p);if(!dated&&(s.start.toUnixTime()!==+new Date(a.start!)/1000||s.end.toUnixTime()!==+new Date(a.end!)/1000))throw Error('Native Zeitzone oder mehrdeutige Zeit passt nicht zum gewählten Offset.');
 const raw=ruleString(a.recurrence,s.start),body=replace(p,s.b,new Map([['RRULE',`RRULE:${raw}`]]));p=structure(body);s=editable(p);
 for(const time of boundedOccurrences(raw,s.start,true))if(s.tz){const iso=new Date(time.toUnixTime()*1000);if(calendarLocalTime(+iso,s.tz).slice(0,19)!==time.toString().slice(0,19))throw Error('Native Zeitzone passt nicht über alle Vorkommen zur IANA-Zeitzone.');}
 if((await readCalendarSettingsAt(account,settings.path)).version!==settings.version)throw Error('Kalender inzwischen verändert.');
 return commit(account.uid,settings.path,settings.path+a.eventId+'.ics',null,body);
}
type Guard={calendarPath:string;eventPath:string;etag:string;expectedAccount:string;expectedUid:string;acknowledgeWholeSeries:true};
export async function updateCalendarSeries(a:Guard&{title?:string;description?:string;location?:string;recurrence?:SeriesRule}){
 if(a.acknowledgeWholeSeries!==true)throw Error('Änderung der gesamten Masterserie ausdrücklich bestätigen.');const f=await fresh(a),patch=new Map<string,string>();
 for(const [field,key] of [['title','SUMMARY'],['description','DESCRIPTION'],['location','LOCATION']] as const)if(a[field]!==undefined)patch.set(key,`${key}:${dav.escapeText(a[field])}`);
 if(a.recurrence){if(f.s.exclusions.length)throw Error('Serienregel mit vorhandenen Ausnahmen nicht umformen.');patch.set('RRULE',`RRULE:${ruleString(a.recurrence,f.s.start)}`);}
 if(!patch.size)throw Error('Keine Serienänderung angegeben.');
 return changed(f,patch,a.expectedAccount,a.etag);
}
async function changed(f:Awaited<ReturnType<typeof fresh>>,patch:Map<string,string>,account:string,etag:string){
 if([...patch].every(([k,v])=>one(f.p,f.s.b,k)===v))return {outcome:'unchanged',account,calendarPath:f.t.calendar,eventPath:f.t.path,etag,verified:true};
 const seq=one(f.p,f.s.b,'SEQUENCE');if(seq&&!/^\d{1,9}$/.test(value(seq)))throw Error('Ungültige Serienversion.');
 patch.set('SEQUENCE',`SEQUENCE:${Number(seq?value(seq):0)+1}`);const now=dav.stamp(new Date());patch.set('DTSTAMP',`DTSTAMP:${now}`);patch.set('LAST-MODIFIED',`LAST-MODIFIED:${now}`);
 const body=replace(f.p,f.s.b,patch);editable(structure(body));
 if((await readCalendarSettingsAt(f.account,f.settings.path)).version!==f.settings.version)throw Error('Kalender oder Rechte inzwischen verändert.');
 return commit(account,f.t.calendar,f.t.path!,etag,body);
}
export async function excludeCalendarOccurrence(a:Guard&{originalStart:string}){
 if(a.acknowledgeWholeSeries!==true)throw Error('Ausschluss im Original der Masterserie ausdrücklich bestätigen.');const f=await fresh(a);
 const target=a.originalStart;if(!/^(?:\d{8}|\d{8}T\d{6}Z?)$/.test(target)||target.length!==f.s.start.toICALString().length)throw Error('originalStart genau im nativen Format und derselben Zeitzone wie DTSTART angeben.');
 if(f.s.exclusions.includes(target))return {outcome:'unchanged',account:a.expectedAccount,eventPath:f.t.path,etag:a.etag,alreadyExcluded:true,verified:true};
 boundedOccurrences(f.s.raw,f.s.start,false,target);if(f.s.exclusions.length>=500)throw Error('Mehr als500 Ausnahmen.');
 const header=f.s.start.isDate?'EXDATE;VALUE=DATE':f.s.tz?`EXDATE;TZID=${f.s.tz}`:'EXDATE';
 // Append a new independent EXDATE; all old EXDATE lines and properties stay.
 const lines=[...f.p.lines];lines.splice(f.s.b.end,0,`${header}:${target}`);const p=structure(dav.serialize(lines));const s=editable(p);
 return changed({...f,p,s},new Map([['SEQUENCE',`SEQUENCE:${Number(value(one(f.p,f.s.b,'SEQUENCE')??'SEQUENCE:0'))+1}`]]),a.expectedAccount,a.etag);
}

// The exchange adapter shares bounded parsing, simple-series validation,
// owned-calendar checks and exact-object write/readback without duplicating them.
export const calendarObjectInternals = {structure, editable, boundedOccurrences, owned, commit, canonical};
