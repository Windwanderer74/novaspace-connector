// SPDX-License-Identifier: AGPL-3.0-or-later
import { readNote } from './notes';
import { nextcloudIdentity, fileMetadata, listFiles } from './nextcloud-read';
import { checkedFilePath } from './files-organize';
import { planningJson, planningVersion } from './planning-json';
import { readVerifiedImage } from './attachment-files';
type Ref={id:number;path?:string};
export async function resolveNoteSnapshot(a:Ref) {
  const account=await nextcloudIdentity(),note=(await readNote(a.id)).note;
  let path=a.path??note.internalPath;if(typeof path!=='string')throw new Error('Notiz liefert keinen Dateipfad. Gewählten Pfad zuerst mit Dateisuche/files_stat ermitteln und ausdrücklich angeben.');
  if(!path.startsWith('/'))path='/'+path;checkedFilePath(path);
  const file=await fileMetadata(account,path);
  if(!file||file.type!=='file'||file.fileId!==String(a.id)||!file.permissions.includes('G'))throw new Error('Dateipfad gehört nicht zur gewählten nativen Notiz oder ist nicht lesbar.');
  const after=(await readNote(a.id)).note,meta=await fileMetadata(account,path);
  if(after.etag!==note.etag||!meta||meta.fileId!==file.fileId||meta.etag!==file.etag)throw new Error('Notiz oder Dateipfad während Auflösung verändert.');
  return {account,note,path,file:meta};
}
export async function resolveNoteFile(a:Ref) {
  const c=await resolveNoteSnapshot(a);return {account:c.account.uid,noteId:a.id,noteEtag:c.note.etag,path:c.path,...c.file,versionVerified:true,note:'Native Notes-ID ist die Datei-ID. Geprüften Originalpfad für vorhandene Datei-/Kopier-/Freigabewerkzeuge verwenden; deren eigene Rechte gelten. Keine Dateinamensableitung aus dem bereinigten Notiztitel.'};
}
export async function listNoteAttachments(a:Ref) {
  const c=await resolveNoteSnapshot(a),folder=c.path.slice(0,c.path.lastIndexOf('/'))+'/.attachments.'+a.id;
  const meta=await fileMetadata(c.account,folder);let entries:any[]=[];
  if(meta){if(meta.type!=='folder')throw new Error('Privater Notiz-Anhangspfad ist kein Ordner.');const list=await listFiles(folder);if(list.account!==c.account.uid)throw new Error('Kontowechsel während Anhangsübersicht.');entries=list.entries;}
  const after=await resolveNoteSnapshot({id:a.id,path:c.path});if(after.note.etag!==c.note.etag||after.file.etag!==c.file.etag)throw new Error('Notiz während Anhangsübersicht verändert.');
  entries.sort((a,b)=>a.path.localeCompare(b.path));
  return {account:c.account.uid,noteId:a.id,noteEtag:c.note.etag,notePath:c.path,noteFileEtag:c.file.etag,folder,attachments:entries,snapshot:await planningVersion({id:a.id,noteEtag:c.note.etag,noteFileEtag:c.file.etag,entries}),note:'Nur eigener .attachments.<Notiz-ID>-Ordner, maximal200 Einträge. Alte flache Bildverweise sind im Notiztext erhalten, werden hier nicht durch Lesen der ganzen Kategorie eingesammelt. Für Inhalte vorhandene Dateileser und frische files_stat-Metadaten verwenden.'};
}
export async function attachNoteImage(a:Ref&{expectedAccount:string;expectedNoteEtag:string;expectedAttachmentsVersion:string;sourcePath:string;fileId:string;etag:string;fileName?:string}) {
  const c=await resolveNoteSnapshot(a);if(c.account.uid!==a.expectedAccount)throw new Error('Kontowechsel: Bildanlage gestoppt.');
  if(c.note.readonly||!c.file.permissions.includes('W')||c.note.etag!==a.expectedNoteEtag)throw new Error('Notiz verändert oder schreibgeschützt.');
  const settings=await planningJson('/index.php/apps/notes/api/v1.4/settings');
  if(!settings.headers.get('X-Notes-API-Versions')?.split(',').some(v=>/^1\.(\d+)$/.test(v.trim())&&Number(v.trim().split('.')[1])>=4))throw new Error('Notes-Anhangs-API1.4 nicht bestätigt.');
  const before=await listNoteAttachments({id:a.id,path:c.path});
  if(before.snapshot!==a.expectedAttachmentsVersion||before.attachments.length>=200)throw new Error('Notiz-Anhangsbestand verändert oder Grenze erreicht. Neu lesen.');
  const image=await readVerifiedImage(c.account,a.sourcePath,a.fileId,a.etag);
  const name=a.fileName??a.sourcePath.slice(a.sourcePath.lastIndexOf('/')+1);
  if(!name||/[\/\\\x00-\x1f\x7f]/.test(name)||new TextEncoder().encode(name).length>255||!(({ 'image/png':/\.png$/i,'image/jpeg':/\.jpe?g$/i,'image/gif':/\.gif$/i,'image/webp':/\.webp$/i } as Record<string,RegExp>)[image.mimeType]!.test(name)))throw new Error('Einzelner Bilddateiname mit passender Endung erforderlich.');
  if(before.attachments.some(v=>v.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de')))throw new Error('Bildname bereits vorhanden. Nach unklarem Upload nicht automatisch wiederholen.');
  const last=await listNoteAttachments({id:a.id,path:c.path});if(last.snapshot!==before.snapshot)throw new Error('Notiz oder Anhänge inzwischen verändert.');
  const form=new FormData();form.append('file',new Blob([image.bytes.buffer as ArrayBuffer],{type:image.mimeType}),name);
  let filename:string|undefined;
  try{const written=await planningJson('/index.php/apps/notes/api/v1.4/attachment/'+a.id,'POST',form);filename=written.data?.filename;if(typeof filename!=='string')throw Error();}
  catch{return {outcome:'unknown',noteId:a.id,note:'Bilderzeugung nicht bestätigt. Notiz-Anhangsordner lesen; nicht automatisch erneut hochladen.'};}
  try{
    const prefix='.attachments.'+a.id+'/';if(!filename.startsWith(prefix))throw Error('Fremder Anhangspfad.');
    const base=filename.slice(prefix.length);if(!base||base==='.'||base==='..'||/[\/\\\x00-\x1f\x7f]/.test(base))throw Error('Ungültiger Anhangspfad.');
    const target=c.path.slice(0,c.path.lastIndexOf('/'))+'/'+filename,targetMeta=await fileMetadata(c.account,target);
    if(!targetMeta||targetMeta.fileId===a.fileId||targetMeta.fileId===String(a.id)||before.attachments.some(v=>v.fileId===targetMeta.fileId))throw Error('Keine neue Bilddatei bestätigt.');
    const copied=await readVerifiedImage(c.account,target,targetMeta.fileId,targetMeta.etag),after=await listNoteAttachments({id:a.id,path:c.path});
    const remaining=after.attachments.filter(v=>v.fileId!==targetMeta.fileId);
    const listed=after.attachments.some(v=>v.fileId===targetMeta.fileId&&v.path===target&&v.etag===targetMeta.etag);
    const verified=listed&&copied.sha256===image.sha256&&after.noteEtag===a.expectedNoteEtag&&after.noteFileEtag===c.file.etag&&await planningVersion(remaining)===await planningVersion(before.attachments);
    const sourceNow=await fileMetadata(c.account,a.sourcePath);const sourcePreserved=sourceNow?.fileId===a.fileId&&sourceNow.etag===a.etag;
    return {outcome:verified&&sourcePreserved?'verified':'unknown',account:c.account.uid,noteId:a.id,filename,path:target,...targetMeta,sha256:copied.sha256,sourcePreserved,noteContentChanged:false,markdown:`![Bild](<${filename.split('/').map(encodeURIComponent).join('/')}>)`,snapshot:after.snapshot,atomic:false,note:'Bild als native Notizkopie angelegt und Originalbytes verglichen. Notiztext unverändert. Zum sichtbaren Einbinden Notiz frisch lesen und den gewünschten Markdownverweis gezielt mit notes_update ergänzen. Keine automatische Wiederholung oder Bereinigung.'};
  }catch{return {outcome:'unknown',noteId:a.id,filename,note:'Bildantwort erhalten, Rückprüfung nicht bestätigt. Bekannten Anhangspfad und Notiz lesen; nicht erneut hochladen.'};}
}
