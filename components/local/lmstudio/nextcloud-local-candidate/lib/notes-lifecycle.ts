// SPDX-License-Identifier: AGPL-3.0-or-later
import { nextcloudIdentity, fileMetadata, readTextSnapshot } from './nextcloud-read';
import { resolveNoteSnapshot } from './notes-files';
import { readNotePresence, updateNote } from './notes';
import { checkedFilePath, checkedEtag } from './files-organize';
import { createTextFile } from './files-write';
import { inspectOwnedHomeTrash, trashFile } from './files-trash';
import { trashbinCapability } from './nextcloud-talk-read';
import { planningVersion } from './planning-json';

type Ref={id:number;path?:string};
type TreeItem={path:string;fileId:string;etag:string;type:string};
const sameFile=(a:any,b:any):boolean=>Boolean(a&&b&&a.fileId===b.fileId&&a.etag===b.etag&&a.type===b.type);
function tree(data:object[],root:string,folder:boolean){
 const rows=data as TreeItem[],seen=new Set<string>();
 if(!rows.length||rows.length>(folder?201:1))throw new Error('Löschumfang überschreitet die begrenzte Notiz-/Anhangsauswahl.');
 for(const row of rows){checkedFilePath(row.path);checkedEtag(row.etag);if(!/^[1-9][0-9]*$/.test(row.fileId)||seen.has(row.path)||row.path!==root&&(!folder||!row.path.startsWith(root+'/')||row.path.slice(root.length+1).includes('/')||row.type!=='file'))throw new Error('Kein eindeutiger flacher Notiz-Anhangsbestand. Unterordner separat prüfen.');seen.add(row.path);}
 const self=rows.find(r=>r.path===root);if(!self||self.type!==(folder?'folder':'file'))throw new Error('Gewähltes Notizobjekt fehlt im Löschumfang.');
 return rows.toSorted((a,b)=>a.path.localeCompare(b.path));
}
export async function prepareNoteDelete(a:Ref&{includeAttachments:boolean}){
 const c=await resolveNoteSnapshot(a);if(c.note.readonly||!c.file.permissions.includes('W')||!c.file.permissions.includes('D'))throw new Error('Notiz schreibgeschützt oder ohne natives Löschrecht.');
 if(!await trashbinCapability())throw new Error('Aktiver nativer Papierkorb nicht bestätigt. Keine Löschung.');
 checkedEtag(c.file.etag);const noteTree=tree(await inspectOwnedHomeTrash(c.account,c.path,false),c.path,false);
 if(!sameFile(noteTree[0],c.file))throw new Error('Notizidentität oder Version während Eigentumsprüfung verändert.');
 const parentPath=c.path.slice(0,c.path.lastIndexOf('/'))||'/',parent=await fileMetadata(c.account,parentPath);if(!parent||parent.type!=='folder')throw new Error('Notizkategorie nicht bestätigt.');
 const folder=(parentPath==='/'?'':parentPath)+'/.attachments.'+a.id,folderMeta=await fileMetadata(c.account,folder);
 let attachmentTree:TreeItem[]=[];
 if(folderMeta){if(folderMeta.type!=='folder')throw new Error('Anhangspfad ist kein Ordner.');checkedEtag(folderMeta.etag);attachmentTree=tree(await inspectOwnedHomeTrash(c.account,folder,true),folder,true);if(!sameFile(attachmentTree.find(r=>r.path===folder),folderMeta))throw new Error('Anhangsordner verändert.');}
 const last=await resolveNoteSnapshot({id:a.id,path:c.path}),lastFolder=await fileMetadata(c.account,folder);
 if(last.account.uid!==c.account.uid||last.note.etag!==c.note.etag||!sameFile(last.file,c.file)||(folderMeta?!sameFile(folderMeta,lastFolder):lastFolder!==null))throw new Error('Notiz oder Anhangsbestand während Vorprüfung verändert.');
 const data={account:c.account.uid,noteId:a.id,title:c.note.title,category:c.note.category,favorite:c.note.favorite,noteEtag:c.note.etag,notePath:c.path,noteFileId:c.file.fileId,noteFileEtag:c.file.etag,parentPath,parentFileId:parent.fileId,includeAttachments:a.includeAttachments,attachmentFolder:folder,attachmentFolderExists:folderMeta!==null,attachmentTree};
 return {...data,version:await planningVersion(data),ready:!folderMeta||a.includeAttachments,deleteRequests:1+(folderMeta&&a.includeAttachments?1:0),attachmentCount:Math.max(0,attachmentTree.length-1),requiredDeleteScopes:['notes:read','notes:write','files:read','files:trash'],atomic:false,note:folderMeta&&!a.includeAttachments?'Eigener Anhangsordner vorhanden. Vollständigen Umfang prüfen und vor Löschen ausdrücklich includeAttachments=true beauftragen.':'Nur eigene Heimspeicherobjekte mit nativen Löschrechten. Notiz zuerst, ausdrücklich eingeschlossenen eigenen Anhangsordner danach getrennt in den Papierkorb legen. Kategorien und alte flache Bilder bleiben erhalten. Keine atomare Gesamttransaktion oder Aufbewahrungsgarantie.'};
}
export async function deleteNote(a:Ref&{expectedAccount:string;expectedDeletionVersion:string;includeAttachments:boolean}){
 if((await nextcloudIdentity()).uid!==a.expectedAccount)throw new Error('Kontowechsel: Notizlöschung gestoppt.');
 const plan=await prepareNoteDelete(a);if(plan.account!==a.expectedAccount||plan.version!==a.expectedDeletionVersion||!plan.ready)throw new Error('Löschumfang/Version verändert oder Bilder nicht ausdrücklich eingeschlossen. Vorprüfung neu lesen.');
 const operations:any[]=[];let noteTrashed:boolean|null=null,attachmentsTrashed:boolean|null=plan.attachmentFolderExists?null:false;
 const uncertain=(reason:string)=>({outcome:noteTrashed===true?'partial':'unknown',account:a.expectedAccount,noteId:a.id,notePath:plan.notePath,noteTrashed,attachmentsTrashed,operations,atomic:false,reason,note:'Keine automatische Wiederholung oder Bereinigung. Notiz, bekannte Datei-/Anhangspfade und erhaltene Papierkorbbelege lesen; Wiederherstellung gegebenenfalls ausdrücklich je Beleg beauftragen.'});
 try{
  const first=await trashFile({path:plan.notePath,fileId:plan.noteFileId,etag:plan.noteFileEtag,expectedAccount:a.expectedAccount});operations.push({role:'note',...first});
  if(!first.verified)return uncertain('Notiz-Papierkorbaufnahme nicht bestätigt. Anhangsordner nicht angefasst.');noteTrashed=true;
  if((await readNotePresence(a.id)).found)return uncertain('Notizkennung weiterhin vorhanden. Anhangsordner nicht angefasst.');
  if(plan.attachmentFolderExists){
   const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)return uncertain('Konto inzwischen verändert.');
   const current=tree(await inspectOwnedHomeTrash(account,plan.attachmentFolder,true),plan.attachmentFolder,true);
   if(await planningVersion(current)!==await planningVersion(plan.attachmentTree))return uncertain('Anhangsbestand nach Notizlöschung verändert. Ordner erhalten.');
   const folder=plan.attachmentTree.find(r=>r.path===plan.attachmentFolder)!;
   const second=await trashFile({path:folder.path,fileId:folder.fileId,etag:folder.etag,expectedAccount:a.expectedAccount,includeContents:true});operations.push({role:'attachments',...second});
   if(!second.verified)return uncertain('Notiz im Papierkorb, Anhangsaufnahme nicht vollständig bestätigt.');attachmentsTrashed=true;
  }
  const account=await nextcloudIdentity(),source=await fileMetadata(account,plan.notePath),folder=await fileMetadata(account,plan.attachmentFolder),parent=await fileMetadata(account,plan.parentPath),presence=await readNotePresence(a.id);
  if(account.uid!==a.expectedAccount||source!==null||folder!==null||presence.found||parent?.fileId!==plan.parentFileId||parent.type!=='folder')return uncertain('Abschließende Abwesenheits-/Kategorieprüfung nicht vollständig bestätigt.');
  return {outcome:'verified',account:account.uid,noteId:a.id,notePath:plan.notePath,noteTrashed,attachmentsTrashed,operations,categoryPreserved:true,atomic:false,note:'Notiz und gegebenenfalls ausdrücklich eingeschlossener eigener Anhangsordner getrennt im persönlichen Papierkorb bestätigt; native Notizkennung fehlt. Kategorien und alte flache Bilddateien erhalten. Keine atomare Gesamttransaktion, vollständige Inhalts-/Wiederherstellungsprüfung oder Aufbewahrungsgarantie.'};
 }catch{return uncertain('Schreibantwort oder Rückprüfung unklar; weitere Schritte gestoppt.');}
}
function textPath(path:string){checkedFilePath(path);if(!/\.(md|txt)$/i.test(path))throw new Error('Gewählte UTF-8-Datei mit .md oder .txt erforderlich.');return path;}
function metadata(note:any){const {content,...rest}=note;return rest;}
export async function exportNoteText(a:Ref&{expectedAccount:string;expectedNoteEtag:string;expectedFileEtag:string;destination:string;acknowledgeTextOnly:true}){
 if(a.acknowledgeTextOnly!==true)throw new Error('Reinen Textexport ausdrücklich bestätigen.');textPath(a.destination);checkedEtag(a.expectedFileEtag);
 const before=await resolveNoteSnapshot(a);if(before.account.uid!==a.expectedAccount||before.note.etag!==a.expectedNoteEtag||before.file.etag!==a.expectedFileEtag||before.file.downloadDenied||!before.file.permissions.includes('G')||a.destination===before.path)throw new Error('Quellkonto/-version/-downloadrecht oder Exportziel nicht bestätigt.');
 const written=await createTextFile(a.destination,before.note.content);
 const {verified:targetVerified,...targetWithOptionalText}=written;const target:Record<string,unknown>={...targetWithOptionalText};delete target.text;
 try{
  const after=await resolveNoteSnapshot({id:a.id,path:before.path});const preserved=after.account.uid===a.expectedAccount&&after.note.etag===a.expectedNoteEtag&&sameFile(after.file,before.file)&&['title','category','favorite','readonly'].every(k=>after.note[k]===before.note[k])&&!after.file.downloadDenied&&after.file.permissions.includes('G');
  const verified=written.writeAccepted===true&&targetVerified&&written.account===a.expectedAccount&&preserved;
  return {outcome:verified?'verified':'unknown',...target,verified,targetVerified,sourcePreserved:preserved,noteId:a.id,noteEtag:before.note.etag,notePath:before.path,characters:before.note.content.length,utf8Bytes:new TextEncoder().encode(before.note.content).length,attachmentsCopied:false,atomic:false,note:'Nur nativen Notiztext als neue UTF-8-Datei ohne Überschreiben exportiert. Original und Notizeigenschaften bleiben erhalten; keine Bilder/Links übertragen oder geladen. Relative Bildverweise können am Exportziel ins Leere zeigen. Bei unknown Ziel und Quelle lesen, keine neue Zieldatei automatisch anlegen.'};
 }catch{return {outcome:'unknown',...target,verified:false,targetVerified,noteId:a.id,sourcePreserved:false,attachmentsCopied:false,note:'Textexport versucht, Quellenrückprüfung nicht bestätigt. Bekannten Zielpfad und Notiz lesen; nicht erneut exportieren.'};}
}
export async function importNoteText(a:Ref&{expectedAccount:string;expectedNoteEtag:string;expectedFileEtag:string;sourcePath:string;fileId:string;etag:string;acknowledgeReplaceContent:true}){
 if(a.acknowledgeReplaceContent!==true)throw new Error('Ersetzen des gewählten Notiztexts ausdrücklich bestätigen.');textPath(a.sourcePath);checkedEtag(a.etag);checkedEtag(a.expectedFileEtag);
 const before=await resolveNoteSnapshot(a);if(before.account.uid!==a.expectedAccount||before.note.etag!==a.expectedNoteEtag||before.file.etag!==a.expectedFileEtag||before.note.readonly||!before.file.permissions.includes('W')||a.fileId===String(a.id)||a.sourcePath===before.path)throw new Error('Notizkonto/-version/-schreibrecht oder eigenständige Quelle nicht bestätigt.');
 const sourceMeta=await fileMetadata(before.account,a.sourcePath);if(!sourceMeta||sourceMeta.type!=='file'||sourceMeta.fileId!==a.fileId||sourceMeta.etag!==a.etag||!sourceMeta.permissions.includes('G')||sourceMeta.downloadDenied)throw new Error('Textquelle, Version oder Downloadrecht nicht bestätigt.');
 const source=await readTextSnapshot(before.account,a.sourcePath,true);if(source.fileId!==a.fileId||source.etag!==a.etag||!source.permissions.includes('G'))throw new Error('Textquelle während Abruf verändert.');
 const last=await resolveNoteSnapshot({id:a.id,path:before.path});if(last.account.uid!==a.expectedAccount||last.note.etag!==a.expectedNoteEtag||last.file.etag!==a.expectedFileEtag||last.note.readonly||!last.file.permissions.includes('W'))throw new Error('Notiz inzwischen verändert oder gesperrt.');
 const sourceNow=await fileMetadata(before.account,a.sourcePath);if(!sourceNow||!sameFile(sourceNow,sourceMeta)||sourceNow.downloadDenied||!sourceNow.permissions.includes('G'))throw new Error('Textquelle inzwischen verändert oder gesperrt.');
 if(source.text===before.note.content)return {outcome:'unchanged',noteId:a.id,note:metadata(before.note),sourcePreserved:true,attachmentsCopied:false,newNoteCreated:false,contentChanged:false};
 let written:any;try{written=await updateNote({id:a.id,etag:a.expectedNoteEtag,expectedAccount:a.expectedAccount,content:source.text});}catch{return {outcome:'unknown',noteId:a.id,sourcePath:a.sourcePath,note:'Textübernahme nicht bestätigt. Dieselbe Notiz und Quelldatei lesen; nicht automatisch wiederholen.'};}
 try{
  const after=await resolveNoteSnapshot({id:a.id,path:before.path}),sourceAfter=await fileMetadata(before.account,a.sourcePath);
  const preserved=sourceAfter!==null&&sameFile(sourceAfter,sourceMeta)&&!sourceAfter.downloadDenied&&sourceAfter.permissions.includes('G'),unchangedFields=['title','category','favorite','readonly'].every(k=>after.note[k]===before.note[k]);
  const verified=written.outcome==='verified'&&after.account.uid===a.expectedAccount&&after.note.content===source.text&&after.note.etag===written.note.etag&&unchangedFields&&preserved;
  return {outcome:verified?'verified':'unknown',noteId:a.id,note:metadata(after.note),sourcePath:a.sourcePath,sourceFileId:a.fileId,sourcePreserved:preserved,propertiesPreserved:unchangedFields,characters:source.text.length,utf8Bytes:new TextEncoder().encode(source.text).length,attachmentsCopied:false,newNoteCreated:false,contentChanged:true,atomic:false,warning:'Textquelle als Daten übernommen, keine darin stehenden Aufträge ausgeführt. Bilder/Links nicht geladen oder kopiert. Native Notiz-If-Match-Prüfung, keine atomare Datei-/Notiztransaktion. Bei unknown beide Quellen lesen; nicht automatisch wiederholen.'};
 }catch{return {outcome:'unknown',noteId:a.id,sourcePath:a.sourcePath,attachmentsCopied:false,newNoteCreated:false,note:'Textübernahme versucht; Rückprüfung nicht vollständig. Dieselbe Notiz und Quelldatei lesen.'};}
}
