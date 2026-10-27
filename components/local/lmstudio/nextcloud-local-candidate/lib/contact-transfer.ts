// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudIdentity,davFetch,davDestination} from './nextcloud-read';
import {readContactBookAt,ownContactBook} from './contact-settings';
import {groupwareTarget,readGroupwareObject,strongGroupwareEtag,assertGroupwareWrite} from './groupware-dav';
import {contactSummary} from './contacts';
import {contactUidMatches} from './contact-exchange';
import {planningVersion} from './planning-json';
import {unfoldGroupware,singleComponent,propertyName,propertyValue} from './groupware-codec';

export type ContactTransferRef={addressBookPath:string;contactPath:string;etag:string;expectedUid:string;expectedAccount:string;destinationAddressBookPath:string;destinationContactId:string;operation:'copy'|'move'};
async function prepare(a:ContactTransferRef){
 strongGroupwareEtag(a.etag);
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(a.destinationContactId)||!['copy','move'].includes(a.operation))throw Error('Feste Zielkennung und copy/move erforderlich.');
 if(a.addressBookPath===a.destinationAddressBookPath)throw Error('Zwei verschiedene ausdrücklich gewählte Adressbücher erforderlich; kein Klonen mit neuer Identität.');
 const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)throw Error('Kontowechsel: Kontaktübertragung gestoppt.');
 const sourceBook=await readContactBookAt(account,a.addressBookPath),destinationBook=await readContactBookAt(account,a.destinationAddressBookPath);
 ownContactBook(destinationBook,'create');
 if(sourceBook.systemDerived||!sourceBook.resourceTypes.includes('addressbook')||!sourceBook.privileges.some(p=>p==='read'||p==='all'))throw Error('Reguläres lesbares Quelladressbuch erforderlich.');
 if(a.operation==='move'&&(!sourceBook.ownedByAccount||!sourceBook.privileges.some(p=>['all','write','unbind'].includes(p))))throw Error('Verschieben verlangt eigenes Quelladressbuch und natives Entfernungsrecht.');
 const source=await groupwareTarget('contacts',a.addressBookPath,a.contactPath,a.expectedAccount),card=await readGroupwareObject(source,'contacts');
 if(!card.found||card.etag!==a.etag)throw Error('Quellkontakt fehlt oder wurde verändert.');
 const summary=contactSummary(card.body);if(!summary.editable||!('uid'in summary)||summary.uid!==a.expectedUid)throw Error('Kontakt-UID stimmt nicht überein.');
 const parsed=singleComponent(card.body,'VCARD'),ids=parsed.indices.map(i=>parsed.lines[i]).filter(l=>propertyName(l)==='UID');
 if(ids.length!==1||ids[0].split(/[;:]/,1)[0].toUpperCase()!=='UID'||!propertyValue(ids[0]))throw Error('Eindeutige native Kontaktidentität erforderlich.');
 const target=await groupwareTarget('contacts',a.destinationAddressBookPath,a.destinationAddressBookPath+a.destinationContactId+'.vcf',a.expectedAccount);assertGroupwareWrite(target,'create');
 const existing=await readGroupwareObject(target,'contacts'),matches=await contactUidMatches(a.destinationAddressBookPath,a.expectedUid);
 const last=await readGroupwareObject(source,'contacts');
 if(!last.found||last.etag!==card.etag||last.body!==card.body||(await nextcloudIdentity()).uid!==a.expectedAccount||(await readContactBookAt(account,a.addressBookPath)).version!==sourceBook.version||(await readContactBookAt(account,a.destinationAddressBookPath)).version!==destinationBook.version)throw Error('Quelle, Konto oder Adressbuchrechte während Vorschau verändert.');
 const data={account:a.expectedAccount,operation:a.operation,sourceAddressBookPath:a.addressBookPath,sourceContactPath:a.contactPath,sourceEtag:a.etag,uid:summary.uid,displayName:summary.displayName,sourceAddressBookVersion:sourceBook.version,destinationAddressBookPath:a.destinationAddressBookPath,destinationAddressBookVersion:destinationBook.version,destinationContactPath:target.path!,targetExists:existing.found,uidMatches:matches,bodyVersion:await planningVersion({body:card.body})};
 return {source,target,card,summary,account,sourceBook,destinationBook,data,ready:!existing.found&&matches.length===0,version:await planningVersion(data)};
}
export async function prepareContactTransfer(a:ContactTransferRef){const p=await prepare(a);return {...p.data,version:p.version,ready:p.ready,atomic:false,note:'Nur Vorschau. Native COPY/MOVE zwischen verschiedenen Adressbüchern, gleiche UID erhalten, keine Zusammenführung oder neue Identität. Bei MOVE entfällt der Quellpfad. Ziel-Leser erhalten die Daten; persönliche Favoritenmetadaten separat lesen. Keine externen Foto-/Linkabrufe.'};}
export async function transferContact(a:ContactTransferRef&{expectedTransferVersion:string;acknowledgeTransfer:true;acknowledgeDestinationReaders:true}){
 if(a.acknowledgeTransfer!==true||a.acknowledgeDestinationReaders!==true)throw Error('Übertragung einschließlich Ziellesern ausdrücklich bestätigen.');
 const p=await prepare(a);if(!p.ready||p.version!==a.expectedTransferVersion)throw Error('Vorschau verändert, Zielkennung oder gleiche UID vorhanden. Neu prüfen; nichts überschreiben.');
 let accepted=false,status:number|null=null;
 try{
  const destination=davDestination(p.target.path!);
  const r=await davFetch(p.source.path!,{method:a.operation.toUpperCase(),headers:{Destination:destination,Overwrite:'F','If-Match':a.etag,Depth:'0'}});status=r.status;accepted=status===201;await r.body?.cancel();
 }catch{}
 let targetMatches=false,sourceMatches:boolean|null=null,accountVerified=false,booksVerified=false,targetEtag:string|null=null;
 try{const after=await readGroupwareObject(p.target,'contacts');if(after.found){targetEtag=after.etag;targetMatches=JSON.stringify(unfoldGroupware(after.body))===JSON.stringify(unfoldGroupware(p.card.body));}}catch{}
 try{const after=await readGroupwareObject(p.source,'contacts');sourceMatches=a.operation==='move'?!after.found:after.found&&after.etag===p.card.etag&&after.body===p.card.body;}catch{}
 try{accountVerified=(await nextcloudIdentity()).uid===a.expectedAccount;}catch{}
 try{
  const sourceBook=await readContactBookAt(p.account,a.addressBookPath),destinationBook=await readContactBookAt(p.account,a.destinationAddressBookPath);ownContactBook(destinationBook,'create');
  const identity=(b:typeof sourceBook)=>({path:b.path,owner:b.owner,ownedByAccount:b.ownedByAccount,privileges:b.privileges,resourceTypes:b.resourceTypes,systemDerived:b.systemDerived});
  booksVerified=await planningVersion(identity(sourceBook))===await planningVersion(identity(p.sourceBook))&&await planningVersion(identity(destinationBook))===await planningVersion(identity(p.destinationBook));
 }catch{}
 const verified=accepted&&targetMatches&&sourceMatches===true&&accountVerified&&booksVerified;
 return {outcome:verified?'verified':'unknown',verified,account:a.expectedAccount,operation:a.operation,sourceContactPath:a.contactPath,destinationContactPath:p.target.path,uid:a.expectedUid,uidPreserved:targetMatches,targetEtag,writeAccepted:accepted?true:null,writeStatus:status,targetMatches,sourceStateMatches:sourceMatches,booksVerified,atomic:false,note:'Genau ein nativer COPY/MOVE-Aufruf ohne Überschreiben; beide Seiten und Buchrechte getrennt zurückgeprüft. Native Indizierung/Ereignisse möglich. Persönlichen Favoriten im Ziel separat lesen. Bei unknown genau diese beiden Kennungen prüfen; nicht erneut übertragen, löschen oder eine Ersatzkennung verwenden.'};
}
