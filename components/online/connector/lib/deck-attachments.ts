// SPDX-License-Identifier: AGPL-3.0-or-later
import { readPlanningBoard, readPlanningCard } from './deck-planning';
import { planningJson, planningVersion } from './planning-json';
import { nextcloudIdentity, fileMetadata } from './nextcloud-read';
import { checkedFilePath, checkedEtag } from './files-organize';
import { createDeckFileShare } from './files-shares';

type Ref = { boardId:number; stackId:number; cardId:number };
type Guard = Ref & { expectedAccount:string; expectedVersion:string; expectedBoardVersion:string; expectedAttachmentsVersion:string };
const path = (a:Ref) => `/index.php/apps/deck/api/v1.1/boards/${a.boardId}/stacks/${a.stackId}/cards/${a.cardId}/attachments`;
function id(v:any):string { const s=String(v); if(!/^[1-9][0-9]*$/.test(s)||!Number.isSafeInteger(Number(s)))throw new Error('Ungültige Anhangskennung.');return s; }
const note='Native Deck-Freigabe ohne atomare Versionsbedingung. Bei unklarem Ergebnis Anhänge und Quelle neu lesen, nicht automatisch wiederholen.';
const stableCard=(c:any)=>Object.fromEntries(['id','stackId','title','description','duedate','done','archived','labels','assignedUsers'].map(k=>[k,c[k]??null]));
export async function listDeckAttachments(a:Ref) {
  const card=await readPlanningCard(a.boardId,a.stackId,a.cardId);
  const raw=(await planningJson(path(a))).data;
  if(!Array.isArray(raw)||raw.length>200)throw new Error('Mehr als200 Anhänge oder ungültige Anhangsübersicht.');
  const keys=new Set<string>();
  const attachments=await Promise.all(raw.map(async(v:any)=>{
    if(!v||typeof v!=='object'||Number(id(v.cardId))!==a.cardId||typeof v.type!=='string'||typeof v.data!=='string'||!Number.isSafeInteger(v.deletedAt)||v.deletedAt<0)throw new Error('Ungültige Anhangszuordnung.');
    const key=v.type+':'+id(v.id);if(keys.has(key))throw new Error('Doppelte Anhangskennung.');keys.add(key);
    if(v.type==='file'&&v.extendedData){id(v.extendedData.fileid);if(typeof v.extendedData.path!=='string')throw new Error('Unvollständiger Dateiverweis.');checkedFilePath(v.extendedData.path.startsWith('/')?v.extendedData.path:'/'+v.extendedData.path);}
    return {...v,...(v.type==='file'&&v.extendedData?{extendedData:{...v.extendedData,path:v.extendedData.path.startsWith('/')?v.extendedData.path:'/'+v.extendedData.path}}:{}),id:Number(id(v.id)),cardId:Number(id(v.cardId)),version:await planningVersion(v)};
  }));
  attachments.sort((a,b)=>`${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
  return {...card,attachments,snapshot:await planningVersion(attachments),note:'API1.1 enthält moderne file-Freigaben und alten deck_file-Bestand. Anhangs-ID und Datei-ID sind verschieden. Metadaten sind Quelldaten; Dateiinhalt erst nach gesonderter Rechte-/Versionsprüfung lesen.'};
}
async function source(expectedAccount:string|undefined,sourcePath:string,fileId:string,etag?:string) {
  checkedFilePath(sourcePath);id(fileId);if(etag!==undefined)checkedEtag(etag);
  const account=await nextcloudIdentity();if(expectedAccount!==undefined&&account.uid!==expectedAccount)throw new Error('Kontowechsel: Dateiverknüpfung gestoppt.');
  const file=await fileMetadata(account,sourcePath);
  if(!file||file.type!=='file'||file.fileId!==fileId||(etag!==undefined&&file.etag!==etag)||!file.permissions.includes('G'))throw new Error('Dateiidentität, Leserecht oder Version nicht bestätigt.');
  return {account,file,path:sourcePath};
}
function selected(attachments:any[],attachmentId:number) {
  const item=attachments.find(v=>v.type==='file'&&v.id===attachmentId&&!v.deletedAt);
  if(!item?.extendedData)throw new Error('Kein aktiver moderner Dateianhang mit auflösbarem Dateiverweis. Alten deck_file-Bestand nicht als file behandeln.');
  return item;
}
export async function resolveDeckAttachment(a:Ref&{attachmentId:number}) {
  const before=await listDeckAttachments(a),attachment=selected(before.attachments,a.attachmentId);
  const c=await source(undefined,attachment.extendedData.path,id(attachment.extendedData.fileid));
  const after=await listDeckAttachments(a),file=await fileMetadata(c.account,c.path);
  if(after.snapshot!==before.snapshot||after.version!==before.version||!file||file.fileId!==c.file.fileId||file.etag!==c.file.etag)throw new Error('Anhang oder Quelldatei während Auflösung verändert. Neu lesen.');
  return {account:c.account.uid,...a,path:c.path,...file,attachmentVersion:attachment.version,versionVerified:true,note:'Geprüfter Originaldateiverweis. Für Inhalt vorhandene files_read_text/files_read_pdf/files_read_image verwenden; deren zusätzliche Rechte und Grenzen gelten. Keine neue Freigabe oder Kopie.'};
}
async function guarded(a:Guard) {
  const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)throw new Error('Kontowechsel: Änderung gestoppt.');
  const before=await listDeckAttachments(a),board=await readPlanningBoard(a.boardId);
  if(board.board.archived||board.board.permissions?.PERMISSION_EDIT!==true||before.card.archived||before.version!==a.expectedVersion||before.boardVersion!==a.expectedBoardVersion||board.version!==a.expectedBoardVersion||before.snapshot!==a.expectedAttachmentsVersion)throw new Error('Karte, Board/Freigabegruppe oder Anhänge verändert bzw. nicht bearbeitbar. Neu lesen.');
  return {account,before};
}
export async function attachDeckFile(a:Guard&{sourcePath:string;fileId:string;etag:string;acknowledgeBoardAccess:true}) {
  if(a.acknowledgeBoardAccess!==true)throw new Error('Dateifreigabe für Kartenleser muss ausdrücklich beauftragt sein.');
  const {before}=await guarded(a),c=await source(a.expectedAccount,a.sourcePath,a.fileId,a.etag);
  if(before.attachments.length>=200)throw new Error('Anhangsgrenze erreicht. Keine weitere Freigabe.');
  if(c.file.downloadDenied||!c.file.permissions.includes('R'))throw new Error('Quelle darf nicht weitergegeben werden oder Download ist gesperrt.');
  if(before.attachments.some(v=>v.type==='file'&&String(v.extendedData?.fileid)===a.fileId&&!v.deletedAt))throw new Error('Datei bereits mit dieser Karte verknüpft. Nicht erneut freigeben.');
  await guarded(a); // Recheck current native audience immediately before POST.
  const last=await fileMetadata(c.account,c.path);if(!last||last.fileId!==a.fileId||last.etag!==a.etag||last.downloadDenied||!last.permissions.includes('R')||!last.permissions.includes('G'))throw new Error('Quelldatei oder Weitergaberecht inzwischen verändert.');
  let share:any;
  try {share=await createDeckFileShare(c.path,a.cardId);}catch{return {outcome:'unknown',cardId:a.cardId,fileId:a.fileId,note};}
  const shareId=share&&/^[1-9][0-9]*$/.test(String(share.id))?Number(share.id):null;
  try {
    const after=await listDeckAttachments(a),file=await fileMetadata(c.account,c.path),item=after.attachments.find(v=>v.type==='file'&&v.id===shareId&&!v.deletedAt);
    const rest=(xs:any[])=>xs.filter(v=>!(v.type==='file'&&v.id===shareId));
    const verified=shareId!==null&&Number(share.share_type)===12&&String(share.share_with)===String(a.cardId)&&Number(share.permissions)===1&&String(share.file_source??share.item_source)===a.fileId&&item?.extendedData?.fileid!==undefined&&String(item.extendedData.fileid)===a.fileId&&item.extendedData.permissions===1&&file?.fileId===a.fileId&&file.etag===a.etag&&after.boardVersion===before.boardVersion&&await planningVersion(stableCard(after.card))===await planningVersion(stableCard(before.card))&&await planningVersion(rest(after.attachments))===await planningVersion(before.attachments);
    return {outcome:verified?'verified':'unknown',attachmentId:shareId,fileId:a.fileId,sourcePath:c.path,...after,sourcePreserved:file?.fileId===a.fileId&&file.etag===a.etag,nativeShareType:12,permission:1,emailRequested:false,atomic:false,note:note+' Die bestehende Datei ist für aktuelle und spätere berechtigte Kartenleser freigegeben; native Benachrichtigungen sind möglich.'};
  }catch{return {outcome:'unknown',attachmentId:shareId,cardId:a.cardId,fileId:a.fileId,note};}
}
export async function detachDeckFile(a:Guard&{attachmentId:number;expectedAttachmentVersion:string}) {
  const {account,before}=await guarded(a),attachment=selected(before.attachments,a.attachmentId);
  if(attachment.version!==a.expectedAttachmentVersion)throw new Error('Anhang verändert: neu lesen.');
  const c=await source(a.expectedAccount,attachment.extendedData.path,id(attachment.extendedData.fileid));
  await guarded(a);
  try {await planningJson(path(a)+'/'+a.attachmentId+'?type=file','DELETE');}catch{return {outcome:'unknown',cardId:a.cardId,attachmentId:a.attachmentId,note};}
  try {
    const after=await listDeckAttachments(a),file=await fileMetadata(account,c.path);
    const expected=before.attachments.filter(v=>!(v.type==='file'&&v.id===a.attachmentId));
    const removed=!after.attachments.some(v=>v.type==='file'&&v.id===a.attachmentId&&!v.deletedAt);
    const preserved=file?.fileId===c.file.fileId&&file.etag===c.file.etag;
    const verified=removed&&preserved&&after.boardVersion===before.boardVersion&&await planningVersion(expected)===await planningVersion(after.attachments)&&await planningVersion(stableCard(after.card))===await planningVersion(stableCard(before.card));
    return {outcome:verified?'verified':'unknown',...after,attachmentRemoved:removed,sourcePreserved:preserved,sourcePath:c.path,fileId:c.file.fileId,atomic:false,note:note+' Nur die native file-Freigabe wird entfernt. Die Originaldatei bleibt nativ bestehen; entfällt dadurch der eigene Zugriff, ist ihre unabhängige Rückprüfung nicht bestätigt.'};
  }catch{return {outcome:'unknown',cardId:a.cardId,attachmentId:a.attachmentId,note};}
}
