// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudAccount,davFetch,parseDav,safeDavPath} from './nextcloud-read';
import {readCalendarSettings,calendarPath,calendarRequest,calendarSettingsInternals} from './calendar-settings';
import {calendarWriteInternals as eventDav} from './calendar-write';
import {calendarObjectInternals as object} from './calendar-series';
import {planningVersion} from './planning-json';
import {xmlText} from './groupware-codec';
import {getDeckRuntimeConfig} from './runtime-config';
import {calendarTrashMetadata} from './calendar-trash';

type Ref={calendarPath:string;expectedAccount:string};
type Recipient={recipientType:'user'|'group';recipientId:string};
const many=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
const text=(v:any):string=>typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
const same=async(a:unknown,b:unknown)=>await planningVersion(a)===await planningVersion(b);
const ns='xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/" xmlns:oc="http://owncloud.org/ns" xmlns:n="http://nextcloud.com/ns"';
const props='<d:resourcetype/><d:displayname/><d:owner/><d:current-user-privilege-set/><d:supported-report-set/><d:sync-token/><cs:getctag/><c:supported-calendar-component-set/><c:calendar-description/><c:calendar-timezone/><a:calendar-color/><a:calendar-order/><oc:invite/><cs:publish-url/><cs:source/><n:deleted-at/>';
function accountMatches(a:Awaited<ReturnType<typeof nextcloudAccount>>,b:typeof a){return a.uid===b.uid&&a.principal===b.principal&&a.calendarHome===b.calendarHome;}
async function properties(path:string,depth='0',requested=props){const r=await calendarRequest(path,'PROPFIND',`<d:propfind ${ns}><d:prop>${requested}</d:prop></d:propfind>`,depth);if(r.status!==207)throw Error('Vollständiger DAV-Multistatus erforderlich.');return parseDav(r.text);}
async function collectionAt(account:Awaited<ReturnType<typeof nextcloudAccount>>,path:string){
 const rows=await properties(path);if(rows.length!==1||safeDavPath(rows[0].href,account.calendarHome)!==path)throw Error('Kalender nicht eindeutig.');
 const p=rows[0].props,calendar=calendarSettingsInternals.normalize(account,rows[0]),name=decodeURIComponent(path.split('/').at(-2)??'');
 const deleted=calendar.resourceTypes.join(',')==='collection,deleted-calendar',active=calendar.resourceTypes.join(',')==='calendar,collection';
 if(!calendar.ownedByAccount||!active&&!deleted||calendar.components.join(',')!=='VEVENT'||name==='contact_birthdays'||name.startsWith('app-generated')||Object.hasOwn(p,'source')||!calendar.privileges.some(v=>['read','all'].includes(v))||!calendar.syncToken&&!calendar.ctag)throw Error('Eigenen regulären vollständigen VEVENT-Kalender wählen; keine fremde, gemischte, abgeleitete oder abonnierte Quelle.');
 const deletedAt=text(p['deleted-at']);if(deleted&&(!deletedAt||!Number.isFinite(Date.parse(deletedAt)))||active&&deletedAt)throw Error('Nativer Löschzustand nicht eindeutig.');
 const raw=p.invite;if(!Object.hasOwn(p,'invite')||raw!==''&&(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['user','organizer'].includes(k))))throw Error('Native direkte Freigaben nicht vollständig bestätigt.');
 const shares=many(raw?.user).map(u=>{const href=text(u?.href),m=/^principal:principals\/(users|groups|circles|remote-users)\/(.+)$/.exec(href),roles=Object.keys(u?.access??{});if(!m||roles.length!==1||!['read','read-write'].includes(roles[0]))throw Error('Native Freigabe nicht eindeutig.');return {href,recipientType:m[1]==='users'?'user':m[1]==='groups'?'group':m[1],recipientId:m[2],role:roles[0],commonName:text(u['common-name'])};}).sort((a,b)=>a.href.localeCompare(b.href));
 if(shares.length>100||new Set(shares.map(s=>s.href)).size!==shares.length)throw Error('Mehr als100 oder doppelte Freigaben.');
 const publication=p['publish-url'];return {calendar,deleted,deletedAt:deletedAt||null,shares,published:Boolean(publication&&text(publication?.href??publication)),publicationVersion:await planningVersion(publication??null)};
}
async function contentsAt(path:string){
 const rows=await properties(path,'1','<d:resourcetype/><d:getetag/><d:getcontentlength/>');if(rows.length>1001)throw Error('Mehr als1000 Kalenderoriginale.');let roots=0;const seen=new Set<string>();
 const children: {path:string;etag:string;bytes:number|null;uid?:string;meeting?:boolean}[]=[];
 for(const row of rows){const p=safeDavPath(row.href,path);if(seen.has(p))throw Error('Doppelte Inhaltskennung.');seen.add(p);if(p===path){roots++;continue;}if(!p.slice(path.length)||p.slice(path.length).includes('/')||Object.keys(row.props.resourcetype??{}).length)throw Error('Unerwarteter Kalenderinhalt.');const size=text(row.props.getcontentlength);if(size&&(!/^\d+$/.test(size)||!Number.isSafeInteger(Number(size))))throw Error('Ungültige Inhaltsgröße.');children.push({path:p,etag:eventDav.strongEtag(text(row.props.getetag)),bytes:size?Number(size):null});}
 if(roots!==1)throw Error('Kalenderumfang ohne eindeutige Wurzel.');
 const r=await calendarRequest(path,'REPORT',`<c:calendar-query ${ns}><d:prop><d:getetag/><c:calendar-data><c:comp name="VCALENDAR"><c:prop name="VERSION"/><c:comp name="VEVENT"><c:prop name="UID"/><c:prop name="ORGANIZER"/><c:prop name="ATTENDEE"/></c:comp></c:comp></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"/></c:filter></c:calendar-query>`,'1');
 if(r.status!==207)throw Error('Vollständige Kalenderidentitäten fehlen.');const projected=parseDav(r.text);if(projected.length!==children.length)throw Error('Kalenderumfang und Identitätsprojektion widersprechen sich.');const found=new Set<string>();
 for(const row of projected){const p=safeDavPath(row.href,path),child=children.find(c=>c.path===p);if(!child||found.has(p)||row.props.getetag!==child.etag||typeof row.props['calendar-data']!=='string')throw Error('Kalenderidentität fehlt, ist doppelt oder verändert.');found.add(p);const data=object.structure(row.props['calendar-data']),events=data.component.getAllSubcomponents('vevent');if(!events.length||data.component.getAllSubcomponents().some(c=>!['vevent','vtimezone'].includes(c.name))||events.some(c=>c.getAllProperties('uid').length!==1))throw Error('Nur eindeutige VEVENT-Originale.');const uids=events.map(c=>c.getFirstPropertyValue('uid'));if(uids.some(u=>typeof u!=='string'||!u||u.length>255)||new Set(uids).size!==1)throw Error('Kalender-UID nicht eindeutig.');child.uid=String(uids[0]);child.meeting=events.some(c=>c.hasProperty('organizer')||c.hasProperty('attendee'));}
 return children.sort((a,b)=>a.path.localeCompare(b.path));
}
async function retentionAt(home:string){
 const path=home+'trashbin/',rows=await properties(path,'0','<d:resourcetype/><n:trash-bin-retention-duration/>');
 const value=text(rows[0]?.props['trash-bin-retention-duration']);if(rows.length!==1||safeDavPath(rows[0].href,home)!==path||!Object.hasOwn(rows[0].props.resourcetype??{},'collection')||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Native Papierkorb-Aufbewahrung nicht bestätigt.');return Number(value);
}
async function snapshot(a:Ref){
 const account=await nextcloudAccount();if(account.uid!==a.expectedAccount)throw Error('Tatsächliches Konto stimmt nicht.');
 const ownHome=account.principal.slice(0,account.principal.lastIndexOf('principals/users/'))+'calendars/'+encodeURIComponent(account.uid)+'/';if(account.calendarHome!==ownHome)throw Error('Eigenes Kalenderverzeichnis nicht bestätigt.');
 const path=calendarPath(account,a.calendarPath),state=await collectionAt(account,path),home=await readCalendarSettings();
 if(!('calendars'in home)||home.account!==account.uid||home.calendarHome!==account.calendarHome||!home.entries.includes(path))throw Error('Kalenderbestand nicht vollständig.');
 const retentionSeconds=await retentionAt(account.calendarHome),contents=await contentsAt(path),trash=await calendarTrashMetadata(account),last=await collectionAt(account,path);
 if(!await same(state,last)||!accountMatches(account,await nextcloudAccount()))throw Error('Konto, Kalender oder Freigaben während Vorschau verändert.');
 const previouslyDeletedObjects=trash.objects.filter(o=>o.calendarUri===decodeURIComponent(path.split('/').at(-2)!));
 const data={account:account.uid,principal:account.principal,calendarHome:account.calendarHome,calendarPath:path,...state,contents,previouslyDeletedObjects,trashVersion:trash.version,retentionSeconds,homeVersion:home.version};
 return {account,home,trash,data,version:await planningVersion(data)};
}
export async function readCalendarManagement(a:Ref){
 const s=await snapshot(a),c=s.data.calendar,canWrite=c.privileges.some(p=>['all','write'].includes(p));
 return {...s.data,version:s.version,objectCount:s.data.contents.length,previouslyDeletedObjectCount:s.data.previouslyDeletedObjects.length,meetingObjectCount:s.data.contents.filter(c=>c.meeting).length,removalMode:s.data.retentionSeconds>0?'trash':'permanent',canDelete:!s.data.deleted&&canWrite&&s.home.privileges.some(p=>['all','write','unbind'].includes(p)),canRestore:s.data.deleted&&canWrite&&s.home.privileges.some(p=>['all','write','bind'].includes(p)),canChangeDirectShares:!s.data.deleted&&c.privileges.some(p=>['all','write-acl'].includes(p)),atomic:false,note:'Nur Umfangsvorschau: gesamter eigener Kalender einschließlich aller aufgelisteten Originale und bestehenden Zugriffsbeziehungen. Bei positiver Aufbewahrung bleibt die native Kennung als deleted-calendar bestehen; Wiederherstellen kann bisherige direkte und sonstige native Zugriffe wieder wirksam machen. Vorher einzeln gelöschte Originale werden damit nicht wiederhergestellt und sind während der gesamten Kalenderlöschung nicht getrennt sichtbar. Bei0Sekunden ist Entfernen samt zuvor einzeln gelöschten Originalen dauerhaft. Kalenderentfernen ist keine einzelne Besprechungsabsage; bei anderen Teilnehmern können Termine fortbestehen. Keine Versand-/Zugriffsaufhebungszusage. Parallele Änderungen zwischen Prüfung und Sammlungsschreiben sind nicht atomar ausgeschlossen.'};
}
const invariant=(c:any)=>Object.fromEntries(Object.entries(c).filter(([k])=>!['version','ctag','syncToken'].includes(k)));
function stableState(d:Awaited<ReturnType<typeof snapshot>>['data']){return {calendar:Object.fromEntries(Object.entries(invariant(d.calendar)).filter(([k])=>k!=='resourceTypes')),contents:d.contents,shares:d.shares,published:d.published,publicationVersion:d.publicationVersion};}
async function othersSame(before:Awaited<ReturnType<typeof snapshot>>,home:Awaited<ReturnType<typeof readCalendarSettings>>,keepEntry:boolean){if(!('calendars'in home)||home.account!==before.account.uid)return false;const path=before.data.calendarPath;return await same(before.home.entries.filter(p=>p!==path),home.entries.filter(p=>p!==path))&&home.entries.includes(path)===keepEntry&&await same(before.home.calendars.filter(c=>c.path!==path).map(invariant),home.calendars.filter(c=>c.path!==path).map(invariant));}
async function removeOrRestore(a:Ref&{expectedVersion:string;acknowledgeContents:true;acknowledgeAccess:true;acknowledgeRetention:true;acknowledgeNoMeetingCancellation:true},restore:boolean){
 if([a.acknowledgeContents,a.acknowledgeAccess,a.acknowledgeRetention,a.acknowledgeNoMeetingCancellation].some(v=>v!==true))throw Error('Inhaltsumfang, bisherige Zugriffe, Aufbewahrungs-/Rückweggrenze und fehlende einzelne Besprechungsabsagen ausdrücklich bestätigen.');
 const before=await snapshot(a),path=before.data.calendarPath;
 if(before.version!==a.expectedVersion||before.data.deleted!==restore||!before.data.calendar.privileges.some(p=>['all','write'].includes(p))||!before.home.privileges.some(p=>['all','write',restore?'bind':'unbind'].includes(p)))throw Error('Vorschau, nativer Zustand oder Entfernungs-/Wiederherstellungsrecht stimmt nicht.');
 if((await snapshot(a)).version!==before.version)throw Error('Kalenderumfang inzwischen verändert. Neu prüfen.');
 let status:number|null=null,accepted:boolean|null=null;
 const unknown=()=>({outcome:'unknown',verified:false,account:a.expectedAccount,calendarPath:path,action:restore?'restore':'delete',writeStatus:status,writeAccepted:accepted,atomic:false,note:'Genau denselben Kalenderpfad mit calendar_read_management und den Bestand mit calendar_read_settings lesen. Nicht automatisch wiederholen, endgültig löschen oder neu anlegen. Keine atomare Sammlungsversion und keine Besprechungs-/Zustellzusage.'});
 try{const target=before.account.calendarHome+'trashbin/restore/'+path.split('/').at(-2)+'/',base=getDeckRuntimeConfig()?.baseUrl??process.env.NEXTCLOUD_BASE_URL;const r=await davFetch(path,{method:restore?'MOVE':'DELETE',headers:restore?{Destination:new URL(target,base).href,Overwrite:'F'}:{}});status=r.status;accepted=(restore?[201,204]:[204]).includes(status);await r.body?.cancel();}catch{return unknown();}
 if(!accepted)return unknown();
 try{
  const home=await readCalendarSettings(),last=await nextcloudAccount();if(!accountMatches(before.account,last))return unknown();
  const trash=await calendarTrashMetadata(last),slug=decodeURIComponent(path.split('/').at(-2)!);if(!await same(before.trash.objects.filter(o=>o.calendarUri!==slug),trash.objects.filter(o=>o.calendarUri!==slug))||!restore&&trash.objects.some(o=>o.calendarUri===slug))return unknown();
  if(!restore&&before.data.retentionSeconds===0){const r=await davFetch(path,{method:'PROPFIND',headers:{Depth:'0','Content-Type':'application/xml'},body:`<d:propfind ${ns}><d:prop><d:resourcetype/></d:prop></d:propfind>`});const absent=r.status===404;await r.body?.cancel();if(!absent||!await othersSame(before,home,false))return unknown();return {...unknown(),outcome:'verified',verified:true,removed:true,inTrash:false,restorable:false,note:'Native dauerhafte Entfernung bei bestätigter Aufbewahrung0 zurückgeprüft. Kein zugesagter Rückweg. Keine einzelnen Besprechungsabsagen beauftragt.'};}
  const after=await snapshot(a);if(after.data.deleted===restore||!await same(stableState(before.data),stableState(after.data))||!await othersSame(before,home,true))return unknown();
  return {...unknown(),outcome:'verified',verified:true,removed:!restore,inTrash:!restore,restorable:!restore,version:after.version,objectCount:after.data.contents.length,directShares:after.data.shares,atomic:false,note:restore?'Native Kalenderkennung samt Originalen und bisherigen direkten Freigaben wiederhergestellt; sonstige native Zugriffe können wieder wirksam sein. Keine Einladung/Zustellung bestätigt.':'Native deleted-calendar-Markierung an derselben Kennung samt Originalen und direkten Freigaben zurückgelesen. Rückweg bis nativer Bereinigung; kein garantierter Aufbewahrungszeitraum. Keine einzelnen Besprechungsabsagen beauftragt.'};
 }catch{return unknown();}
}
export const deleteCalendar=(a:Parameters<typeof removeOrRestore>[0])=>removeOrRestore(a,false);
export const restoreCalendar=(a:Parameters<typeof removeOrRestore>[0])=>removeOrRestore(a,true);
export async function changeCalendarShare(a:Ref&Recipient&{expectedVersion:string;operation:'create'|'update'|'revoke';role?:'read'|'read-write';acknowledgeCalendarAccess:true}){
 if(a.acknowledgeCalendarAccess!==true||!['user','group'].includes(a.recipientType)||!a.recipientId||a.recipientId!==a.recipientId.trim()||a.recipientId.length>255||/[\/\\\x00-\x1f\x7f]/.test(a.recipientId)||a.recipientType==='user'&&a.recipientId.toLowerCase()===a.expectedAccount.toLowerCase()||!['create','update','revoke'].includes(a.operation)||a.operation==='revoke'&&a.role!==undefined||a.operation!=='revoke'&&!['read','read-write'].includes(a.role??''))throw Error('Exakten lokalen fremden Empfänger, konkrete Freigabehandlung/Rolle und Zugriff auf bestehende/künftige Termine bestätigen.');
 const before=await snapshot(a);if(before.version!==a.expectedVersion||before.data.deleted||!before.data.calendar.privileges.some(p=>['all','write-acl'].includes(p)))throw Error('Kalenderfreigabe verändert oder natives Verwaltungsrecht fehlt.');
 const href='principal:principals/'+(a.recipientType==='user'?'users/':'groups/')+a.recipientId,old=before.data.shares.find(s=>s.href===href);
 if(a.operation==='create'&&old||a.operation!=='create'&&!old)throw Error('Direkte Empfängerfreigabe bereits vorhanden oder fehlt.');
 if(a.operation==='update'&&old?.role===a.role)return {outcome:'unchanged',verified:true,account:a.expectedAccount,version:before.version,shares:before.data.shares,atomic:false};
 if((await snapshot(a)).version!==before.version)throw Error('Freigabeumfang inzwischen verändert.');
 const body=a.operation==='revoke'?`<oc:remove><d:href>${xmlText(href)}</d:href></oc:remove>`:`<oc:set><d:href>${xmlText(href)}</d:href><oc:${a.role}/></oc:set>`;
 let status:number|null=null;try{const r=await davFetch(before.data.calendarPath,{method:'POST',headers:{'Content-Type':'application/xml; charset=utf-8'},body:`<oc:share ${ns}>${body}</oc:share>`});status=r.status;await r.body?.cancel();}catch{}
 try{const after=await snapshot(a),entry=after.data.shares.find(s=>s.href===href),others=(d:typeof after.data)=>({...stableState(d),shares:d.shares.filter(s=>s.href!==href)}),verified=status===200&&(a.operation==='revoke'?!entry:entry?.role===a.role)&&await same(others(before.data),others(after.data));return {outcome:verified?'verified':'unknown',verified,account:a.expectedAccount,calendarPath:before.data.calendarPath,recipientType:a.recipientType,recipientId:a.recipientId,operation:a.operation,shares:after.data.shares,version:after.version,writeStatus:status,notificationMayBeSent:true,otherAccessMayRemain:true,atomic:false,note:'Ein nativer Freigabe-POST; Inhalte, andere direkte Freigaben und Kalenderdaten rückgeprüft. Keine atomare Freigabeversion. Andere Zugriffswege/Delegation können bestehen bleiben, native Mitteilungen möglich. Bei unknown denselben Kalender/Empfänger lesen; nicht wiederholen.'};}catch{return {outcome:'unknown',verified:false,account:a.expectedAccount,calendarPath:before.data.calendarPath,recipientId:a.recipientId,writeStatus:status,atomic:false,note:'Freigabeänderung unklar. Dieselbe Kalender-/Empfängerkennung lesen; nicht automatisch wiederholen.'};}
}
