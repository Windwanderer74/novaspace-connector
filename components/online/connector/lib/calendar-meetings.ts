// SPDX-License-Identifier: AGPL-3.0-or-later
import ICAL from 'ical.js';
import {nextcloudAccount,davFetch,parseDav,safeDavPath} from './nextcloud-read';
import {readCalendarSettingsAt,calendarRequest} from './calendar-settings';
import {calendarEventDraft,calendarWriteInternals as dav,type EventInput} from './calendar-write';
import {namedEventRange} from './calendar-event-options';
import {calendarObjectInternals as object} from './calendar-series';
import {calendarExchangeInternals as exchange} from './calendar-exchange';
import {readCalendarScheduling,calendarInvitationInternals as invitation} from './calendar-invitations';
import {planningVersion} from './planning-json';
import {planningInstant} from './calendar-planning';

export type MeetingDetails=Pick<Partial<EventInput>,'title'|'description'|'location'|'start'|'end'|'startDate'|'endDate'|'timeZone'>;
export type MeetingInput={action:'create'|'update'|'cancel';calendarPath:string;expectedAccount:string;organizerAddress:string;eventId?:string;eventPath?:string;etag?:string;expectedUid?:string;details?:MeetingDetails;attendees?:string[];preparedAt?:string};
const key=(s:string)=>s.split(/[;:]/,1)[0].toUpperCase();
const array=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
const text=(v:any):string=>typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
const address=(v:string)=>invitation.mailbox(/^mailto:/i.test(v)?v:'mailto:'+v);
function validate(a:MeetingInput){
 if(!a||!['create','update','cancel'].includes(a.action)||typeof a.expectedAccount!=='string'||!a.expectedAccount||a.expectedAccount.length>255||typeof a.organizerAddress!=='string')throw Error('Aktion, tatsächliches Konto und eigene Organisatoradresse erforderlich.');
 const allowed=['action','calendarPath','expectedAccount','organizerAddress','eventId','eventPath','etag','expectedUid','details','attendees','preparedAt'];
 if(Object.keys(a).some(k=>!allowed.includes(k)))throw Error('Nicht unterstützte Besprechungsangabe.');
 if(a.action==='create'){
  if(!a.eventId||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(a.eventId)||a.eventPath!==undefined||a.etag!==undefined||a.expectedUid!==undefined||!a.details?.title||!a.attendees?.length)throw Error('Neue Einladung benötigt feste eventId, Titel/Zeiten und ausdrücklich gewählte Teilnehmer; keine bestehende Objektkennung.');
 }else{
  if(a.eventId!==undefined||!a.eventPath||!a.etag||!a.expectedUid||a.expectedUid.length>255)throw Error('Bestehende Besprechung mit eventPath, UID und frischem ETag wählen.');
  dav.strongEtag(a.etag);
  if(a.action==='cancel'&&(a.details!==undefined||a.attendees!==undefined))throw Error('Absage entfernt genau das gelesene Original; keine zusätzlichen Änderungen.');
  if(a.action==='update'&&!a.attendees&&!Object.keys(a.details??{}).length)throw Error('Konkrete Besprechungsänderung erforderlich.');
 }
 if(a.details){
  const limits:Record<string,number>={title:500,description:10000,location:1000,start:35,end:35,startDate:10,endDate:10,timeZone:100};
  for(const [k,v]of Object.entries(a.details))if(!Object.hasOwn(limits,k)||typeof v!=='string'||v.length>limits[k]||new TextDecoder().decode(new TextEncoder().encode(v))!==v||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)||k==='title'&&!v.trim())throw Error('Ungültige Besprechungseigenschaft.');
  if(['start','end','startDate','endDate'].some(k=>Object.hasOwn(a.details!,k)))dav.eventRange(a.details);
  if(a.details.timeZone!==undefined&&(!a.details.start||!a.details.end||a.details.startDate!==undefined||a.details.endDate!==undefined))throw Error('Zeitzone nur mit vollständigem Zeitpaar.');
 }
 if(a.attendees!==undefined&&(!Array.isArray(a.attendees)||!a.attendees.length||a.attendees.length>50||a.attendees.some(v=>typeof v!=='string'||v.length>1024)))throw Error('1–50 ausdrücklich gewählte individuelle Teilnehmeradressen erforderlich.');
 const attendees=a.attendees?.map(address);if(attendees&&new Set(attendees).size!==attendees.length)throw Error('Doppelte Teilnehmeradresse.');
 const preparedAt=a.preparedAt??new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(preparedAt)||!Number.isFinite(Date.parse(preparedAt))||new Date(preparedAt).toISOString().slice(0,19)!==preparedAt.slice(0,19)||Date.now()-Date.parse(preparedAt)>15*60*1000||Date.parse(preparedAt)-Date.now()>30000)throw Error('Vorschauzeit ungültig oder älter als15Minuten. Neu vorbereiten.');
 return {attendees,organizer:address(a.organizerAddress),preparedAt};
}
async function outboxProof(s:Awaited<ReturnType<typeof readCalendarScheduling>>){
 if(!s.autoSchedulingAdvertised||!s.inbox||!s.outbox||!s.addresses.length)throw Error('Native Kalenderadresse und Scheduling-Unterstützung nicht bestätigt.');
 const r=await calendarRequest(s.outbox,'PROPFIND','<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:owner/><d:current-user-privilege-set/></d:prop></d:propfind>','0',64*1024);
 const rows=parseDav(r.text);if(r.status!==207||rows.length!==1||safeDavPath(rows[0].href,s.calendarHome)!==s.outbox)throw Error('Eigene Scheduling-Outbox nicht eindeutig.');
 const props=rows[0].props,types=Object.keys(props.resourcetype??{}).sort(),privileges=array(props['current-user-privilege-set']?.privilege).flatMap(v=>Object.keys(v)).sort();
 if(types.join(',')!=='collection,schedule-outbox'||safeDavPath(text(props.owner?.href),s.principal)!==s.principal||!privileges.some(p=>['all','schedule-send','schedule-send-invite'].includes(p)))throw Error('Eigenes natives Organisator-Senderecht auf der Outbox fehlt.');
 return {path:s.outbox,version:await planningVersion({path:s.outbox,owner:s.principal,types,privileges})};
}
function meeting(data:string){
 const p=object.structure(data),components=p.component.getAllSubcomponents();
 if(p.events.length!==1||components.some(c=>!['vevent','vtimezone'].includes(c.name))||p.component.hasProperty('method'))throw Error('Genau ein gespeicherter Einzeltermin ohne rohe METHOD-Nachricht erforderlich.');
 const b=p.events[0],c=p.component.getFirstSubcomponent('vevent')!;
 const alarms=c.getAllSubcomponents();
 if(alarms.length>10||alarms.some(alarm=>alarm.name!=='valarm'||alarm.getAllSubcomponents().length||alarm.getAllProperties('action').length!==1||String(alarm.getFirstPropertyValue('action')).toUpperCase()!=='DISPLAY'||alarm.getAllProperties('trigger').length!==1||['attendee','attach','repeat','duration'].some(k=>alarm.hasProperty(k))))throw Error('Nur einfache lokale DISPLAY-Erinnerungen erhalten.');
 if(b.indices.some(i=>['RRULE','RDATE','EXDATE','EXRULE','RECURRENCE-ID'].includes(key(p.lines[i])))||p.lines.some(l=>key(l)==='ATTACH'||key(l)==='ACTION'&&!/^ACTION:DISPLAY$/i.test(l)))throw Error('Serien, Einzelabweichungen, Anhänge und versendende Alarme nicht als Organisator bearbeiten.');
 const one=(k:string,required=false)=>{const at=b.indices.filter(i=>key(p.lines[i])===k);if(at.length>1||required&&at.length!==1)throw Error('Besprechungseigenschaft nicht eindeutig: '+k);return at.length?{index:at[0],prop:invitation.property(p.lines[at[0]])}:null;};
 for(const k of ['UID','DTSTART','DTEND','SUMMARY','DESCRIPTION','LOCATION','SEQUENCE','DTSTAMP','LAST-MODIFIED','STATUS','DURATION'])one(k,['UID','DTSTART','DTEND'].includes(k));
 if(c.hasProperty('duration')||String(c.getFirstPropertyValue('status')??'').toUpperCase()==='CANCELLED')throw Error('Aktive Besprechung mit ausdrücklichem Terminende erforderlich.');
 const org=one('ORGANIZER',true)!,attendees=b.indices.filter(i=>key(p.lines[i])==='ATTENDEE').map(index=>{const prop=invitation.property(p.lines[index]);return {index,prop,address:address(String(prop.getFirstValue()))};});
 if(!attendees.length||attendees.length>50||new Set(attendees.map(v=>v.address)).size!==attendees.length)throw Error('Teilnehmer nicht eindeutig oder mehr als50.');
 for(const prop of [org.prop,...attendees.map(v=>v.prop)])if(['sent-by','delegated-to','delegated-from','schedule-force-send','member'].some(k=>prop.getParameter(k)!==undefined)||(invitation.parameter(prop,'schedule-agent')??'SERVER').toUpperCase()!=='SERVER')throw Error('Keine Stellvertretung, Delegation oder erzwungene/fremde Scheduling-Verantwortung.');
 for(const v of attendees)if((invitation.parameter(v.prop,'cutype')??'INDIVIDUAL').toUpperCase()!=='INDIVIDUAL'||!['NEEDS-ACTION','ACCEPTED','TENTATIVE','DECLINED'].includes((invitation.parameter(v.prop,'partstat')??'NEEDS-ACTION').toUpperCase()))throw Error('Nur individuelle Teilnehmer ohne Delegation.');
 const uid=String(one('UID',true)!.prop.getFirstValue());if(!uid||uid.length>255)throw Error('Ungültige UID.');
 return {p,b,c,org,attendees,uid,organizer:address(String(org.prop.getFirstValue()))};
}
function canonical(data:string){
 const p=object.structure(data);for(const c of p.component.getAllSubcomponents('vevent'))for(const a of c.getAllProperties('attendee'))a.removeParameter('schedule-status');
 return object.canonical(p.component);
}
function attendeeLine(value:string,old?:ICAL.Property,reset=false){
 const p=old?ICAL.Property.fromString(old.toICALString()):new ICAL.Property('attendee');
 if(!old){p.setValue(value);p.setParameter('cutype','INDIVIDUAL');p.setParameter('role','REQ-PARTICIPANT');}
 if(!old||reset){p.setParameter('partstat','NEEDS-ACTION');p.setParameter('rsvp','TRUE');}
 return p.toICALString();
}
function originalTimeKey(prop:ICAL.Property,calendar:ICAL.Component){
 const time=(prop.getFirstValue() as ICAL.Time).clone();if(time.isDate)return 'date:'+time.toICALString();
 const tzid=prop.getParameter('tzid');
 if(tzid){if(typeof tzid!=='string')throw Error('Zeitparameter nicht eindeutig.');if(tzid==='UTC')time.zone=ICAL.Timezone.utcTimezone;else{const zones=calendar.getAllSubcomponents('vtimezone').filter(z=>z.getFirstPropertyValue('tzid')===tzid);if(zones.length!==1)throw Error('Originale Zeitzone für Zeitänderung nicht eindeutig.');time.zone=new ICAL.Timezone({component:zones[0],tzid});}}
 else if(!prop.toICALString().endsWith('Z'))throw Error('Unaufgelöste lokale Originalzeit nicht verschieben.');
 return 'instant:'+time.toUnixTime();
}
async function prepare(a:MeetingInput){
 const input=validate(a),s=await readCalendarScheduling();
 if(s.account!==a.expectedAccount||!s.addresses.includes(input.organizer))throw Error('Tatsächliches Konto oder eigene native Organisatoradresse nicht bestätigt.');
 const outbox=await outboxProof(s),{account,settings}=await object.owned(a.calendarPath,a.expectedAccount,a.action==='create');
 if(account.principal!==s.principal||account.calendarHome!==s.calendarHome||settings.resourceTypes.some(t=>!['calendar','collection'].includes(t))||/\/(?:app-generated[^/]*|contact_birthdays)\/$/.test(settings.path)||a.action==='cancel'&&!settings.privileges.some(p=>['all','write','unbind'].includes(p)))throw Error('Eigener regulärer Kalender und native Aktionsrechte erforderlich.');
 if(input.attendees?.some(v=>s.addresses.includes(v)))throw Error('Als Teilnehmer ausdrücklich fremde individuelle Kalenderadressen wählen; Organisator nicht selbst neu einladen.');
 const path=a.action==='create'?settings.path+a.eventId+'.ics':safeDavPath(a.eventPath!,settings.path);
 if(!path.slice(settings.path.length)||path.slice(settings.path.length).includes('/'))throw Error('Genau eine direkte Ereigniskennung erforderlich.');
 const current=await dav.readAt(settings.path,path);let uid:string,body:string|null=null,changed=true,existing:ReturnType<typeof meeting>|undefined,uidState:object|null=null;
 if(a.action==='create'){
  uid=a.eventId+'@novaforge';if(current.found)throw Error('Zielkennung existiert bereits. Genau dieses Original lesen, keine neue Anlage.');
  const active=await exchange.uidMatches(settings.path,uid),trash=await exchange.uidMatches(account.calendarHome+'trashbin/objects/',uid,true);
  if(active.matches.length||trash.matches.length)throw Error('UID im Kalender oder sichtbaren Kalenderpapierkorb bereits vorhanden. Nicht wiederverwenden.');
  uidState={active:active.version,trash:trash.version};
  const draft=object.structure(await calendarEventDraft(settings.path,a.eventId!,a.details as EventInput,new Date(input.preparedAt))),lines=[...draft.lines];
  lines.splice(draft.events[0].end,0,'ORGANIZER:'+input.organizer,...input.attendees!.map(v=>attendeeLine(v)));
  body=dav.serialize(lines);existing=meeting(body);
 }else{
  if(!current.found||current.etag!==a.etag)throw Error('Besprechung fehlt oder wurde verändert. Dasselbe Original frisch lesen.');
  dav.strongEtag(current.etag);existing=meeting(current.calendarData);uid=existing.uid;
  if(uid!==a.expectedUid||existing.organizer!==input.organizer)throw Error('UID oder tatsächliche Organisatorrolle nicht bestätigt.');
  if(a.action==='update'){
   const changes=new Map<string,string>(),details=a.details??{};
   for(const [field,name]of [['title','SUMMARY'],['description','DESCRIPTION'],['location','LOCATION']] as const)if(details[field]!==undefined)changes.set(name,name+':'+dav.escapeText(details[field]!));
   let range:string[]|undefined,zone:string[]=[];
   if(['start','end','startDate','endDate'].some(k=>Object.hasOwn(details,k)))range=dav.eventRange(details);
   if(details.timeZone){const r=await namedEventRange(settings.path,details.start!,details.end!,details.timeZone,current.calendarData);range=r.range;zone=r.zone;}
   const rescheduled=range?[0,1].some(i=>originalTimeKey(existing!.c.getFirstProperty(i?'dtend':'dtstart')!,existing!.p.component)!==(details.startDate?'date:'+(i?details.endDate:details.startDate)!.replaceAll('-',''):'instant:'+planningInstant((i?details.end:details.start)!)/1000)):false;
   if(range){changes.set('DTSTART',range[0]);changes.set('DTEND',range[1]);}
   const recipients=input.attendees??existing.attendees.map(v=>v.address),rows=recipients.map(v=>attendeeLine(v,existing!.attendees.find(x=>x.address===v)?.prop,rescheduled&&!s.addresses.includes(v)));
   const indices=new Set(existing.b.indices),attendeeIndices=new Set(existing.attendees.map(v=>v.index));let lines:string[]=[];
   const nested=existing.p.lines.findIndex((l,i)=>i>existing!.b.start&&i<existing!.b.end&&key(l)==='BEGIN'),insertAt=nested<0?existing.b.end:nested;
   for(let i=0;i<existing.p.lines.length;i++){
    if(i===existing.b.start)lines.push(...zone);
    if(i===insertAt){for(const value of changes.values())lines.push(value);changes.clear();lines.push(...rows);}
    const line=existing.p.lines[i],name=key(line);
    if(attendeeIndices.has(i))continue;
    if(indices.has(i)&&changes.has(name)){lines.push(changes.get(name)!);changes.delete(name);}else lines.push(line);
   }
   body=dav.serialize(lines);changed=canonical(body)!==canonical(current.calendarData);
   if(changed){
    const seq=existing.c.getFirstPropertyValue('sequence')??0;if(!Number.isSafeInteger(Number(seq))||Number(seq)<0||Number(seq)>=999999999)throw Error('Ungültige Ereignisversion.');
    const stamp=dav.stamp(new Date(input.preparedAt)),replacements=new Map([['SEQUENCE','SEQUENCE:'+(Number(seq)+1)],['DTSTAMP','DTSTAMP:'+stamp],['LAST-MODIFIED','LAST-MODIFIED:'+stamp]]),p=object.structure(body),event=p.events[0],set=new Set(event.indices),result:string[]=[];
    const nested=p.lines.findIndex((l,i)=>i>event.start&&i<event.end&&key(l)==='BEGIN'),insertAt=nested<0?event.end:nested;
    for(let i=0;i<p.lines.length;i++){if(i===insertAt){result.push(...replacements.values());replacements.clear();}const name=key(p.lines[i]);if(set.has(i)&&replacements.has(name)){result.push(replacements.get(name)!);replacements.delete(name);}else result.push(p.lines[i]);}body=dav.serialize(result);
   }else body=current.calendarData;
  }
 }
 const observed=body?meeting(body):existing!,recipients=observed.attendees.map(v=>v.address).filter(v=>!s.addresses.includes(v)).sort();
 if(!recipients.length)throw Error('Mindestens ein ausgewählter fremder Teilnehmer erforderlich.');
 const prior=a.action==='create'?[]:existing!.attendees.map(v=>v.address).filter(v=>!s.addresses.includes(v)).sort();
 const schedulingAfter=await readCalendarScheduling(),outboxAfter=await outboxProof(schedulingAfter),settingsAfter=await readCalendarSettingsAt(account,settings.path);
 if(schedulingAfter.version!==s.version||outboxAfter.version!==outbox.version||settingsAfter.version!==settings.version)throw Error('Identität, Senderecht oder Kalender während Vorschau verändert. Neu vorbereiten.');
 if(a.action==='create'&&uidState){const active=await exchange.uidMatches(settings.path,uid),trash=await exchange.uidMatches(account.calendarHome+'trashbin/objects/',uid,true);if(await planningVersion({active:active.version,trash:trash.version})!==await planningVersion(uidState))throw Error('UID-/Papierkorbstand verändert.');}
 const data={account:account.uid,action:a.action,calendarPath:settings.path,eventPath:path,uid,organizerAddress:input.organizer,preparedAt:input.preparedAt,etag:current.found?current.etag:null,calendarVersion:settings.version,schedulingVersion:s.version,outboxVersion:outbox.version,uidState,recipients,addedRecipients:recipients.filter(v=>!prior.includes(v)),removedRecipients:prior.filter(v=>!recipients.includes(v)),changed,originalVersion:current.found?await planningVersion(current.calendarData):null,draftVersion:body?await planningVersion(canonical(body)):null,preview:{title:String(observed.c.getFirstPropertyValue('summary')??''),description:String(observed.c.getFirstPropertyValue('description')??''),location:String(observed.c.getFirstPropertyValue('location')??''),startProperty:observed.c.getFirstProperty('dtstart')!.toICALString(),endProperty:observed.c.getFirstProperty('dtend')!.toICALString(),sequence:observed.c.getFirstPropertyValue('sequence')??0},effect:a.action==='cancel'?'Gespeichertes Besprechungsoriginal entfernen und native Absage an bisherige Teilnehmer beauftragen.':'Vollständigen Termin einschließlich Beschreibung und erhaltener Eigenschaften für die angezeigten Teilnehmer speichern; native Einladungen/Änderungen und gegebenenfalls Absagen beauftragen.'};
 return {data,body,identity:{principal:account.principal,calendarHome:account.calendarHome},version:await planningVersion(data)};
}
export async function prepareCalendarMeeting(a:MeetingInput){const p=await prepare(a);return {...p.data,proposalVersion:p.version,ready:true,submission:{...a,preparedAt:p.data.preparedAt,expectedProposalVersion:p.version,acknowledgeNativeScheduling:false},requiredScopes:['calendar:read','calendar:write','calendar:organize'],nativeSchedulingRequested:false,nativeDeliveryVerified:false,uidCheckAtomic:false,note:'Nur Vorschau. Gewählten Empfängern wird der vollständige Termininhalt zugänglich. Absage entfernt das gespeicherte Original. UID-/Kalenderpapierkorbvorprüfung ist nicht atomar und auf gewählten Kalender/sichtbaren Papierkorb begrenzt. submission enthält den kopierbaren Auftrag; erst nach ausdrücklicher Bestätigung acknowledgeNativeScheduling auf true setzen. Bei Unklarheit dieselbe Zielkennung lesen.'};}
export async function submitCalendarMeeting(a:MeetingInput&{expectedProposalVersion:string;acknowledgeNativeScheduling:true}){
 if(a.acknowledgeNativeScheduling!==true||!a.preparedAt||!/^[a-f0-9]{64}$/.test(a.expectedProposalVersion))throw Error('Frische Vorschau und native Mitteilung/ganzer Empfängerzugriff ausdrücklich bestätigen.');
 const {expectedProposalVersion,acknowledgeNativeScheduling,...input}=a,p=await prepare(input);
 if(p.version!==expectedProposalVersion)throw Error('Vorschau, Empfänger oder Besprechungsstand verändert. Neu vorbereiten; keine Mitteilung.');
 const {data}=p;if(!data.changed)return {outcome:'unchanged',account:data.account,eventPath:data.eventPath,uid:data.uid,nativeSchedulingRequested:false,nativeDeliveryVerified:false};
 const method=data.action==='cancel'?'DELETE':'PUT';
 const unknown=(status:number|null,accepted:boolean|null)=>({outcome:'unknown',account:data.account,action:data.action,calendarPath:data.calendarPath,eventPath:data.eventPath,uid:data.uid,httpStatus:status,writeAccepted:accepted,localResultVerified:false,nativeSchedulingRequested:null,nativeDeliveryVerified:false,note:'Dasselbe Original mit calendar_read_event lesen. Nicht automatisch erneut senden, keine neue eventId oder UID versuchen.'});
 let r:Response;try{r=await davFetch(data.eventPath,{method,headers:{'Content-Type':'text/calendar; charset=utf-8',...(data.action==='create'?{'If-None-Match':'*'}:{'If-Match':data.etag!})},...(p.body?{body:p.body}:{})});}catch{return unknown(null,null);}await r.body?.cancel();
 if(r.status===412)return {...unknown(412,false),outcome:'conflict',nativeSchedulingRequested:false};
 if(!(data.action==='create'?[201]:[200,204]).includes(r.status))return unknown(r.status,r.status>=200&&r.status<300?true:null);
 try{
  const after=await dav.readAt(data.calendarPath,data.eventPath),account=await nextcloudAccount();
  const verified=account.uid===data.account&&account.principal===p.identity.principal&&account.calendarHome===p.identity.calendarHome&&(data.action==='cancel'?!after.found:after.found&&canonical(after.calendarData)===canonical(p.body!));
  if(!verified)return unknown(r.status,true);
  if(after.found)dav.strongEtag(after.etag);
  const scheduleStatuses=after.found?meeting(after.calendarData).attendees.map(v=>({address:v.address,status:invitation.parameter(v.prop,'schedule-status')})):[];
  return {outcome:'verified',account:data.account,action:data.action,calendarPath:data.calendarPath,eventPath:data.eventPath,uid:data.uid,etag:after.found?after.etag:null,removed:!after.found,writeAccepted:true,localResultVerified:true,nativeSchedulingRequested:true,nativeDeliveryVerified:false,nativeScheduleStatuses:scheduleStatuses,atomicAcrossRecipients:false,note:'Lokales Original bzw. dessen Abwesenheit zurückgelesen. Native Scheduling-Verarbeitung beauftragt; tatsächliche Zustellung nicht unabhängig bestätigt. Keine automatische Wiederholung oder Wiederherstellung.'};
 }catch{return unknown(r.status,true);}
}
