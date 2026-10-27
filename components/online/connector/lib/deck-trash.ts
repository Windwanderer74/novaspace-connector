// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudIdentity} from './nextcloud-read';
import {planningJson,planningVersion} from './planning-json';
import {readPlanningBoard} from './deck-planning';
import {cardMindmapBinding} from './mindmap-workflow-core';
type Ref={boardId:number;stackId:number;cardId?:number;kind:'card'|'stack';action:'delete'|'restore';expectedAccount:string};
const root='/index.php/apps/deck/api/v1.0/boards';
const request=async(path:string,method='GET',body?:unknown)=>(await planningJson(path,method,body));
const same=async(a:unknown,b:unknown)=>await planningVersion(a)===await planningVersion(b);
const pick=(x:any,keys:string[])=>Object.fromEntries(keys.map(k=>[k,x[k]??null]));
const cardFields=['id','stackId','title','description','type','owner','order','duedate','startdate','color','done','archived','labels','assignedUsers'];
const stableCard=(c:any)=>pick(c,cardFields.filter(k=>Object.hasOwn(c,k)));
function id(x:unknown):number{if(!Number.isSafeInteger(x)||Number(x)<1)throw Error('Positive native Kennung erforderlich.');return Number(x);}
function rows(x:any,max=1000):any[]{if(!Array.isArray(x)||x.length>max||x.some(v=>!v||typeof v!=='object'||Array.isArray(v)))throw Error('Nativer Bestand fehlt, ist zu groß oder ungültig.');return x;}
const stackPath=(a:Ref)=>`${root}/${id(a.boardId)}/stacks/${id(a.stackId)}`;
const cardPath=(a:Ref)=>stackPath(a)+`/cards/${id(a.cardId)}`;
function card(c:any,stackId?:number){id(c.id);id(c.stackId);if(stackId!==undefined&&c.stackId!==stackId||typeof c.title!=='string'||!(c.description===null||typeof c.description==='string')||!Number.isSafeInteger(c.deletedAt)||c.deletedAt<0||typeof c.archived!=='boolean')throw Error('Unvollständige oder fremde Kartenkennung.');return c;}
function stack(s:any,boardId:number){id(s.id);if(s.boardId!==boardId||typeof s.title!=='string'||!Number.isSafeInteger(s.order)||!Number.isSafeInteger(s.deletedAt)||s.deletedAt<0)throw Error('Unvollständige oder fremde Liste.');rows(s.cards??[]).forEach(c=>card(c,s.id));return s;}
async function inventory(boardId:number){
 const board=await readPlanningBoard(id(boardId));if(board.board.permissions?.PERMISSION_READ!==true)throw Error('Natives Board-Leserecht erforderlich.');
 const base=`${root}/${boardId}`,active=rows((await request(base+'/stacks')).data,200).map(s=>stack(s,boardId)),archived=rows((await request(base+'/stacks/archived')).data,200).map(s=>stack(s,boardId));
 const deletedStacks=rows((await request(`/index.php/apps/deck/${boardId}/stacks/deleted`)).data,200).map(s=>stack(s,boardId)),deletedCards=rows((await request(`/index.php/apps/deck/${boardId}/cards/deleted`)).data).map(c=>card(c));
 if(active.some(s=>s.deletedAt)||archived.some(s=>s.deletedAt)||deletedStacks.some(s=>!s.deletedAt)||deletedCards.some(c=>!c.deletedAt))throw Error('Native Aktiv-/Papierkorbzuordnung widersprüchlich.');
 if(new Set(active.map(s=>s.id)).size!==active.length||new Set(archived.map(s=>s.id)).size!==archived.length||new Set(deletedStacks.map(s=>s.id)).size!==deletedStacks.length||new Set(deletedCards.map(c=>c.id)).size!==deletedCards.length)throw Error('Doppelte native Kennung.');
 const stackIds=new Set([...active,...deletedStacks].map(s=>s.id)),activeIds=new Set(active.map(s=>s.id));if(stackIds.size!==active.length+deletedStacks.length||archived.some(s=>!activeIds.has(s.id))||deletedCards.some(c=>!stackIds.has(c.stackId)))throw Error('Karte/Liste gehört nicht zum bestätigten Board.');
 const visible=[...active,...archived].flatMap(s=>s.cards??[]);if(visible.length>1000||new Set(visible.map(c=>c.id)).size!==visible.length)throw Error('Mehr als1000 oder doppelte sichtbare Karten.');
 const known=[...visible,...deletedStacks.flatMap(s=>s.cards??[]),...deletedCards];if(known.length>1000||new Set(known.map(c=>c.id)).size!==known.length)throw Error('Mehr als1000 oder doppelte Karten im gesamten bestätigten Bestand.');
 if([...active,...deletedStacks].flatMap(s=>s.cards??[]).some(c=>c.deletedAt||c.archived)||archived.flatMap(s=>s.cards??[]).some(c=>c.deletedAt||!c.archived))throw Error('Native Kartenzustände widersprechen ihrer Übersicht.');
 return {...board,active,archived,deletedStacks,deletedCards};
}
export async function readDeckTrash(a:{boardId:number;kind:'cards'|'stacks';limit:number;offset:number;expectedSnapshot?:string}){
 if(!['cards','stacks'].includes(a.kind))throw Error('Karten oder Listen ausdrücklich wählen.');const account=await nextcloudIdentity(),s=await inventory(a.boardId),items=a.kind==='cards'?s.deletedCards:s.deletedStacks;
 const snapshot=await planningVersion({account:account.uid,boardId:a.boardId,kind:a.kind,boardVersion:s.version,items});if(a.offset>0&&!a.expectedSnapshot||a.expectedSnapshot&&a.expectedSnapshot!==snapshot)throw Error('Papierkorbauswahl verändert oder Seitennachweis fehlt.');
 if((await nextcloudIdentity()).uid!==account.uid)throw Error('Kontowechsel.');
 return {account:account.uid,boardId:a.boardId,kind:a.kind,snapshot,total:items.length,items:await Promise.all(items.slice(a.offset,a.offset+a.limit).map(async item=>({...pick(item,['id','stackId','title','deletedAt','archived','done','duedate']),version:await planningVersion(item),...(a.kind==='stacks'?{visibleActiveChildCount:(item.cards??[]).length,archivedChildrenBeforeObserved:false}:{})}))),nextOffset:a.offset+a.limit<items.length?a.offset+a.limit:null,atomic:false,note:'Nativer Deck-Papierkorb, getrennt von Archiv und Erledigt. Maximal1000Karten/200Listen und2MiB je Antwort. Vollständig endgültig entfernte Objekte erscheinen nicht und lassen sich hier nicht zurückholen. Bei gelöschten Listen zeigt die native Übersicht aktive Kinder, nicht sämtliche archivierten Kinder.'};
}
async function details(a:Ref,c:any){const r=card((await request(cardPath({...a,cardId:c.id}).replace('/api/v1.0/','/api/v1.1/'))).data,a.stackId);if(r.id!==c.id||r.deletedAt)throw Error('Kartendetail verändert oder gelöscht.');return r;}
async function prepare(a:Ref){
 id(a.boardId);id(a.stackId);if(!['card','stack'].includes(a.kind)||!['delete','restore'].includes(a.action)||a.kind==='card'&&!a.cardId||a.kind==='stack'&&a.cardId!==undefined)throw Error('Genau eine Karte oder Liste und delete/restore wählen.');
 const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)throw Error('Kontowechsel.');const s=await inventory(a.boardId),permission=a.kind==='stack'?'PERMISSION_MANAGE':'PERMISSION_EDIT';
 if(s.board.archived||s.board.externalId||s.board.permissions?.[permission]!==true)throw Error('Aktives reguläres Board und native Bearbeitungs-/Verwaltungsrechte erforderlich.');
 const activeStack=s.active.find(x=>x.id===a.stackId),deletedStack=s.deletedStacks.find(x=>x.id===a.stackId);let item:any,children:any[]=[];
 if(a.kind==='card'){
  if(!activeStack)throw Error('Aktive Elternliste erforderlich. Gelöschte Liste zuerst gezielt wiederherstellen.');
  if(a.action==='restore'){item=s.deletedCards.find(c=>c.id===a.cardId&&c.stackId===a.stackId);if(!item)throw Error('Gewählte Karte nicht im nativen Papierkorb.');}
  else{const c=[...s.active,...s.archived].flatMap(x=>x.cards??[]).find(c=>c.id===a.cardId&&c.stackId===a.stackId);if(!c)throw Error('Aktive/archivierte Quellkarte nicht bestätigt.');item=await details(a,c);}
 }else{
  item=a.action==='delete'?activeStack:deletedStack;if(!item)throw Error('Gewählte Liste fehlt im erwarteten Zustand.');
  const candidates:any[]=a.action==='delete'?[...(activeStack.cards??[]),...(s.archived.find(x=>x.id===a.stackId)?.cards??[])]:item.cards??[];
  if(candidates.length>50)throw Error('Liste mit mehr als50 beobachtbaren aktiven/archivierten Kindern: nicht in diesem begrenzten Änderungsweg.');
  for(let i=0;i<candidates.length;i+=5){children.push(...await Promise.all(candidates.slice(i,i+5).map(c=>details(a,c))));if(new TextEncoder().encode(JSON.stringify(children)).length>2*1024*1024)throw Error('Mehr als2MiB beobachteter Listeninhalt.');}
 }
 if(a.kind==='card'&&a.action==='restore'){ownerId(item.owner);if(typeof item.type!=='string'||!Number.isSafeInteger(item.order))throw Error('Native Wiederherstellungsfelder nicht vollständig.');}
 const bound=[...(a.kind==='card'?[item]:children)].filter(c=>cardMindmapBinding(c.description??''));
 const data={account:a.expectedAccount,ref:pick(a,['boardId','stackId','cardId','kind','action']),boardVersion:s.version,item,children,deletedSiblings:s.deletedCards.filter(c=>c.stackId===a.stackId)};
 if((await nextcloudIdentity()).uid!==a.expectedAccount||(await readPlanningBoard(a.boardId)).version!==s.version)throw Error('Konto oder Boardrechte während Vorschau verändert.');
 return {s,item,children,bound,version:await planningVersion(data)};
}
export async function prepareDeckTrash(a:Ref){const p=await prepare(a);return {account:a.expectedAccount,boardId:a.boardId,stackId:a.stackId,cardId:a.cardId??null,kind:a.kind,action:a.action,title:p.item.title,deletedAt:p.item.deletedAt,archived:p.item.archived??null,done:p.item.done??null,version:p.version,ready:true,observedChildren:p.children.map(c=>pick(c,['id','title','archived','done'])),boundMindmapCardIds:p.bound.map(c=>c.id),allArchivedChildrenBeforeObserved:a.kind==='card'||a.action==='delete',atomic:false,note:'Nur Vorschau. Löschen setzt nativen deletedAt, kein Erledigen/Archivieren. Listenlöschung blendet die ganze Liste samt Kindern aus; sie setzt Kinder nicht einzeln auf gelöscht. Wiederherstellen erhält Erledigt-/Archivzustände; einzeln gelöschte Kinder bleiben separat gelöscht. Mindmapblöcke bleiben ausdrücklich letzter historischer Stand, kein automatischer Abgleich/Erledigtstatus. Gelöschte Listen zeigen nicht alle archivierten Kinder in der Voransicht. Native spätere endgültige Bereinigung möglich, kein garantierter Rückweg oder feste Aufbewahrungsfrist. Dateiinhalte werden nicht unabhängig geprüft; native Anhangs-/Freigabefolgen beachten.'};}
function ownerId(owner:any){if(owner?.uid&&owner?.primaryKey&&owner.uid!==owner.primaryKey)throw Error('Widersprüchlicher nativer Karteneigentümer.');const value=typeof owner==='string'?owner:owner?.uid??owner?.primaryKey;if(typeof value!=='string'||!value)throw Error('Nativer Karteneigentümer nicht eindeutig.');return value;}
function others(s:Awaited<ReturnType<typeof inventory>>,a:Ref){const clean=(items:any[])=>items.filter(x=>a.kind!=='stack'||x.id!==a.stackId).map(x=>({...pick(x,['id','boardId','title','order','deletedAt']),cards:(x.cards??[]).filter((c:any)=>a.kind!=='card'||c.id!==a.cardId).map(stableCard)}));return {active:clean(s.active),archived:clean(s.archived),deletedStacks:clean(s.deletedStacks),deletedCards:s.deletedCards.filter(c=>a.kind==='stack'?c.stackId!==a.stackId:c.id!==a.cardId).map(stableCard)};}
export async function changeDeckTrash(a:Ref&{expectedVersion:string;acknowledgeTrashLifecycle:true;acknowledgeMindmapSnapshot?:true}){
 if(a.acknowledgeTrashLifecycle!==true)throw Error('Native Papierkorbfolgen ausdrücklich bestätigen.');const p=await prepare(a);
 if((p.bound.length||a.kind==='stack')&&a.acknowledgeMindmapSnapshot!==true)throw Error('Bei Listen oder verknüpften Karten bleiben Mindmaps historischer Stand; ausdrücklich bestätigen, keine stille Fortschrittsänderung.');
 if(p.version!==a.expectedVersion||(await prepare(a)).version!==p.version)throw Error('Gewählte Karte/Liste oder Umfang verändert. Neu vorschauen.');
 let body:object|undefined;if(a.action==='restore')body=a.kind==='stack'?{title:p.item.title,order:p.item.order}:{title:p.item.title,description:p.item.description??'',type:p.item.type??'plain',owner:ownerId(p.item.owner),order:p.item.order??999,duedate:p.item.duedate??null,startdate:p.item.startdate??null,...(Object.hasOwn(p.item,'color')?{color:p.item.color}:{}),...(Object.hasOwn(p.item,'done')?{done:p.item.done}:{} )};
 let status:number|null=null,accepted=false;try{const r=await request(a.kind==='card'?cardPath(a):stackPath(a),a.action==='delete'?'DELETE':'PUT',body);status=r.status;accepted=status===200;}catch{}
 try{
  const after=await inventory(a.boardId);let target:any;
  if(a.kind==='card')target=a.action==='delete'?after.deletedCards.find(c=>c.id===a.cardId&&c.stackId===a.stackId):await details(a,p.item);
  else target=(a.action==='delete'?after.deletedStacks:after.active).find(s=>s.id===a.stackId);
  const stateMatches=!!target&&(a.action==='delete'?target.deletedAt>0:target.deletedAt===0);
  const contentsMatch=!!target&&await same(a.kind==='card'?stableCard(p.item):pick(p.item,['id','boardId','title','order']),a.kind==='card'?pick(target,Object.keys(stableCard(p.item))):pick(target,['id','boardId','title','order']));
  let childrenVerified=true;for(let i=0;i<p.children.length;i+=5){const checked=await Promise.all(p.children.slice(i,i+5).map(c=>details(a,c)));for(let j=0;j<checked.length;j++)if(!await same(stableCard(p.children[i+j]),stableCard(checked[j])))childrenVerified=false;}
  const othersPreserved=await same(others(p.s,a),others(after,a)),accountVerified=(await nextcloudIdentity()).uid===a.expectedAccount,boardVerified=after.version===p.s.version;
  const verified=accepted&&stateMatches&&contentsMatch&&childrenVerified&&othersPreserved&&accountVerified&&boardVerified;
  return {outcome:verified?'verified':'unknown',verified,boardId:a.boardId,stackId:a.stackId,cardId:a.cardId??null,kind:a.kind,action:a.action,writeStatus:status,stateMatches,contentsMatch,observedChildrenVerified:childrenVerified,allArchivedChildrenBeforeObserved:a.kind==='card'||a.action==='delete',othersPreserved,accountVerified,boardVerified,mindmapAutomaticSync:false,boundMindmapCardIds:p.bound.map(c=>c.id),fileApiCalled:false,filesIndependentlyVerified:false,attachmentContentsChecked:false,atomic:false,note:'Ein nativer DELETE oder Wiederherstellungs-PUT nach zweifacher Vorschau. Karten-/Listenstatus und beobachtete Felder/Kinder geprüft; ursprüngliche Archiv-/Erledigtzustände erhalten. Bei Listenrestore waren archivierte Kinder vorher nicht vollständig sichtbar. Dateiinhalt nicht gelesen oder verändert; native spätere Bereinigung kann Zuordnungen endgültig entfernen. Mindmap bleibt historischer Snapshot, kein erledigt/archiviert-Folgeschritt. Bei unknown diese Kennungen lesen, nicht wiederholen, neu anlegen oder automatisch bereinigen.'};
 }catch{return {outcome:'unknown',verified:false,boardId:a.boardId,stackId:a.stackId,cardId:a.cardId??null,kind:a.kind,action:a.action,writeStatus:status,atomic:false,note:'Schreibergebnis nicht vollständig bestätigt. Bekannte Quelle/Papierkorb lesen, nicht wiederholen oder Ersatz anlegen.'};}
}
