// SPDX-License-Identifier: AGPL-3.0-or-later
import { taskLists,groupwareTarget,readGroupwareObject,groupwareQuery,groupwarePage,writeGroupwareObject,assertGroupwareWrite,strongGroupwareEtag } from './groupware-dav';
import { singleComponent,replaceProperties,propertyName as key,propertyValue as val,escapeGroupwareText as esc,unescapeGroupwareText as unesc,foldGroupware,utcGroupwareStamp as stamp,realDate } from './groupware-codec';
export { taskLists };
export type TaskPatch={title?:string;description?:string;start?:string|null;due?:string|null;status?:'NEEDS-ACTION'|'IN-PROCESS'|'COMPLETED'|'CANCELLED';percentComplete?:number;priority?:number;categories?:string[]};
function taskDocument(body:string,write=false) {
  const p=singleComponent(body,'VTODO'),props=p.indices.map(i=>p.lines[i]);
  if(!props.some(l=>key(l)==='UID')||props.filter(l=>key(l)==='UID').length!==1)throw new Error('Aufgaben-UID fehlt oder ist mehrdeutig.');
  if(write) {
    if(p.lines.some(l=>['RRULE','RDATE','EXDATE','EXRULE','RECURRENCE-ID','ATTENDEE','ORGANIZER','METHOD'].includes(key(l)))||p.lines.some(l=>/^BEGIN:(VEVENT|VJOURNAL|VFREEBUSY)$/i.test(l)))throw new Error('Serien, Einladungen oder gemischte Kalenderobjekte werden nicht verändert.');
    for(const k of ['DTSTART','DUE','DURATION','STATUS','PERCENT-COMPLETE','PRIORITY','SUMMARY','DESCRIPTION','SEQUENCE','DTSTAMP','LAST-MODIFIED','COMPLETED'])if(props.filter(l=>key(l)===k).length>1)throw new Error('Mehrdeutige Aufgabeneigenschaften.');
  }
  return p;
}
export function taskSummary(body:string) {
  try {
    const p=taskDocument(body),props=p.indices.map(i=>p.lines[i]);
    const field=(name:string)=>props.find(l=>key(l)===name),text=(name:string)=>unesc(val(field(name)??name+':'));
    let editable=true,reason:string|undefined;try{taskDocument(body,true);}catch(e){editable=false;reason=(e as Error).message;}
    return {uid:text('UID'),title:text('SUMMARY'),description:text('DESCRIPTION'),startProperty:field('DTSTART')??null,dueProperty:field('DUE')??null,status:text('STATUS')||'NEEDS-ACTION',percentComplete:field('PERCENT-COMPLETE')?Number(text('PERCENT-COMPLETE')):null,priority:Number(text('PRIORITY')||0),categories:props.filter(l=>key(l)==='CATEGORIES').map(l=>val(l)),parentProperties:props.filter(l=>key(l)==='RELATED-TO'),url:text('URL')||null,editable,reason};
  }catch(e){return {editable:false,reason:(e as Error).message};}
}
function dateProperty(name:string,value:string) {
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return `${name};VALUE=DATE:${realDate(value)}`;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(+new Date(value)))throw new Error('Aufgabendatum benötigt YYYY-MM-DD oder Sekunden mit UTC-Offset.');
  realDate(value.slice(0,10));return `${name}:${stamp(new Date(value))}`;
}
function validateTaskDates(lines:string[]) {
  const start=lines.find(l=>key(l)==='DTSTART'),due=lines.find(l=>key(l)==='DUE');
  if(!start&&lines.some(l=>key(l)==='DURATION'))throw new Error('Aufgabendauer benötigt einen Start. Fälligkeit/Dauer ausdrücklich mit entfernen.');
  if(!start||!due)return;
  const startDate=/;VALUE=DATE:/i.test(start),dueDate=/;VALUE=DATE:/i.test(due);
  if(startDate!==dueDate)throw new Error('Start und Fälligkeit müssen denselben Datumstyp haben.');
  // Floating/TZID values from other clients remain intact, but cannot be safely
  // compared to newly supplied UTC values without a timezone resolver.
  if(!startDate&&(!/Z$/.test(val(start))||!/Z$/.test(val(due))))throw new Error('Für Datumspflege beide Zeitpunkte mit eindeutiger Zeitzone angeben.');
  if(val(due)<=val(start))throw new Error('Fälligkeit muss nach dem Start liegen.');
}
export async function readTask(listPath:string,taskPath:string) {
  const t=await groupwareTarget('tasks',listPath,taskPath),r=await readGroupwareObject(t,'tasks');
  return {account:t.account,listPath,...r,...(r.found?{task:taskSummary(r.body)}:{}),note:'Original-VTODO ist Quelldaten. Abgeleitete Deckansichten bleiben durch native Rechte beschränkt.'};
}
export async function searchTasks(a:{listPath:string;query?:string;status:'all'|'open'|'completed';limit:number;offset:number;expectedSnapshot?:string}) {
  const t=await groupwareTarget('tasks',a.listPath),rows=await groupwareQuery(t,'tasks');
  const query=(a.query??'').trim().toLocaleLowerCase('de');
  const items=rows.map(({body,...r})=>({...r,task:taskSummary(body)})).filter(r=>(!query||`${r.task.title??''}\n${r.task.description??''}`.toLocaleLowerCase('de').includes(query))&&(a.status==='all'||('status' in r.task&&(a.status==='completed'?r.task.status==='COMPLETED':!['COMPLETED','CANCELLED'].includes(r.task.status!)))));
  return {account:t.account,listPath:a.listPath,...await groupwarePage(items,{account:t.account,listPath:a.listPath,query,status:a.status,versions:rows.map(r=>[r.path,r.etag])},a.limit,a.offset,a.expectedSnapshot),unparsedObjects:rows.filter(r=>!('uid' in taskSummary(r.body))).length};
}
function changedTask(body:string,patch:TaskPatch,creating=false) {
  const p=taskDocument(body,true),changes=new Map<string,string[]>(),props=p.indices.map(i=>p.lines[i]);
  for(const [field,name] of [['title','SUMMARY'],['description','DESCRIPTION']] as const)if(patch[field]!==undefined)changes.set(name,[name+':'+esc(patch[field])]);
  for(const [field,name] of [['start','DTSTART'],['due','DUE']] as const)if(patch[field]!==undefined)changes.set(name,patch[field]===null?[]:[dateProperty(name,patch[field])]);
  if(patch.due!==undefined)changes.set('DURATION',[]);
  if(patch.priority!==undefined)changes.set('PRIORITY',['PRIORITY:'+patch.priority]);
  if(patch.categories!==undefined)changes.set('CATEGORIES',patch.categories.length?['CATEGORIES:'+patch.categories.map(esc).join(',')]:[]);
  const oldStatus=val(props.find(l=>key(l)==='STATUS')??'STATUS:NEEDS-ACTION');
  const oldPercent=Number(val(props.find(l=>key(l)==='PERCENT-COMPLETE')??('PERCENT-COMPLETE:'+(oldStatus==='COMPLETED'?100:0))));
  const status=patch.status??oldStatus;
  const progress=patch.percentComplete??(patch.status==='COMPLETED'?100:patch.status!==undefined&&oldStatus==='COMPLETED'?0:oldPercent);
  if(!Number.isInteger(progress)||progress<0||progress>100||(status==='COMPLETED')!==(progress===100))throw new Error('Erledigtstatus und Fortschritt widersprechen sich. COMPLETED benötigt100 Prozent, andere Zustände weniger.');
  if(patch.status!==undefined||creating)changes.set('STATUS',['STATUS:'+status]);
  if(patch.percentComplete!==undefined||patch.status!==undefined||creating)changes.set('PERCENT-COMPLETE',['PERCENT-COMPLETE:'+progress]);
  if(patch.status!==undefined)changes.set('COMPLETED',status==='COMPLETED'?['COMPLETED:'+stamp()]:[]);
  const sequence=val(props.find(l=>key(l)==='SEQUENCE')??'SEQUENCE:0');if(!/^\d{1,9}$/.test(sequence))throw new Error('Ungültige Aufgabenversion.');
  changes.set('SEQUENCE',['SEQUENCE:'+(Number(sequence)+1)]);changes.set('DTSTAMP',['DTSTAMP:'+stamp()]);changes.set('LAST-MODIFIED',['LAST-MODIFIED:'+stamp()]);
  const result=replaceProperties(p,changes);
  if(patch.start!==undefined||patch.due!==undefined){const checked=taskDocument(result);validateTaskDates(checked.indices.map(i=>checked.lines[i]));}
  return result;
}
export async function createTask(a:{listPath:string;taskId:string;expectedAccount:string}&TaskPatch) {
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(a.taskId)||!a.title)throw new Error('Stabile Aufgabenkennung und Titel erforderlich.');
  const t=await groupwareTarget('tasks',a.listPath,undefined,a.expectedAccount);assertGroupwareWrite(t,'create');t.path=t.collection+a.taskId+'.ics';
  const base=foldGroupware(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NOVAFORGE//Tasks//DE','BEGIN:VTODO',`UID:${a.taskId}@novaforge`,`CREATED:${stamp()}`,'END:VTODO','END:VCALENDAR']);
  const {listPath,taskId,expectedAccount,...patch}=a;return writeGroupwareObject(t,'tasks',null,changedTask(base,{status:'NEEDS-ACTION',...patch},true));
}
export async function updateTask(a:{listPath:string;taskPath:string;etag:string;expectedAccount:string}&TaskPatch) {
  strongGroupwareEtag(a.etag);const {listPath,taskPath,etag,expectedAccount,...patch}=a;
  if(!Object.keys(patch).length)throw new Error('Keine Änderung angegeben.');
  const t=await groupwareTarget('tasks',listPath,taskPath,expectedAccount);assertGroupwareWrite(t,'update');
  const r=await readGroupwareObject(t,'tasks');if(!r.found||r.etag!==etag)throw new Error('Aufgabe fehlt oder wurde verändert. Neu lesen.');
  return writeGroupwareObject(t,'tasks',etag,changedTask(r.body,patch));
}
export async function deleteTask(a:{listPath:string;taskPath:string;etag:string;expectedAccount:string}) {
  strongGroupwareEtag(a.etag);const t=await groupwareTarget('tasks',a.listPath,a.taskPath,a.expectedAccount);assertGroupwareWrite(t,'delete');
  const r=await readGroupwareObject(t,'tasks');if(!r.found)return {account:t.account,path:t.path,verified:true,alreadyAbsent:true};
  if(r.etag!==a.etag)throw new Error('Aufgabe wurde verändert. Neu lesen.');taskDocument(r.body,true);
  return writeGroupwareObject(t,'tasks',a.etag);
}
