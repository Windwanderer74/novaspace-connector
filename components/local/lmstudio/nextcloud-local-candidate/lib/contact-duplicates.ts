// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudIdentity,davFetch} from './nextcloud-read';
import {groupwareTarget,groupwareQuery,groupwarePage,readGroupwareObject,strongGroupwareEtag,assertGroupwareWrite} from './groupware-dav';
import {readContactBookAt} from './contact-settings';
import {contactSummary} from './contacts';
import {singleComponent,propertyName,propertyValue,unfoldGroupware,foldGroupware,replaceProperties,utcGroupwareStamp} from './groupware-codec';
import {planningVersion} from './planning-json';

type Ref={addressBookPath:string;contactPath:string;etag:string;expectedUid:string};
export type ContactMergeRef={expectedAccount:string;source:Ref;target:Ref;takeSourceIds?:string[];removeTargetIds?:string[]};
const safe=new Set(['FN','N','NICKNAME','BDAY','ANNIVERSARY','GENDER','EMAIL','TEL','ADR','URL','IMPP','CATEGORIES','NOTE','ORG','TITLE','ROLE']);
const singleton=new Set(['FN','N','BDAY','ANNIVERSARY','GENDER']);
const groupOf=(line:string)=>{const token=line.split(/[;:]/,1)[0];return token.includes('.')?token.slice(0,token.lastIndexOf('.')):null;};
function writableBook(book:Awaited<ReturnType<typeof readContactBookAt>>){if(!book.ownedByAccount||book.systemDerived||book.resourceTypes.some(n=>!['collection','addressbook'].includes(n))||!book.privileges.some(n=>['read','all'].includes(n))||!book.privileges.some(n=>['write-content','write','all'].includes(n))||!book.ctag&&!book.syncToken)throw Error('Eigenes reguläres lesbares Adressbuch mit nativem Inhaltsschreibrecht erforderlich.');}
function document(body:string){
 const summary=contactSummary(body);if(!summary.editable||!('uid'in summary))throw Error('Eindeutige vCard3/4 mit Namen und UID erforderlich.');
 const parsed=singleComponent(body,'VCARD');if(parsed.lines.some(l=>propertyName(l)==='BEGIN'&&propertyValue(l)!=='VCARD'))throw Error('Verschachtelte Kontakte zuerst nativ klären.');
 const units:{id:string;group:string|null;indices:number[];names:string[];lines:string[];selectable:boolean;reason:string|null}[]=[],groups=new Map<string,typeof units[number]>();
 for(const i of parsed.indices){
  const line=parsed.lines[i],group=groupOf(line);let unit=group?groups.get(group.toLowerCase()):undefined;
  if(!unit){unit={id:'u'+i,group,indices:[],names:[],lines:[],selectable:false,reason:null};units.push(unit);if(group)groups.set(group.toLowerCase(),unit);}
  unit.indices.push(i);unit.names.push(propertyName(line));unit.lines.push(line);
 }
 if(units.length>200)throw Error('Mehr als200 Werteinheiten: zuerst nativ eingrenzen.');
 for(const unit of units){
  const core=unit.names.filter(n=>safe.has(n));
  unit.reason=!core.length||unit.names.some(n=>!safe.has(n)&&!(unit.group&&['X-ABLABEL','X-ABADR'].includes(n)))?'Identität, Bild oder unbekannte Eigenschaft bleibt im Original.':unit.lines.some(l=>/;(?:PID|ALTID|ENCODING|CHARSET)=/i.test(l.slice(0,l.length-propertyValue(l).length-1)))?'Verknüpfte oder ältere Kodierung zuerst nativ klären.':unit.lines.join('\n').length>8192?'Werteinheit größer als8KiB: separat nativ pflegen.':null;
  unit.selectable=unit.reason===null;
 }
 return {summary,parsed,units};
}
function view(d:ReturnType<typeof document>){return {uid:d.summary.uid,version:d.summary.version,displayName:d.summary.displayName,units:d.units.map(u=>({...u,lines:u.names.some(n=>['PHOTO','LOGO','SOUND','KEY'].includes(n))||u.lines.join('\n').length>8192?['[Inhalt nicht ausgegeben; im versionsgebundenen Original erhalten]']:u.lines}))};}
const normalized=(s:string)=>s.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de');
export async function findContactDuplicates(a:{addressBookPaths:string[];expectedAccount:string;matchOn:('email'|'phone'|'name'|'uid')[];limit:number;offset:number;expectedSnapshot?:string}){
 if(!a.addressBookPaths.length||a.addressBookPaths.length>4||new Set(a.addressBookPaths).size!==a.addressBookPaths.length||!a.matchOn.length||new Set(a.matchOn).size!==a.matchOn.length||a.matchOn.some(n=>!['email','phone','name','uid'].includes(n)))throw Error('1–4 verschiedene Adressbücher und explizite Vergleichsmerkmale erforderlich.');
 const found:{addressBookPath:string;path:string;etag:string;uid:string;displayName:string;signals:Map<string,string>}[]=[],versions:unknown[]=[];let unparsed=0;
 for(const path of a.addressBookPaths){const t=await groupwareTarget('contacts',path,undefined,a.expectedAccount),rows=await groupwareQuery(t,'contacts');versions.push([path,rows.map(r=>[r.path,r.etag])]);
  for(const r of rows){const c=contactSummary(r.body);if(!c.editable||!('uid'in c)||!c.uid||c.displayName===undefined||!c.emails||!c.phones){unparsed++;continue;}const signals=new Map<string,string>();
   const add=(type:string,value:string)=>{if(value)signals.set(type+':'+value,type);};
   if(a.matchOn.includes('uid'))add('uid',c.uid);
   if(a.matchOn.includes('name'))add('name',normalized(c.displayName));
   if(a.matchOn.includes('email'))for(const x of c.emails){const v=x.value.trim(),at=v.lastIndexOf('@');if(at>0)add('email',v.slice(0,at)+'@'+v.slice(at+1).toLowerCase());}
   if(a.matchOn.includes('phone'))for(const x of c.phones){const v=x.value.replace(/^tel:/i,'').trim();if(/^\+?[\d ()/.-]+$/.test(v)){const digits=v.replace(/[ ()/.-]/g,'');if(digits.replace(/\D/g,'').length>=5)add('phone',digits);}}
   found.push({addressBookPath:path,path:r.path,etag:r.etag,uid:c.uid,displayName:c.displayName,signals});
  }
 }
 if(found.length>1000)throw Error('Mehr als1000 Kontakte insgesamt: Auswahl eingrenzen.');
 const pairs=[];for(let i=0;i<found.length;i++)for(let j=i+1;j<found.length;j++){
  const reasons=[...new Set([...found[i].signals].filter(([key])=>found[j].signals.has(key)).map(([,kind])=>kind))];
  if(reasons.length){const {signals:_,...left}=found[i],{signals:__,...right}=found[j];pairs.push({left,right,reasons});if(pairs.length>5000)throw Error('Mehr als5000 Kandidatenpaare: Bücher oder Vergleichsmerkmale eingrenzen.');}
 }
 if((await nextcloudIdentity()).uid!==a.expectedAccount)throw Error('Konto während Suche verändert.');
 return {account:a.expectedAccount,...await groupwarePage(pairs,{versions,matchOn:a.matchOn},a.limit,a.offset,a.expectedSnapshot),unparsedObjects:unparsed,note:'Nur Kandidaten anhand gewählter exakter Merkmale, keine Identitätsentscheidung oder automatische Zusammenführung. Namen nur mit normalisierter Groß-/Kleinschreibung/Leerraum; Telefon ohne Länderraten, Mail-Lokalteil unverändert. Unlesbare Antwort ist kein leeres Ergebnis. Keine externen Abrufe.'};
}
async function snapshot(ref:Ref,account:string){
 strongGroupwareEtag(ref.etag);const t=await groupwareTarget('contacts',ref.addressBookPath,ref.contactPath,account),r=await readGroupwareObject(t,'contacts');
 if(!r.found||r.etag!==ref.etag)throw Error('Kontakt fehlt oder Version verändert. Neu vergleichen.');
 const d=document(r.body);if(d.summary.uid!==ref.expectedUid)throw Error('Kontaktidentität verändert.');return {t,r,d};
}
async function prepare(a:ContactMergeRef){
 if(a.source.contactPath===a.target.contactPath)throw Error('Zwei verschiedene Kontaktkennungen ausdrücklich wählen.');
 const identity=await nextcloudIdentity();if(identity.uid!==a.expectedAccount)throw Error('Kontowechsel.');
 const sourceBook=await readContactBookAt(identity,a.source.addressBookPath),targetBook=await readContactBookAt(identity,a.target.addressBookPath);writableBook(targetBook);
 if(sourceBook.systemDerived||!sourceBook.privileges.some(p=>['read','all'].includes(p)))throw Error('Reguläres lesbares Quelladressbuch erforderlich.');
 const source=await snapshot(a.source,a.expectedAccount),target=await snapshot(a.target,a.expectedAccount);assertGroupwareWrite(target.t,'update');
 const take=a.takeSourceIds??[],remove=a.removeTargetIds??[];
 if(take.length>50||remove.length>50||new Set(take).size!==take.length||new Set(remove).size!==remove.length)throw Error('Höchstens50 unterschiedliche Werteinheiten pro Seite.');
 const select=(ids:string[],d:typeof source.d)=>ids.map(id=>{const unit=d.units.find(u=>u.id===id);if(!unit?.selectable)throw Error('Werteinheit fehlt oder ist nicht sicher übertragbar.');return unit;});
 const selected=select(take,source.d),removed=select(remove,target.d),selectedNames=new Set(selected.flatMap(u=>u.names).filter(n=>safe.has(n)));
 if(removed.some(u=>u.names.some(n=>safe.has(n)&&!selectedNames.has(n))))throw Error('Entfernte Zielwerte müssen durch ausdrücklich gewählte Quellfelder ersetzt werden.');
 if(take.length&&source.d.summary.version!==target.d.summary.version)throw Error('Verschiedene vCard-Versionen nicht still konvertieren; zuerst nativ angleichen.');
 const discarded=new Set(removed.flatMap(u=>u.indices)),usedGroups=new Set(target.d.units.map(u=>u.group?.toLowerCase()).filter(Boolean));let index=0;
 const imported=selected.flatMap(u=>{if(!u.group)return u.lines;let group;do{group='nfmerge'+(++index);}while(usedGroups.has(group));usedGroups.add(group);return u.lines.map(l=>group+l.slice(u.group!.length));});
 const lines=target.d.parsed.lines.filter((_,i)=>!discarded.has(i));lines.splice(lines.length-1,0,...imported);
 const names=lines.map(propertyName);for(const name of singleton)if(names.filter(n=>n===name).length>1&&imported.some(l=>propertyName(l)===name))throw Error('Konflikt bei '+name+': alten Zielwert ausdrücklich zur Ersetzung auswählen.');
 const merged=foldGroupware(lines);unfoldGroupware(merged);document(merged);
 const lastSource=await snapshot(a.source,a.expectedAccount),lastTarget=await snapshot(a.target,a.expectedAccount);
 if(lastSource.r.body!==source.r.body||lastTarget.r.body!==target.r.body||(await nextcloudIdentity()).uid!==a.expectedAccount||(await readContactBookAt(identity,a.source.addressBookPath)).version!==sourceBook.version||(await readContactBookAt(identity,a.target.addressBookPath)).version!==targetBook.version)throw Error('Kontakte, Konto oder Buchrechte während Vorschau verändert.');
 const data={account:a.expectedAccount,source:a.source,target:a.target,sourceBookVersion:sourceBook.version,targetBookVersion:targetBook.version,sourceBody:await planningVersion({body:source.r.body}),targetBody:await planningVersion({body:target.r.body}),takeSourceIds:take,removeTargetIds:remove,mergedBody:await planningVersion({body:merged})};
 return {source,target,identity,sourceBook,targetBook,selected,removed,imported,merged,version:await planningVersion(data),ready:take.length>0&&JSON.stringify(unfoldGroupware(merged))!==JSON.stringify(unfoldGroupware(target.r.body))};
}
export async function prepareContactMerge(a:ContactMergeRef){
 const p=await prepare(a);return {account:a.expectedAccount,source:view(p.source.d),target:view(p.target.d),version:p.version,ready:p.ready,selected:p.selected.map(u=>u.id),removed:p.removed.map(u=>u.id),importedLines:p.imported,proposedTarget:view(document(p.merged)),atomic:false,note:'Vergleich/Vorschau ohne Änderung. IDs vollständig gruppierter Werte wählen; Gruppen werden im Ziel kollisionsfrei umbenannt. Nur gewählte Quellwerte ergänzen und ausdrücklich gewählte Zielwerte ersetzen. Ziel-UID, unbekannte Felder und Quellkontakt erhalten. Bilder separat pflegen; PID/ALTID/alte Kodierungen nicht still konvertieren. Quellkontakt löschen bleibt eigener ausdrücklicher Auftrag.'};
}
export async function mergeContacts(a:ContactMergeRef&{expectedMergeVersion:string;acknowledgeMerge:true;acknowledgeTargetReaders:true}){
 if(a.acknowledgeMerge!==true||a.acknowledgeTargetReaders!==true)throw Error('Werteübernahme und Ziel-Lesbarkeit ausdrücklich bestätigen.');
 const p=await prepare(a);if(!p.ready||p.version!==a.expectedMergeVersion)throw Error('Keine unveränderte ausführbare Vorschau. Neu vergleichen.');
 const body=replaceProperties(singleComponent(p.merged,'VCARD'),new Map([['REV',['REV:'+utcGroupwareStamp()]]]));unfoldGroupware(body);
 let accepted=false,status:number|null=null;try{const r=await davFetch(p.target.t.path!,{method:'PUT',headers:{'If-Match':a.target.etag,'Content-Type':'text/vcard; charset=utf-8'},body});status=r.status;accepted=status===204;await r.body?.cancel();}catch{}
 let targetMatches=false,sourcePreserved=false,accountVerified=false,booksVerified=false,etag:string|null=null;
 try{const r=await readGroupwareObject(p.target.t,'contacts');if(r.found){etag=r.etag;targetMatches=JSON.stringify(unfoldGroupware(r.body))===JSON.stringify(unfoldGroupware(body));}}catch{}
 try{const r=await readGroupwareObject(p.source.t,'contacts');sourcePreserved=r.found&&r.etag===a.source.etag&&r.body===p.source.r.body;}catch{}
 try{accountVerified=(await nextcloudIdentity()).uid===a.expectedAccount;const s=await readContactBookAt(p.identity,a.source.addressBookPath),t=await readContactBookAt(p.identity,a.target.addressBookPath);writableBook(t);const props=(b:typeof s)=>({owner:b.owner,ownedByAccount:b.ownedByAccount,privileges:b.privileges,resourceTypes:b.resourceTypes,systemDerived:b.systemDerived});booksVerified=await planningVersion(props(s))===await planningVersion(props(p.sourceBook))&&await planningVersion(props(t))===await planningVersion(props(p.targetBook));}catch{}
 const verified=accepted&&targetMatches&&sourcePreserved&&accountVerified&&booksVerified;
 return {outcome:verified?'verified':'unknown',verified,account:a.expectedAccount,sourceContactPath:a.source.contactPath,targetContactPath:a.target.contactPath,targetUid:a.target.expectedUid,etag,writeStatus:status,writeAccepted:accepted?true:null,targetMatches,sourcePreserved,accountVerified,booksVerified,atomic:false,note:'Ein bedingter PUT nur auf den Zielkontakt; keine Quelllöschung, Freigabe, Foto-/Linkabrufe oder automatische Wiederholung. Beide Originalkennungen und Buchrechte zurückgeprüft. Quelle kann nach Vorprüfung parallel ändern; keine atomare Zwei-Kontakt-Transaktion. Bei unknown genau diese beiden Kennungen lesen.'};
}
