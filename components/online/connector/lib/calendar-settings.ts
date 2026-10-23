// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudAccount, davFetch, parseDav, safeDavPath, readBody } from './nextcloud-read';
import { planningVersion } from './planning-json';
import { xmlText } from './groupware-codec';

const list=(x:any):any[]=>x===undefined?[]:Array.isArray(x)?x:[x];
const text=(x:any):string=>typeof x==='string'?x:typeof x?.['#text']==='string'?x['#text']:'';
const has=(x:any,k:string)=>x!=null&&Object.hasOwn(x,k);
const namespaces='xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/"';
const properties='<d:resourcetype/><d:displayname/><d:owner/><d:current-user-privilege-set/><d:supported-report-set/><d:sync-token/><cs:getctag/><c:supported-calendar-component-set/><c:calendar-description/><c:calendar-timezone/><a:calendar-color/><a:calendar-order/>';
export type CalendarAccount=Awaited<ReturnType<typeof nextcloudAccount>>;
export function calendarPath(account:CalendarAccount,input:string){
 const p=safeDavPath(input,account.calendarHome);
 if(!p.endsWith('/')||!/^[^/]+\/$/.test(p.slice(account.calendarHome.length)))throw new Error('Direkte Kalenderkennung aus calendar_list oder calendar_read_settings erforderlich.');
 return p;
}
export async function calendarRequest(path:string,method:string,body?:string,depth?:string,max=2*1024*1024){
 let r:Response;try{r=await davFetch(path,{method,body,headers:{Accept:'application/xml, text/calendar',...(body?{'Content-Type':'application/xml; charset=utf-8'}:{}),...(depth?{Depth:depth}:{}),...(method==='MKCALENDAR'?{'If-None-Match':'*'}:{})}});}catch{throw new Error(method==='PROPFIND'||method==='REPORT'?'Kalenderdienst nicht erreichbar.':'Kalender-Schreibergebnis unbekannt. Ziel lesen; nicht automatisch wiederholen.');}
 if(r.status>=300){await r.body?.cancel();throw new Error(`Kalenderdienst: HTTP ${r.status}.`);}
 return {status:r.status,headers:r.headers,text:await readBody(r,max)};
}
function ownerIsAccount(account:CalendarAccount,owner:string){try{return safeDavPath(owner,account.principal.replace(/users\/[^/]+\/$/,'users/')).replace(/\/$/,'')===account.principal.replace(/\/$/,'');}catch{return false;}}
function normalize(account:CalendarAccount,row:any){
 const p=row.props,path=calendarPath(account,row.href),privileges=list(p['current-user-privilege-set']?.privilege).flatMap(x=>Object.keys(x)).sort();
 const components=list(p['supported-calendar-component-set']?.comp).map(x=>x?.['@_name']);
 if(components.some(x=>typeof x!=='string')||new Set(components).size!==components.length)throw new Error('Ungültige Kalenderkomponenten.');
 const reports=list(p['supported-report-set']?.['supported-report']).flatMap(x=>Object.keys(x?.report??{})).sort();
 const owner=text(p.owner?.href),order=text(p['calendar-order']);
 return {path,title:text(p.displayname),description:text(p['calendar-description']),color:text(p['calendar-color']),order:order===''?null:/^-?\d+$/.test(order)&&Number.isSafeInteger(Number(order))?Number(order):(()=>{throw Error('Ungültige Kalenderreihenfolge.');})(),owner,ownedByAccount:ownerIsAccount(account,owner),privileges,components:components.sort() as string[],reports,resourceTypes:Object.keys(p.resourcetype??{}).sort(),timezone:text(p['calendar-timezone']),syncToken:text(p['sync-token']),ctag:text(p.getctag)};
}
async function propfind(path:string,depth:string){const r=await calendarRequest(path,'PROPFIND',`<?xml version="1.0"?><d:propfind ${namespaces}><d:prop>${properties}</d:prop></d:propfind>`,depth);if(r.status!==207)throw new Error('Kalendereigenschaften benötigen DAV-Multistatus.');return parseDav(r.text);}
export async function readCalendarSettingsAt(account:CalendarAccount,input:string){
 const path=calendarPath(account,input),rows=await propfind(path,'0');
 if(rows.length!==1||safeDavPath(rows[0].href,account.calendarHome)!==path||!has(rows[0].props.resourcetype,'calendar'))throw new Error('Keine eindeutige native Kalenderkennung.');
 const calendar=normalize(account,rows[0]);return {...calendar,version:await planningVersion(calendar)};
}
export async function readCalendarSettings(input?:string){
 const account=await nextcloudAccount();
 if(input!==undefined)return {account:account.uid,calendar:await readCalendarSettingsAt(account,input),atomic:false};
 const rows=await propfind(account.calendarHome,'1');if(rows.length>201)throw new Error('Mehr als200 Kalendereinträge.');
 const seen=new Set<string>();let home:any;const calendars:Awaited<ReturnType<typeof readCalendarSettingsAt>>[]=[],entries:string[]=[];
 for(const row of rows){const p=safeDavPath(row.href,account.calendarHome);if(seen.has(p))throw new Error('Doppelte Kalenderkennung.');seen.add(p);if(p===account.calendarHome){home=row.props;continue;}calendarPath(account,p);entries.push(p);if(has(row.props.resourcetype,'calendar')){const c=normalize(account,row);calendars.push({...c,version:await planningVersion(c)});}}
 if(!home)throw new Error('Kalenderverzeichnis nicht bestätigt.');
 const privileges=list(home['current-user-privilege-set']?.privilege).flatMap(x=>Object.keys(x)).sort();calendars.sort((a,b)=>a.path.localeCompare(b.path));entries.sort();
 const collection={calendarHome:account.calendarHome,privileges,entries,calendars};return {account:account.uid,...collection,version:await planningVersion(collection),atomic:false,note:'Technisches Konto ist Eigentümer neuer Kalender. Metadatenversion ist kein atomarer Schreibschutz. Kalenderinhalte und Freigaben werden hier nicht geändert.'};
}
export function fullCalendarAccess(c:Awaited<ReturnType<typeof readCalendarSettingsAt>>){
 return c.ownedByAccount&&c.components.includes('VEVENT')&&!c.resourceTypes.includes('subscribed')&&(c.privileges.includes('read')||c.privileges.includes('all'));
}
type Patch={title?:string;description?:string;color?:string;order?:number};
function patchXml(patch:Patch){
 const map={title:'d:displayname',description:'c:calendar-description',color:'a:calendar-color',order:'a:calendar-order'};
 for(const [k,v] of Object.entries(patch)){
  if(!Object.hasOwn(map,k))throw new Error('Nicht unterstützte Kalendereigenschaft.');
  if(k==='order'){if(!Number.isInteger(v)||Number(v)<0||Number(v)>2147483647)throw new Error('Ungültiger Sortierwert.');}
  else if(typeof v!=='string'||new TextDecoder().decode(new TextEncoder().encode(v))!==v||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)||v.length>(k==='description'?4000:255)||(k==='title'&&!v.trim())||(k==='color'&&!/^#[A-Fa-f0-9]{6}(?:[A-Fa-f0-9]{2})?$/.test(v)))throw new Error('Ungültige Kalendereigenschaft.');
 }
 return Object.entries(patch).map(([k,v])=>`<${map[k as keyof Patch]}>${xmlText(String(v))}</${map[k as keyof Patch]}>`).join('');
}
const matches=(calendar:any,patch:Patch)=>Object.entries(patch).every(([k,v])=>k==='color'?calendar[k].toLowerCase()===String(v).toLowerCase():calendar[k]===v);
const unchanged=(calendar:any)=>Object.fromEntries(Object.entries(calendar).filter(([k])=>!['version','ctag','syncToken','title','description','color','order'].includes(k)));
type SettingsUpdate=Patch&{calendarPath:string;expectedAccount:string;expectedVersion:string};
function ownTaskList(c:Awaited<ReturnType<typeof readCalendarSettingsAt>>){
 const name=decodeURIComponent(c.path.split('/').at(-2)??'');
 return c.ownedByAccount&&c.components.join(',')==='VTODO'&&c.resourceTypes.every(t=>['calendar','collection'].includes(t))&&!name.startsWith('app-generated')&&name!=='contact_birthdays'&&Boolean(c.syncToken||c.ctag)&&c.privileges.some(p=>['all','read'].includes(p));
}
async function updateCollectionSettings(a:SettingsUpdate,component:'VEVENT'|'VTODO'){
 const {calendarPath:path,expectedAccount,expectedVersion,...patch}=a;const xml=patchXml(patch);if(!xml)throw new Error('Keine Kalendereigenschaft angegeben.');
 const account=await nextcloudAccount();if(account.uid!==expectedAccount)throw new Error('Kontowechsel: Kalenderänderung gestoppt.');
 const before=await readCalendarSettingsAt(account,path);
 if(before.version!==expectedVersion)throw new Error('Kalender verändert. Eigenschaften neu lesen.');
 if(component==='VTODO'?!ownTaskList(before)||!before.privileges.some(p=>['all','write','write-properties'].includes(p)):!fullCalendarAccess(before)||!before.privileges.some(p=>['all','write'].includes(p))||before.path.endsWith('/contact_birthdays/'))throw new Error(component==='VTODO'?'Nur eigene reguläre reine VTODO-Liste mit Leserecht, Änderungskennung und nativem Metadaten-Schreibrecht bearbeiten.':'Nur eigenen regulären VEVENT-Kalender mit vollständigem nativen Schreibrecht bearbeiten.');
 if(matches(before,patch))return {outcome:'unchanged',account:account.uid,calendar:before,atomic:false};
 if((await nextcloudAccount()).uid!==expectedAccount||(await readCalendarSettingsAt(account,path)).version!==before.version)throw new Error('Konto oder Kalender inzwischen verändert.');
 try{
  const r=await calendarRequest(before.path,'PROPPATCH',`<?xml version="1.0"?><d:propertyupdate ${namespaces}><d:set><d:prop>${xml}</d:prop></d:set></d:propertyupdate>`);
  if(r.status!==207)throw Error();const rows=parseDav(r.text);const keys=Object.keys(patch).map(k=>({title:'displayname',description:'calendar-description',color:'calendar-color',order:'calendar-order'}[k]));
  if(rows.length!==1||safeDavPath(rows[0].href,account.calendarHome)!==before.path||keys.some(k=>!Object.hasOwn(rows[0].props,k!)))throw Error();
  const after=await readCalendarSettingsAt(account,path);
  const verified=(await nextcloudAccount()).uid===expectedAccount&&matches(after,patch)&&await planningVersion(unchanged(after))===await planningVersion(unchanged(before));
  // Compare omitted editable fields separately; change tokens may legitimately advance.
  const preserved=['title','description','color','order'].every(k=>Object.hasOwn(patch,k)||(after as any)[k]===(before as any)[k]);
  return {outcome:verified&&preserved?'verified':'unknown',account:account.uid,calendar:after,atomic:false,note:'Nur angegebene Kalender-Metadaten gesetzt, keine Ereignis-/Freigabeänderung beauftragt. Keine atomare Versionsbedingung; bei unknown Eigenschaften lesen.'};
 }catch{return {outcome:'unknown',account:account.uid,calendarPath:before.path,atomic:false,note:'Kalenderänderung nicht vollständig bestätigt. Eigenschaften lesen, nicht automatisch wiederholen.'};}
}
type CollectionCreate=Patch&{calendarId:string;title:string;expectedAccount:string;expectedCollectionVersion:string};
async function createCollection(a:CollectionCreate,component:'VEVENT'|'VTODO'){
 const {calendarId,expectedAccount,expectedCollectionVersion,...patch}=a;
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(calendarId))throw new Error('Stabile Kalenderkennung vor dem ersten Versuch festlegen.');
 if(component==='VTODO'&&(/^(?:app-generated|contact_birthdays|trashbin|notifications)/i.test(calendarId)))throw new Error('Reservierte oder abgeleitete Aufgabenlistenkennung.');
 const xml=patchXml(patch),account=await nextcloudAccount();if(account.uid!==expectedAccount)throw new Error('Kontowechsel: Kalenderanlage gestoppt.');
 const before=await readCalendarSettings();if(!('calendars' in before)||before.account!==expectedAccount||before.version!==expectedCollectionVersion)throw new Error('Kalenderverzeichnis verändert. Ohne calendarPath neu lesen.');
 const expectedHome=account.principal.slice(0,account.principal.lastIndexOf('principals/users/'))+'calendars/'+encodeURIComponent(account.uid)+'/';
 if(account.calendarHome!==expectedHome||!before.privileges.some(p=>['all','bind','write'].includes(p)))throw new Error('Eigenes Kalenderverzeichnis oder natives Anlagerecht nicht bestätigt.');
 const path=calendarPath(account,account.calendarHome+calendarId+'/');
 if(before.entries.includes(path)||before.calendars.some(c=>c.title.toLocaleLowerCase('de')===a.title.toLocaleLowerCase('de')))throw new Error('Kalenderkennung oder gleichnamiger Kalender bereits vorhanden. Nicht erneut anlegen.');
 const last=await readCalendarSettings();if(!('calendars' in last)||last.account!==expectedAccount||last.version!==before.version)throw new Error('Kalenderbestand inzwischen verändert.');
 try{
  const r=await calendarRequest(path,'MKCALENDAR',`<?xml version="1.0"?><c:mkcalendar ${namespaces}><d:set><d:prop>${xml}<c:supported-calendar-component-set><c:comp name="${component}"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`);
  if(r.status!==201)throw Error();const after=await readCalendarSettings();if(!('calendars' in after))throw Error();const created=after.calendars.find(c=>c.path===path);
  const verified=after.account===expectedAccount&&created?.ownedByAccount===true&&created.components.join(',')===component&&(component!=='VTODO'||ownTaskList(created))&&matches(created,patch)&&after.entries.length===before.entries.length+1&&before.entries.every(p=>after.entries.includes(p))&&await planningVersion(after.calendars.filter(c=>c.path!==path))===await planningVersion(before.calendars);
  return {outcome:verified?'verified':'unknown',account:account.uid,calendarPath:path,calendar:created??null,atomic:false,note:`Neue eigene ${component}-Sammlung ohne Freigabe oder Inhalte. Bei unknown genau diese Kennung lesen; keine neue Kennung versuchen.`};
 }catch{return {outcome:'unknown',account:account.uid,calendarPath:path,atomic:false,note:'Kalenderanlage nicht bestätigt. Genau diese Kalenderkennung lesen, nicht automatisch erneut anlegen.'};}
}
export const updateCalendarSettings=(a:SettingsUpdate)=>updateCollectionSettings(a,'VEVENT');
export const createCalendar=(a:CollectionCreate)=>createCollection(a,'VEVENT');
export async function readTaskListSettings(listPath?:string){
 const data=await readCalendarSettings(listPath);
 if('calendar' in data&&data.calendar){
  if(!data.calendar.components.includes('VTODO'))throw new Error('Gewählte Quelle ist keine VTODO-Aufgabenliste.');
  return {account:data.account,list:data.calendar,metadataEditable:ownTaskList(data.calendar)&&data.calendar.privileges.some(p=>['all','write','write-properties'].includes(p)),atomic:false};
 }
 if(!('calendars' in data)||!data.calendars)throw new Error('Aufgabenlistenbestand nicht bestätigt.');
 return {account:data.account,lists:data.calendars.filter(c=>c.components.includes('VTODO')).map(c=>({...c,metadataEditable:ownTaskList(c)&&c.privileges.some(p=>['all','write','write-properties'].includes(p))})),version:data.version,atomic:false,note:'Höchstens200 Kalendereinträge/2MiB. Version bindet den gesamten Kalender-Heimbestand; nur VTODO-Quellen ausgegeben. Deckansichten, fremde und gemischte Kalender sind nicht als Aufgabenliste verwaltbar. Keine Aufgabeninhalte gelesen.'};
}
function taskListResult<T extends object>(r:T,fallbackPath:string){
 const {calendarPath,calendar:list,...rest}=r as T&{calendarPath?:string;calendar?:unknown};return {...rest,listPath:calendarPath??fallbackPath,...(list!==undefined?{list}:{})};
}
export async function createTaskList(a:Patch&{listId:string;title:string;expectedAccount:string;expectedCollectionVersion:string}){
 const {listId,...rest}=a,result=await createCollection({...rest,calendarId:listId},'VTODO');return taskListResult(result,result.calendarPath);
}
export async function updateTaskListSettings(a:Patch&{listPath:string;expectedAccount:string;expectedVersion:string}){
 const {listPath,...rest}=a;return taskListResult(await updateCollectionSettings({...rest,calendarPath:listPath},'VTODO'),listPath);
}
