// SPDX-License-Identifier: AGPL-3.0-or-later
import ICAL from 'ical.js';
import {nextcloudIdentity,fileMetadata,readTextSnapshot,davFetch,readBody,parseDav,safeDavPath} from './nextcloud-read';
import {checkedFilePath,checkedEtag} from './files-organize';
import {createTextFile} from './files-write';
import {groupwareTarget,readGroupwareObject} from './groupware-dav';
import {singleComponent,propertyName,propertyValue,unescapeGroupwareText,xmlText} from './groupware-codec';
import {contactSummary} from './contacts';
import {readContactBookAt,ownContactBook} from './contact-settings';
import {planningVersion} from './planning-json';

const MAX=128*1024;
function vcfPath(path:string){checkedFilePath(path);if(!/\.vcf$/i.test(path))throw Error('Genau eine ausgewählte .vcf-Datei erforderlich.');return path;}
function card(data:string){
 if(new TextEncoder().encode(data).length>MAX)throw Error('vCard-Austausch ist auf128KiB UTF-8 begrenzt.');
 const p=singleComponent(data,'VCARD'),summary=contactSummary(data);
 if(!summary.editable||!('uid'in summary)||!summary.uid||summary.uid.length>255||/[\x00-\x1f\x7f]/.test(summary.uid))throw Error('Eine vCard3/4 mit eindeutiger UID und Anzeigename erforderlich.');
 const lines=p.indices.map(i=>p.lines[i]);
 if(lines.filter(l=>propertyName(l)==='FN').length!==1||lines.some(l=>['UID','VERSION','FN'].includes(propertyName(l))&&l.split(/[;:]/,1)[0].includes('.')))throw Error('vCard-Identität oder Anzeigename mehrdeutig.');
 // The already pinned RFC parser validates quoted parameters and structured values.
 const component=new ICAL.Component(ICAL.parse(data));if(component.name!=='vcard'||component.getAllSubcomponents().length)throw Error('Genau eine eigenständige vCard erforderlich.');
 const canonical=JSON.stringify(component.getAllProperties().map(p=>p.toJSON()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 return {p,summary,canonical};
}
function importCard(data:string){
 const c=card(data),lines=c.p.indices.map(i=>c.p.lines[i]);
 if(lines.some(l=>/;(?:CHARSET|ENCODING)=/i.test(l)&&propertyName(l)!=='PHOTO')||lines.some(l=>propertyName(l)==='KIND'&&propertyValue(l).toLowerCase()!=='individual'))throw Error('Alte Textkodierung oder Gruppen-vCard zuerst nativ klären.');
 return c;
}
type FileRef={sourcePath:string;fileId:string;etag:string};
async function source(account:Awaited<ReturnType<typeof nextcloudIdentity>>,a:FileRef){
 vcfPath(a.sourcePath);checkedEtag(a.etag);if(!/^[1-9]\d*$/.test(a.fileId))throw Error('Gültige Datei-ID erforderlich.');
 const m=await fileMetadata(account,a.sourcePath);if(!m||m.type!=='file'||m.fileId!==a.fileId||m.etag!==a.etag||!m.permissions.includes('G')||m.downloadDenied)throw Error('vCard-Quelle, Version oder Downloadrecht nicht bestätigt.');
 const r=await readTextSnapshot(account,a.sourcePath,true);if(r.fileId!==a.fileId||r.etag!==a.etag||!r.permissions.includes('G'))throw Error('vCard-Datei während Abruf verändert.');return r;
}
async function uidMatches(book:string,uid:string){
 const r=await davFetch(book,{method:'REPORT',headers:{Depth:'1','Content-Type':'application/xml; charset=utf-8'},body:`<a:addressbook-query xmlns:d="DAV:" xmlns:a="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><a:address-data><a:prop name="UID"/></a:address-data></d:prop><a:filter><a:prop-filter name="UID"><a:text-match collation="i;unicode-casemap" match-type="equals">${xmlText(uid)}</a:text-match></a:prop-filter></a:filter></a:addressbook-query>`});
 if(r.status!==207){await r.body?.cancel();throw Error(`Adressbuch-UID-Prüfung: HTTP ${r.status}.`);}
 const rows=parseDav(await readBody(r,2*1024*1024));if(rows.length>100)throw Error('Mehr als100 UID-Kandidaten.');
 const seen=new Set<string>(),matches:{contactPath:string;etag:string}[]=[];
 for(const row of rows){const path=safeDavPath(row.href,book);if(!path.slice(book.length)||path.slice(book.length).includes('/')||seen.has(path))throw Error('UID-Abgleich mit fremder/doppelter Kennung.');seen.add(path);const body=row.props['address-data'],etag=row.props.getetag;
  if(typeof body!=='string'||typeof etag!=='string')throw Error('UID-Prüfdaten fehlen.');checkedEtag(etag);
  const p=singleComponent(body,'VCARD');if(p.lines.some(l=>propertyName(l)==='BEGIN'&&propertyValue(l).toUpperCase()!=='VCARD'))throw Error('Mehrdeutige UID-Prüfstruktur.');const uids=p.indices.map(i=>p.lines[i]).filter(l=>propertyName(l)==='UID');
  if(uids.length!==1||!propertyValue(uids[0])||uids[0].split(/[;:]/,1)[0].includes('.'))throw Error('UID-Prüfung unvollständig.');
  if(unescapeGroupwareText(propertyValue(uids[0]))===uid)matches.push({contactPath:path,etag});
 }
 return matches.sort((a,b)=>a.contactPath.localeCompare(b.contactPath));
}
export {uidMatches as contactUidMatches};
export type ContactImportRef=FileRef&{addressBookPath:string;contactId:string;expectedAccount:string};
async function prepare(a:ContactImportRef){
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(a.contactId))throw Error('Stabile Kontaktkennung8–80 Zeichen erforderlich.');
 const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)throw Error('Kontowechsel: vCard-Import gestoppt.');
 const book=await readContactBookAt(account,a.addressBookPath);ownContactBook(book,'create');
 const t=await groupwareTarget('contacts',book.path,book.path+a.contactId+'.vcf',a.expectedAccount),file=await source(account,a),parsed=importCard(file.text),target=await readGroupwareObject(t,'contacts'),matches=await uidMatches(book.path,parsed.summary.uid);
 const last=await source(account,a);if(last.text!==file.text||(await nextcloudIdentity()).uid!==a.expectedAccount||(await readContactBookAt(account,book.path)).version!==book.version)throw Error('Quelle, Konto oder Adressbuch während Importvorschau verändert.');
 const s=parsed.summary,preview={uid:s.uid,version:s.version,displayName:s.displayName,emailValues:s.emails.length,phoneValues:s.phones.length,addressValues:s.addresses.length,categoryValues:s.categories.length,photoPresent:s.photoPresent,externalReferencesFetched:false};
 const data={account:a.expectedAccount,sourcePath:a.sourcePath,sourceFileId:a.fileId,sourceEtag:a.etag,sourceContentVersion:await planningVersion({text:file.text}),addressBookPath:book.path,addressBookVersion:book.version,contactPath:t.path!,preview,targetExists:target.found,uidMatches:matches};
 return {account,book,t,file,parsed,data,version:await planningVersion(data),ready:!target.found&&!matches.length};
}
export async function prepareContactVcfImport(a:ContactImportRef){const p=await prepare(a);return {...p.data,version:p.version,ready:p.ready,atomic:false,note:'Nur Vorschau für genau einen neuen Kontakt. UID erhalten, keine Dublettenverschmelzung oder externe Foto-/Linkabrufe. Vorschau bindet Quelle und Ziel, bildet aber keine atomare Transaktion.'};}
export async function importContactVcf(a:ContactImportRef&{expectedImportVersion:string;acknowledgeImport:true}){
 if(a.acknowledgeImport!==true)throw Error('Geprüften Importumfang ausdrücklich bestätigen.');
 const p=await prepare(a);if(!p.ready||p.version!==a.expectedImportVersion)throw Error('Importvorschau verändert oder Ziel/UID vorhanden. Neu prüfen; nichts überschreiben.');
 let accepted=false,status:number|null=null;
 try{const r=await davFetch(p.t.path!,{method:'PUT',headers:{'If-None-Match':'*','Content-Type':'text/vcard; charset=utf-8'},body:p.file.text});status=r.status;await r.body?.cancel();accepted=status===201;}catch{}
 let observedTargetMatches=false,sourcePreserved:boolean|null=null,accountVerified=false,bookVerified=false,etag:string|null=null;
 try{const after=await readGroupwareObject(p.t,'contacts');if(after.found){etag=after.etag;observedTargetMatches=card(after.body).canonical===p.parsed.canonical;}}catch{}
 try{sourcePreserved=(await source(p.account,a)).text===p.file.text;}catch{}
 try{accountVerified=(await nextcloudIdentity()).uid===a.expectedAccount;const after=await readContactBookAt(p.account,p.book.path);ownContactBook(after,'create');bookVerified=after.owner===p.book.owner;}catch{}
 const verified=accepted&&observedTargetMatches&&sourcePreserved===true&&accountVerified&&bookVerified;
 return {outcome:verified?'verified':'unknown',verified,account:a.expectedAccount,addressBookPath:p.book.path,contactPath:p.t.path,originalUid:p.parsed.summary.uid,uidPreserved:observedTargetMatches,etag,writeAccepted:accepted?true:null,writeStatus:status,observedTargetMatches,sourcePreserved,atomic:false,note:'Genau eine Neuanlage mit erhaltener UID. Native Kontaktindizierung/Geburtstagsdarstellung möglich. Quelle und Ziel getrennt geprüft, keine atomare Gesamttransaktion. Bei unknown dieselbe Kennung lesen; nicht wiederholen, UID ändern oder Ersatzkennung wählen.'};
}
export async function exportContactVcf(a:{addressBookPath:string;contactPath:string;etag:string;expectedUid:string;expectedAccount:string;destination:string}){
 vcfPath(a.destination);checkedEtag(a.etag);
 const t=await groupwareTarget('contacts',a.addressBookPath,a.contactPath,a.expectedAccount),before=await readGroupwareObject(t,'contacts');
 if(!before.found||before.etag!==a.etag)throw Error('Kontakt fehlt oder Version verändert.');const parsed=card(before.body);if(parsed.summary.uid!==a.expectedUid)throw Error('Kontakt-UID stimmt nicht überein.');
 const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)throw Error('Dateikonto verändert.');if(await fileMetadata(account,a.destination))throw Error('Exportziel existiert schon. Keine Datei überschreiben.');
 const raw=await davFetch(t.path!,{method:'GET',headers:{Accept:'text/vcard','If-Match':before.etag,'Accept-Encoding':'identity','Cache-Control':'no-cache'}});
 if(raw.status!==200){await raw.body?.cancel();throw Error('Versionierter Kontakt-Originalabruf fehlgeschlagen.');}
 const contentEtag=raw.headers.get('etag');if(!contentEtag||!contentEtag.startsWith('W/')&&contentEtag!==before.etag){await raw.body?.cancel();throw Error('Originalantwort ohne passende Versionskennung.');}
 const content=await readBody(raw,MAX);if(card(content).canonical!==parsed.canonical)throw Error('Originaltext und DAV-Prüfobjekt widersprechen sich.');
 const last=await readGroupwareObject(t,'contacts');if(!last.found||last.etag!==before.etag||last.body!==before.body||(await nextcloudIdentity()).uid!==a.expectedAccount)throw Error('Exportquelle inzwischen verändert.');
 let written:any=null;try{written=await createTextFile(a.destination,content,a.expectedAccount);}catch{}
 let target:any=null,targetVerified=false,sourcePreserved:boolean|null=null;
 try{target=await readTextSnapshot(account,a.destination,true);targetVerified=target.text===content&&target.permissions.includes('G');}catch{}
 try{const after=await readGroupwareObject(t,'contacts');sourcePreserved=after.found&&after.etag===before.etag&&after.body===before.body&&(await nextcloudIdentity()).uid===a.expectedAccount;}catch{}
 const verified=written?.writeAccepted===true&&written?.verified===true&&targetVerified&&sourcePreserved===true;
 return {outcome:verified?'verified':'unknown',verified,account:a.expectedAccount,addressBookPath:a.addressBookPath,contactPath:t.path,uid:parsed.summary.uid,sourceEtag:before.etag,contentEtag,destination:a.destination,fileId:target?.fileId??written?.fileId??null,etag:target?.etag??null,targetVerified,sourcePreserved,atomic:false,note:'Ausgewählten Originaltext als neue vCard-Datei exportiert. Persönliche Daten und Foto-/Linkverweise können enthalten sein; nichts nachladen oder versenden. Keine Importfähigkeitsgarantie. Bei unknown dieselben Pfade lesen; keine Ersatzdatei erzeugen.'};
}
