// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity } from './nextcloud-read';
import { planningJson, planningVersion } from './planning-json';
const root='/index.php/apps/deck/api/v1.0';
const request=async(path:string,method='GET',body?:unknown)=>(await planningJson(root+path,method,body)).data;
function object(x:any) { if (!x || typeof x!=='object' || Array.isArray(x)) throw new Error('Ungültige Deck-Antwort.'); return x; }
function array(x:any):any[] { if(!Array.isArray(x)||x.length>5000)throw new Error('Deck-Auswahl zu groß oder ungültig.');return x; }
const assignedUid=(u:any)=>typeof u.participant==='string'?u.participant:(u.participant?.uid??u.participant?.primaryKey??u.uid??u.primaryKey);
const boardPath=(id:number)=>`/boards/${id}`;
export async function readPlanningBoard(boardId:number) {
  const board=object(await request(boardPath(boardId)));
  if(board.id!==boardId||board.deletedAt)throw new Error('Board nicht verfügbar.');
  return {board,version:await planningVersion(Object.fromEntries(['id','title','color','archived','deletedAt','permissions','labels','users','acl'].map(k=>[k,board[k]??null])))};
}
export async function readPlanningCard(boardId:number,stackId:number,cardId:number) {
  const {version:boardVersion}=await readPlanningBoard(boardId);
  const stacks=array(await request(`${boardPath(boardId)}/stacks`));
  if(!stacks.some(s=>s.id===stackId&&!s.deletedAt&&s.boardId===boardId))throw new Error('Liste gehört nicht zum gewählten Board.');
  const card=object(await request(`${boardPath(boardId)}/stacks/${stackId}/cards/${cardId}`));
  if(card.id!==cardId||card.stackId!==stackId||card.deletedAt)throw new Error('Karte nicht verfügbar oder inzwischen verschoben.');
  return {card,version:await planningVersion(card),boardVersion};
}
export async function listPlanningCards(a:{boardId:number;archive:'active'|'archived'|'all';query?:string;status:'all'|'open'|'done';labelId?:number;assignee?:string;limit:number;offset:number;expectedSnapshot?:string}) {
  await readPlanningBoard(a.boardId);
  const base=boardPath(a.boardId);
  const active=a.archive==='archived'?[]:array(await request(`${base}/stacks`));
  const archived=a.archive==='active'?[]:array(await request(`${base}/stacks/archived`));
  // Native archived-stack responses omit assignments. Do not silently report no matches.
  if(a.assignee&&a.archive!=='active')throw new Error('Zuständigkeitsfilter im Archiv nicht verfügbar. Archiv ohne diesen Filter lesen und einzelne Karten prüfen.');
  const cards=new Map<number,any>();
  for(const stack of [...active,...archived]) {
    if(stack.deletedAt)continue;
    if(stack.boardId!==a.boardId)throw new Error('Fremde Liste in Deck-Antwort.');
    for(const card of array(stack.cards??[])) {
      if(card.deletedAt)continue;
      if(card.stackId!==stack.id||!Number.isSafeInteger(card.id))throw new Error('Ungültige Kartenzuordnung.');
      if(a.archive==='active'&&card.archived||a.archive==='archived'&&!card.archived)continue;
      cards.set(card.id,{...card,stackTitle:stack.title});
      if(cards.size>5000)throw new Error('Board zu groß: mehr als 5000 Karten.');
    }
  }
  const all=[...cards.values()].sort((x,y)=>x.stackId-y.stackId||(x.order??0)-(y.order??0)||x.id-y.id);
  const snapshot=await planningVersion({boardId:a.boardId,archive:a.archive,query:a.query??'',status:a.status,labelId:a.labelId??null,assignee:a.assignee??null,cards:all});
  if((a.offset>0&&!a.expectedSnapshot)||(a.expectedSnapshot&&a.expectedSnapshot!==snapshot))throw new Error('Kartenauswahl verändert oder Seitennachweis fehlt. Bei Seite 1 beginnen.');
  const needle=(a.query??'').trim().toLocaleLowerCase('de');
  const filtered=all.filter(c=>(!needle||`${c.title}\n${c.description??''}`.toLocaleLowerCase('de').includes(needle)) && (a.status==='all'||(a.status==='done')===Boolean(c.done)) && (!a.labelId||array(c.labels??[]).some(l=>l.id===a.labelId)) && (!a.assignee||array(c.assignedUsers??[]).some(u=>assignedUid(u)===a.assignee)));
  return {boardId:a.boardId,archive:a.archive,snapshot,total:filtered.length,offset:a.offset,cards:filtered.slice(a.offset,a.offset+a.limit),nextOffset:a.offset+a.limit<filtered.length?a.offset+a.limit:null,consistency:'Mehrere native Lesezugriffe; kein atomarer Board-Snapshot. Snapshot schützt Folgeseiten vor erkannten Änderungen.'};
}
async function account(expected:string) { if((await nextcloudIdentity()).uid!==expected)throw new Error('Kontowechsel: Änderung gestoppt.'); }
async function writable(board:any,permission:string) {
  if(board.archived||board.deletedAt||board.permissions?.[permission]!==true)throw new Error('Board archiviert oder native Berechtigung fehlt.');
}
export async function savePlanningLabel(a:{boardId:number;labelId?:number;title:string;color:string;expectedBoardVersion:string;expectedAccount:string}) {
  await account(a.expectedAccount);
  const before=await readPlanningBoard(a.boardId);await writable(before.board,'PERMISSION_MANAGE');
  if(before.version!==a.expectedBoardVersion)throw new Error('Board verändert: neu lesen.');
  const labels=array(before.board.labels??[]);
  if(a.labelId&&!labels.some(l=>l.id===a.labelId))throw new Error('Label gehört nicht zum Board.');
  if(labels.some(l=>l.id!==a.labelId&&l.title.toLocaleLowerCase('de')===a.title.toLocaleLowerCase('de')))throw new Error('Labeltitel bereits vorhanden. Vorhandene ID verwenden.');
  await request(`${boardPath(a.boardId)}/labels${a.labelId?'/'+a.labelId:''}`,a.labelId?'PUT':'POST',{title:a.title,color:a.color});
  let after;try { after=await readPlanningBoard(a.boardId); }catch { return {outcome:'unknown',boardId:a.boardId,note:'Labeländerung gesendet; Rücklesen fehlgeschlagen. Nicht automatisch wiederholen.'}; }
  const label=array(after.board.labels??[]).find(l=>a.labelId?l.id===a.labelId:l.title===a.title);
  return {outcome:label?.title===a.title&&label?.color?.toUpperCase()===a.color.toUpperCase()?'verified':'unknown',label:label??null,boardVersion:after.version,atomic:false,note:'Native Deck-API bietet hier keine atomare Versionsbedingung. Bei unknown nicht automatisch wiederholen.'};
}
export async function setPlanningCardRelation(a:{boardId:number;stackId:number;cardId:number;expectedVersion:string;expectedBoardVersion:string;expectedAccount:string;present:boolean;labelId?:number;userId?:string}) {
  await account(a.expectedAccount);
  const {board,version}=await readPlanningBoard(a.boardId);await writable(board,'PERMISSION_EDIT');
  const before=await readPlanningCard(a.boardId,a.stackId,a.cardId);
  if(version!==a.expectedBoardVersion||before.boardVersion!==version||before.version!==a.expectedVersion)throw new Error('Board oder Karte verändert: neu lesen.');
  if(before.card.archived)throw new Error('Archivierte Karte zuerst bewusst wieder aktivieren.');
  const label=a.labelId!==undefined;
  if(label&&!array(board.labels??[]).some(l=>l.id===a.labelId))throw new Error('Label gehört nicht zum Board.');
  const uid=assignedUid;
  if(!label&&!array(board.users??[]).some(u=>(u.uid??u.primaryKey)===a.userId))throw new Error('Benutzer ist kein bestätigtes Board-Mitglied.');
  const field=label?'labels':'assignedUsers',key=(x:any)=>label?x.id:uid(x),target=label?a.labelId:a.userId;
  const previous=array(before.card[field]??[]).map(key);
  if(previous.includes(target)===a.present)return {outcome:'unchanged',...before,atomic:false};
  await request(`${boardPath(a.boardId)}/stacks/${a.stackId}/cards/${a.cardId}/${label?(a.present?'assignLabel':'removeLabel'):(a.present?'assignUser':'unassignUser')}`,'PUT',label?{labelId:a.labelId}:{userId:a.userId});
  let after;try { after=await readPlanningCard(a.boardId,a.stackId,a.cardId); }catch { return {outcome:'unknown',cardId:a.cardId,note:'Zuordnung gesendet; Rücklesen fehlgeschlagen. Nicht automatisch wiederholen.'}; }
  const expected=a.present?[...previous,target]:previous.filter(x=>x!==target);
  const actual=array(after.card[field]??[]).map(key);
  const stable=(c:any)=>Object.fromEntries(['title','description','duedate','done','archived','stackId'].map(k=>[k,c[k]??null]));
  const verified=JSON.stringify([...expected].sort())===JSON.stringify([...actual].sort())&&JSON.stringify(stable(before.card))===JSON.stringify(stable(after.card));
  return {outcome:verified?'verified':'unknown',...after,atomic:false,note:'Deck-Zuordnungen sind nicht atomar versionsbedingt. Native Benachrichtigungen bei Zuständigkeiten sind möglich. Bei unknown nicht automatisch wiederholen.'};
}
