// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudAccount,davFetch,davDestination,readBody,safeDavPath} from './nextcloud-read';
import {readCalendarSettingsAt} from './calendar-settings';
import {calendarWriteInternals as dav} from './calendar-write';
import {calendarObjectInternals as object} from './calendar-series';
import {calendarExchangeInternals as exchange} from './calendar-exchange';
import {calendarTrashMetadata} from './calendar-trash';
import {planningVersion} from './planning-json';
type Ref={expectedAccount:string;trashPath?:string};
function original(data:string){const p=object.structure(data),events=p.component.getAllSubcomponents('vevent');if(!events.length||events.length>50||p.component.hasProperty('method')||p.component.getAllSubcomponents().some(c=>!['vevent','vtimezone'].includes(c.name)))throw Error('Genau ein gespeichertes VEVENT-Original mit gleicher UID, keine rohe Schedulingnachricht.');const uids=events.map(c=>c.getFirstPropertyValue('uid'));if(events.some(c=>c.getAllProperties('uid').length!==1)||uids.some(u=>typeof u!=='string'||!u||u.length>255)||new Set(uids).size!==1)throw Error('Papierkorb-UID nicht eindeutig.');return {p,uid:String(uids[0]),title:String(events[0].getFirstPropertyValue('summary')??''),meeting:events.some(c=>c.hasProperty('attendee')||c.hasProperty('organizer')),series:events.length>1||events[0].hasProperty('rrule')||events[0].hasProperty('rdate')};}
async function identity(expectedAccount:string){const a=await nextcloudAccount(),home=a.principal.slice(0,a.principal.lastIndexOf('principals/users/'))+'calendars/'+encodeURIComponent(a.uid)+'/';if(a.uid!==expectedAccount||a.calendarHome!==home)throw Error('Tatsächliches eigenes Kalenderkonto nicht bestätigt.');return a;}
const strong=(s:string)=>dav.strongEtag(s.startsWith('"')?s:'"'+s+'"');
async function snapshot(a:Ref&{trashPath:string}){
 const account=await identity(a.expectedAccount),trash=await calendarTrashMetadata(account),path=safeDavPath(a.trashPath,trash.path),entry=trash.objects.find(o=>o.path===path);
 if(!entry||!/^[1-9]\d*\.ics$/.test(path.slice(trash.path.length)))throw Error('Genau eine eigene sichtbare native Papierkorbkennung wählen.');
 const calendarPath=account.calendarHome+encodeURIComponent(entry.calendarUri)+'/',owned=await object.owned(calendarPath,a.expectedAccount,true);
 if(owned.account.principal!==account.principal||owned.account.calendarHome!==account.calendarHome||owned.settings.components.join(',')!=='VEVENT'||owned.settings.resourceTypes.join(',')!=='calendar,collection')throw Error('Eigenen aktiven regulären VEVENT-Zielkalender benötigen.');
 const r=await davFetch(path,{method:'GET',headers:{'If-Match':strong(entry.etag),Accept:'text/calendar','Cache-Control':'no-cache'}});if(r.status!==200){await r.body?.cancel();throw Error('Papierkorboriginal nicht versionsgebunden lesbar.');}if(!r.headers.get('etag')||strong(r.headers.get('etag')!)!==strong(entry.etag)){await r.body?.cancel();throw Error('Papierkorb-ETag nicht bestätigt.');}const body=await readBody(r,256*1024),info=original(body),active=await exchange.uidMatches(calendarPath,info.uid);
 const after=await calendarTrashMetadata(account),current=await identity(a.expectedAccount);if(after.version!==trash.version||current.principal!==account.principal||current.calendarHome!==account.calendarHome||(await readCalendarSettingsAt(account,calendarPath)).version!==owned.settings.version)throw Error('Papierkorb, Konto oder Ziel während Vorschau verändert.');
 const data={account:account.uid,trashPath:path,calendarPath,entry,uid:info.uid,title:info.title,meeting:info.meeting,series:info.series,calendarVersion:owned.settings.version,trashVersion:trash.version,originalVersion:await planningVersion(body),existingUidMatches:active.matches,uidSnapshot:active.version};return {account,trash,data,body,settings:owned.settings,version:await planningVersion(data)};
}
export async function readCalendarTrash(a:Ref){
 if(a.trashPath){const p=await snapshot({...a,trashPath:a.trashPath});return {...p.data,restoreVersion:p.version,ready:p.data.existingUidMatches.length===0,calendarData:p.body,atomic:false,note:'Nur Wiederherstellungsvorschau. Native gespeicherte Originalkennung/UID und Inhalt wieder sichtbar machen; keine neue Kennung, keine Kopie und keine Teilnehmerantwort. Alte Teilnehmer/Anhänge/Serien werden unverändert erhalten, Links nicht nachgeladen. Bisherige Kalenderzugriffe gelten wieder. UID-Vorprüfung ist nicht atomar; native Zielkollision stoppt MOVE. Tatsächliche Benachrichtigung/Zustellung unbestätigt.'};}
 const account=await identity(a.expectedAccount),trash=await calendarTrashMetadata(account);if((await identity(a.expectedAccount)).principal!==account.principal)throw Error('Kontowechsel.');return {account:account.uid,objects:trash.objects,version:trash.version,atomic:false,note:'Nur eigene sichtbare native Einzelobjekte bis1000/2MiB; keine fremden/geteilten/delegierten Einträge. Ganze gelöschte Kalender über calendar_read_management an ihrer Originalkennung prüfen. Zuerst genau eine trashPath wählen; kein Purge oder automatischer Restore.'};
}
export async function restoreCalendarEvent(a:{expectedAccount:string;trashPath:string;expectedRestoreVersion:string;acknowledgeOriginal:true;acknowledgeExistingAccess:true}){
 if(a.acknowledgeOriginal!==true||a.acknowledgeExistingAccess!==true)throw Error('Gespeicherten Originalumfang und bestehende Kalenderzugriffe ausdrücklich bestätigen.');
 const before=await snapshot(a);if(before.version!==a.expectedRestoreVersion||before.data.existingUidMatches.length)throw Error('Vorschau verändert oder gleiche UID bereits aktiv. Neu lesen, kein Ersatzobjekt anlegen.');
 if((await snapshot(a)).version!==before.version)throw Error('Original oder Ziel inzwischen verändert.');
 let status:number|null=null,accepted:boolean|null=null;
 const unknown=()=>({outcome:'unknown',verified:false,account:a.expectedAccount,trashPath:before.data.trashPath,calendarPath:before.data.calendarPath,uid:before.data.uid,writeStatus:status,writeAccepted:accepted,nativeDeliveryVerified:false,atomic:false,note:'Dasselbe Papierkorboriginal und denselben Zielkalender lesen; nicht automatisch wiederholen, neu importieren oder andere UID wählen.'});
 try{const target=before.account.calendarHome+'trashbin/restore/'+before.data.trashPath.split('/').at(-1),r=await davFetch(before.data.trashPath,{method:'MOVE',headers:{Destination:davDestination(target),Overwrite:'F','If-Match':strong(before.data.entry.etag)}});status=r.status;accepted=[201,204].includes(status);await r.body?.cancel();}catch{return unknown();}
 if(!accepted)return unknown();
 try{
  const account=await identity(a.expectedAccount),trash=await calendarTrashMetadata(account),active=await exchange.uidMatches(before.data.calendarPath,before.data.uid);
  if(account.principal!==before.account.principal||account.calendarHome!==before.account.calendarHome||active.matches.length!==1||trash.objects.some(o=>o.path===before.data.trashPath)||await planningVersion(trash.objects)!==await planningVersion(before.trash.objects.filter(o=>o.path!==before.data.trashPath)))return unknown();
  const target=await dav.readAt(before.data.calendarPath,active.matches[0].eventPath),settings=await readCalendarSettingsAt(account,before.data.calendarPath),stable=(c:any)=>Object.fromEntries(Object.entries(c).filter(([k])=>!['version','ctag','syncToken'].includes(k)));
  const absent=await davFetch(before.data.trashPath,{method:'GET',headers:{Accept:'text/calendar'}});const sourceAbsent=absent.status===404;await absent.body?.cancel();
  if(!sourceAbsent||!target.found||object.canonical(object.structure(target.calendarData).component)!==object.canonical(object.structure(before.body).component)||await planningVersion(stable(settings))!==await planningVersion(stable(before.settings)))return unknown();dav.strongEtag(target.etag);
  return {...unknown(),outcome:'verified',verified:true,eventPath:target.eventPath,etag:target.etag,uidPreserved:true,originalContentPreserved:true,note:'Ein nativer MOVE; ursprüngliche UID, vollständig gespeicherter Originalinhalt und Kalenderdaten zurückgelesen, Papierkorbkennung fehlt. Keine neue Einladung/Antwort oder Zustellung zugesagt. Kein atomarer Schutz über andere Objekte.'};
 }catch{return unknown();}
}
