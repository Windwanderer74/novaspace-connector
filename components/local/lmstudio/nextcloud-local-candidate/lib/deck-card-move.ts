// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity } from './nextcloud-read';
import { planningJson, planningVersion } from './planning-json';
import { readPlanningBoard, readPlanningCard } from './deck-planning';
import { readDeckMoveComments } from './deck-work';
import { readMindmap } from './mindmap';
import { updateTextFile } from './files-write';
import { locateNode, parseMindmap, serializeMindmap, type Mindmap } from './mindmap-core';
import { cardMindmapBinding, type CardMindmapBinding } from './mindmap-workflow-core';
import { scopePolicyDenial } from './connection-policy';

export type DeckBoardMoveRef = { sourceBoardId:number; sourceStackId:number; targetBoardId:number; targetStackId:number; cardId:number; expectedAccount:string; order?:number };
const root='/index.php/apps/deck/api/v1.1/boards';
const request=async(path:string,method='GET',body?:unknown)=>(await planningJson(path,method,body)).data;
const note='Ein nativer Boardwechsel, keine Kopie. Deck und DAV sind nicht atomar gekoppelt. Bei unknown bekannte Kennungen lesen; bei mindmap.pending nur die Bindung abgleichen, nicht erneut verschieben.';
const pick=(o:any,keys:string[]):Record<string,any>=>Object.fromEntries(keys.map(k=>[k,o[k]??null]));
function rows(x:any,max=5000):any[]{if(!Array.isArray(x)||x.length>max)throw Error('Unvollständiger oder zu großer Deck-Bestand.');return x;}
function id(x:any):number{if(!Number.isSafeInteger(x)||x<1)throw Error('Ungültige Deck-Kennung.');return x;}
function uid(x:any):string{if(typeof x==='string'&&x)return x;if(!x||typeof x!=='object'||x.uid&&x.primaryKey&&x.uid!==x.primaryKey)throw Error('Uneindeutige Benutzerkennung.');const v=x.uid??x.primaryKey;if(typeof v!=='string'||!v)throw Error('Benutzerkennung fehlt.');return v;}
const same=async(a:unknown,b:unknown)=>await planningVersion(a)===await planningVersion(b);
function validateRef(a:DeckBoardMoveRef){[a.sourceBoardId,a.sourceStackId,a.targetBoardId,a.targetStackId,a.cardId].forEach(id);if(!a.expectedAccount||a.sourceBoardId===a.targetBoardId||a.sourceStackId===a.targetStackId||a.order!==undefined&&(!Number.isSafeInteger(a.order)||a.order<0||a.order>2147483647))throw Error('Verschiedene Quell-/Zielboards mit gültigen Listen und Konto wählen.');}
async function account(expected:string){if((await nextcloudIdentity()).uid!==expected)throw Error('Kontowechsel: Boardwechsel gestoppt.');}
function files(scopes:string[],write:boolean){for(const s of write?['files:read','files:write']:['files:read'])if(!scopes.includes(s)||scopePolicyDenial(s))throw Error(`Für die gebundene Mindmap fehlt ${s}. Keine Kartenverschiebung.`);}
function writable(b:any){if(b.archived||b.deletedAt||b.externalId||b.permissions?.PERMISSION_READ!==true||b.permissions?.PERMISSION_EDIT!==true)throw Error('Aktives lokales Board mit Lese-/Bearbeitungsrecht erforderlich.');}
const boardAccess=(b:any)=>pick(b,['id','title','color','archived','deletedAt','externalId','owner','acl','users','permissions']);
function labelSignatures(labels:any){return rows(labels??[]).map(l=>{id(l.id);if(typeof l.title!=='string'||typeof l.color!=='string')throw Error('Unvollständiges Schlagwort.');return `${l.title}\u0000${l.color.toUpperCase()}`;}).sort();}
function assignments(users:any){return rows(users??[]).map(u=>`${u.type??u.participant?.type??0}:${uid(u.participant??u)}`).sort();}
function date(x:any){if(x==null)return null;if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw Error('Ungültiger Kartenzeitpunkt.');return Math.floor(Date.parse(x)/1000);}
function stableCard(c:any){return {...pick(c,['id','title','description','type','archived','deletedAt','color','createdAt']),owner:uid(c.owner),done:date(c.done),duedate:date(c.duedate),startdate:date(c.startdate),labels:labelSignatures(c.labels),assignedUsers:assignments(c.assignedUsers)};}
async function stacks(boardId:number){const r=rows(await request(`${root}/${boardId}/stacks`),200);if(new Set(r.map(s=>s.id)).size!==r.length||r.some(s=>!Number.isSafeInteger(s.id)||s.boardId!==boardId))throw Error('Fremde oder doppelte Listenkennung.');return r;}
async function detail(boardId:number,stackId:number,cardId:number){const c=await request(`${root}/${boardId}/stacks/${stackId}/cards/${cardId}`);if(!c||c.id!==cardId||c.stackId!==stackId||c.deletedAt||typeof c.title!=='string'||!(c.description===null||typeof c.description==='string')||typeof c.type!=='string'||typeof c.archived!=='boolean'||!Object.hasOwn(c,'done')||!Object.hasOwn(c,'duedate')||!Number.isSafeInteger(c.order))throw Error('Vollständige aktuelle Kartenposition nicht bestätigt.');stableCard(c);return c;}
async function attachments(boardId:number,stackId:number,cardId:number){
 const seen=new Set<string>();
 return rows(await request(`${root}/${boardId}/stacks/${stackId}/cards/${cardId}/attachments`),200).map(v=>{
  const nativeId=(x:any)=>id(typeof x==='string'&&/^[1-9][0-9]*$/.test(x)?Number(x):x);
  if(!v||nativeId(v.cardId)!==cardId||typeof v.type!=='string'||typeof v.data!=='string'||!Number.isSafeInteger(v.deletedAt)||v.deletedAt<0)throw Error('Anhangsidentität nicht bestätigt.');
  const attachmentId=nativeId(v.id),key=v.type+':'+attachmentId;if(seen.has(key))throw Error('Doppelte Anhangskennung.');seen.add(key);
  return {...pick(v,['type','data','deletedAt']),id:attachmentId,cardId,fileId:v.extendedData?.fileid==null?null:String(v.extendedData.fileid)};
 }).sort((a,b)=>`${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}
function labelPlan(card:any,board:any){return rows(card.labels??[]).map(l=>{const matches=rows(board.labels??[]).filter(t=>t.title===l.title);if(matches.length>1||matches.length===1&&matches[0].color?.toUpperCase()!==l.color?.toUpperCase())throw Error('Ziel-Schlagworte mehrdeutig oder farblich abweichend; vorher klären.');if(!matches.length&&board.permissions?.PERMISSION_MANAGE!==true)throw Error('Fehlende Ziel-Schlagworte benötigen nativ Verwaltungsrecht oder vorher passende Ziel-Schlagworte.');return {title:l.title,color:l.color,sourceLabelId:l.id,targetLabelId:matches[0]?.id??null,nativeCreate:!matches.length};});}
function checkAssignees(card:any,board:any){const allowed=new Set<string>([uid(board.owner),...rows(board.users??[]).map(uid),...rows(board.acl??[]).filter(x=>x.type===0).map(x=>uid(x.participant))]);for(const a of rows(card.assignedUsers??[]))if((a.type??a.participant?.type??0)!==0||!allowed.has(uid(a.participant??a)))throw Error('Kartenzuständigkeit im Zielboard nicht eindeutig als leseberechtigter Benutzer bestätigt.');}

/** Only the selected explicit binding changes; IDs, conditions, history and defaults survive. */
export function rebindMovedCardMap(source:Mindmap,binding:CardMindmapBinding,a:DeckBoardMoveRef){
 const map=parseMindmap(serializeMindmap(source)),node=locateNode(map,binding.nodeId).node,sync=node.data.nfDeckSync as any;
 if(!sync||sync.version!==1||sync.cardId!==a.cardId||sync.checklistId!==binding.checklistId||![a.sourceBoardId,a.targetBoardId].includes(sync.boardId))throw Error('Mindmap bestätigt die ausgewählte Kartenbindung nicht.');
 let matches=0;function visit(n:any){if(n.data.nfDeckSync?.cardId===a.cardId)matches++;(n.children??[]).forEach(visit);}visit(map.root);if(matches!==1)throw Error('Mehrdeutige Kartenbindung in derselben Mindmap.');
 if(typeof node.data.hyperlink!=='string'||!node.data.hyperlink.endsWith(`/index.php/apps/deck/card/${a.cardId}`))throw Error('Mindmap-Kartenlink nicht bestätigt.');
 if(Object.hasOwn(sync,'stackId')&&(!Number.isSafeInteger(sync.stackId)||sync.stackId<1))throw Error('Mindmap-Listenbindung ungültig.');
 // Linked workstep stack IDs record the original creation destination; older
 // within-board moves did not update them. The native card/stack check is current.
 node.data.nfDeckSync={...sync,boardId:a.targetBoardId,...(Object.hasOwn(sync,'stackId')?{stackId:a.targetStackId}:{})};
 const intent=node.data.nfWorkStep as any;
 if(intent!==undefined){if(!intent||intent.version!==1||intent.phase!=='linked'||![a.sourceBoardId,a.targetBoardId].includes(intent.boardId)||!Number.isSafeInteger(intent.stackId)||intent.stackId<1)throw Error('Arbeitsschritt-Zuordnung widersprüchlich oder noch reserviert.');node.data.nfWorkStep={...intent,boardId:a.targetBoardId,stackId:a.targetStackId};}
 return {map,text:serializeMindmap(map),changed:serializeMindmap(map)!==serializeMindmap(source)};
}
async function mapState(card:any,a:DeckBoardMoveRef,scopes:string[],write:boolean){const binding=cardMindmapBinding(card.description??'');if(!binding)return null;files(scopes,write);const map=await readMindmap(binding.path);if(map.fileId!==binding.fileId||!map.versionVerified||write&&!map.permissions?.includes('W'))throw Error('Mindmap-Identität, Version oder Schreibrecht nicht bestätigt.');return {binding,snapshot:map,projected:rebindMovedCardMap(map.mindmap,binding,a)};}
async function preparation(a:DeckBoardMoveRef,scopes:string[],write:boolean){
 validateRef(a);await account(a.expectedAccount);
 const [sourceBoard,targetBoard,sourceStacks,targetStacks]=await Promise.all([readPlanningBoard(a.sourceBoardId),readPlanningBoard(a.targetBoardId),stacks(a.sourceBoardId),stacks(a.targetBoardId)]);
 writable(sourceBoard.board);writable(targetBoard.board);
 if(!sourceStacks.some(s=>s.id===a.sourceStackId&&!s.deletedAt)||!targetStacks.some(s=>s.id===a.targetStackId&&!s.deletedAt))throw Error('Aktive Quell-/Zielliste gehört nicht zum bestätigten Board.');
 const card=await detail(a.sourceBoardId,a.sourceStackId,a.cardId);if(card.archived)throw Error('Archivierte Karte vor Boardwechsel gesondert aktivieren; keine automatische Archivänderung.');
 const labels=labelPlan(card,targetBoard.board);checkAssignees(card,targetBoard.board);
 const [attached,comments,map]=await Promise.all([attachments(a.sourceBoardId,a.sourceStackId,a.cardId),readDeckMoveComments(a.cardId),mapState(card,a,scopes,write)]);
 const sourceAgain=await readPlanningBoard(a.sourceBoardId),targetAgain=await readPlanningBoard(a.targetBoardId),latest=await detail(a.sourceBoardId,a.sourceStackId,a.cardId);await account(a.expectedAccount);
 if(sourceAgain.version!==sourceBoard.version||targetAgain.version!==targetBoard.version||!await same(card,latest))throw Error('Karte oder Boardrechte während Vorbereitung verändert. Neu lesen.');
 const data={ref:a,card,sourceBoard:sourceBoard.board,targetBoard:targetBoard.board,sourceStacks,targetStacks,attached,comments,map:map?{path:map.binding.path,fileId:map.snapshot.fileId,etag:map.snapshot.etag,text:map.snapshot.text}:null};
 return {...data,mapState:map,labels,version:await planningVersion(data)};
}
export async function prepareDeckBoardMove(a:DeckBoardMoveRef,scopes:string[]){const p=await preparation(a,scopes,false);return {ready:true,version:p.version,account:a.expectedAccount,sourceBoardId:a.sourceBoardId,sourceStackId:a.sourceStackId,targetBoardId:a.targetBoardId,targetStackId:a.targetStackId,cardId:a.cardId,title:p.card.title,done:p.card.done,archived:p.card.archived,labels:p.labels,assignedUsers:assignments(p.card.assignedUsers),attachmentCount:p.attached.length,commentCount:p.comments.length,sourceAudience:pick(p.sourceBoard,['owner','acl']),targetAudience:pick(p.targetBoard,['owner','acl']),mindmap:p.map?{...pick(p.map,['path','fileId','etag']),nodeId:p.mapState!.binding.nodeId,boardBindingWillChange:true}:null,githubMappingsUpdated:false,atomic:false,note:'Nur Vorschau. Zielboard-Leser erhalten Karten-/Anhangszugriff. Bestehende GitHub-Zuordnungen separat abgleichen. Archivierte Karten gesondert behandeln. '+note};}
function otherCards(ss:any[],cardId:number){return ss.map(s=>({...pick(s,['id','boardId','title','order','deletedAt']),cards:rows(s.cards??[]).filter(c=>c.id!==cardId).map(c=>pick(c,['id','stackId','title','description','order','archived','done','duedate'])).sort((a,b)=>a.id-b.id)})).sort((a:any,b:any)=>a.id-b.id);}
async function saveBinding(p:NonNullable<Awaited<ReturnType<typeof mapState>>>){await account(p.snapshot.account);if(!p.projected.changed)return {verified:true,unchanged:true,fileId:p.snapshot.fileId,etag:p.snapshot.etag};const w=await updateTextFile(p.binding.path,p.snapshot.etag,p.projected.text,p.binding.fileId);if(!w.verified)throw Error('Mindmap-Rücklesung nicht bestätigt.');return {verified:true,fileId:p.binding.fileId,etag:'etag'in w?w.etag:null};}
export async function moveDeckCardToBoard(a:DeckBoardMoveRef&{expectedVersion:string;acknowledgeTargetBoardAccess:true},scopes:string[]){
 if(a.acknowledgeTargetBoardAccess!==true)throw Error('Zugriff der Zielboard-Leser auf die gewählte Karte muss beauftragt sein.');
 const ref:DeckBoardMoveRef={sourceBoardId:a.sourceBoardId,sourceStackId:a.sourceStackId,targetBoardId:a.targetBoardId,targetStackId:a.targetStackId,cardId:a.cardId,expectedAccount:a.expectedAccount,...(a.order!==undefined?{order:a.order}:{})};
 const before=await preparation(ref,scopes,true);if(before.version!==a.expectedVersion)throw Error('Vorprüfung veraltet. Quelle/Ziel neu prüfen; keine Verschiebung.');
 const again=await preparation(ref,scopes,true);if(again.version!==before.version)throw Error('Karte, Anhänge, Kommentare, Mindmap oder Boards verändert. Keine Verschiebung.');
 // The web route is named cardId but CardController::update requires $id.
 // Supply the same verified ID in JSON; a route placeholder alone is not enough.
 const c=before.card,body={id:a.cardId,...pick(c,['title','description','type','duedate','done','deletedAt']),stackId:a.targetStackId,order:a.order??c.order,owner:uid(c.owner),archived:false,...(Object.hasOwn(c,'startdate')?{startdate:c.startdate}:{}),...(Object.hasOwn(c,'color')?{color:c.color}:{})};
 let writeStatus='accepted';try{await request(`/index.php/apps/deck/cards/${a.cardId}`,'PUT',body);}catch{writeStatus='unknown';}
 const base={cardId:a.cardId,sourceBoardId:a.sourceBoardId,sourceStackId:a.sourceStackId,targetBoardId:a.targetBoardId,targetStackId:a.targetStackId,writeStatus,cardCreated:false,githubMappingsUpdated:false,atomic:false,note};
 try{
  await account(a.expectedAccount);
  const [card,sourceBoard,targetBoard,sourceStacks,targetStacks,attached,comments]=await Promise.all([detail(a.targetBoardId,a.targetStackId,a.cardId),readPlanningBoard(a.sourceBoardId),readPlanningBoard(a.targetBoardId),stacks(a.sourceBoardId),stacks(a.targetBoardId),attachments(a.targetBoardId,a.targetStackId,a.cardId),readDeckMoveComments(a.cardId)]);
  const checks={identityAndFields:await same(stableCard(c),stableCard(card)),order:card.order===body.order,sourceAbsent:!sourceStacks.flatMap(s=>s.cards??[]).some(x=>x.id===a.cardId),targetPresent:targetStacks.some(s=>s.id===a.targetStackId&&rows(s.cards??[]).some(x=>x.id===a.cardId)),sourceAudience:await same(boardAccess(before.sourceBoard),boardAccess(sourceBoard.board)),targetAudience:await same(boardAccess(before.targetBoard),boardAccess(targetBoard.board)),attachments:await same(before.attached,attached),comments:await same(before.comments,comments),otherSourceCards:await same(otherCards(before.sourceStacks,a.cardId),otherCards(sourceStacks,a.cardId)),otherTargetCards:await same(otherCards(before.targetStacks,a.cardId),otherCards(targetStacks,a.cardId))};
  if(Object.values(checks).some(x=>!x))return {...base,outcome:'unknown',verified:false,nativeMoveVerified:false,checks,card,mindmap:{pending:!!before.mapState,verified:false},nextStep:'Position und Abweichungen lesen. Nicht erneut verschieben oder Ersatzkarte anlegen.'};
  if(before.mapState){try{return {...base,outcome:'verified',verified:true,nativeMoveVerified:true,checks,card,mindmap:await saveBinding(before.mapState),attachmentContentsChecked:false};}catch{return {...base,outcome:'pending',verified:false,nativeMoveVerified:true,checks,card,mindmap:{pending:true,verified:false,path:before.mapState.binding.path,fileId:before.mapState.binding.fileId},nextStep:'Karte ist verschoben. Nur deck_reconcile_card_move nach frischem deck_read_card und mindmap_read verwenden; nicht erneut verschieben.'};}}
  return {...base,outcome:'verified',verified:true,nativeMoveVerified:true,checks,card,mindmap:null,attachmentContentsChecked:false};
 }catch{return {...base,outcome:'unknown',verified:false,nativeMoveVerified:false,nextStep:'Bekannte Quell-/Zielboards und dieselbe Kartenkennung lesen; nicht erneut verschieben oder neu anlegen.'};}
}
/** Repairs the explicit map binding only; never sends a Deck mutation. */
export async function reconcileDeckCardMove(a:DeckBoardMoveRef&{expectedCardVersion:string;expectedMapEtag:string;expectedMapFileId:string},scopes:string[]){
 validateRef(a);await account(a.expectedAccount);files(scopes,true);const board=await readPlanningBoard(a.targetBoardId);writable(board.board);
 const current=await readPlanningCard(a.targetBoardId,a.targetStackId,a.cardId);if(current.version!==a.expectedCardVersion)throw Error('Zielkarte inzwischen verändert. Neu lesen.');
 const map=await mapState(current.card,a,scopes,true);if(!map||map.snapshot.etag!==a.expectedMapEtag||map.snapshot.fileId!==a.expectedMapFileId)throw Error('Aktuelle ausdrückliche Mindmap-Bindung/Version nicht bestätigt.');
 const fresh=await readPlanningCard(a.targetBoardId,a.targetStackId,a.cardId);if(fresh.version!==current.version||fresh.boardVersion!==current.boardVersion)throw Error('Zielkarte/Board während Abgleich verändert.');
 try{return {outcome:'verified',verified:true,cardId:a.cardId,deckMutation:false,mindmap:await saveBinding(map),githubMappingsUpdated:false,atomic:false};}catch{return {outcome:'pending',verified:false,cardId:a.cardId,deckMutation:false,mindmap:{pending:true,verified:false},note:'Nur aktuelle Mindmap lesen und Bindungsabgleich vorbereiten. Keine erneute Kartenverschiebung.'};}
}
