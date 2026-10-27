// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudIdentity,davFetch,safeDavPath} from './nextcloud-read';
import {groupwareProps,strongGroupwareEtag} from './groupware-dav';
import {readContactBookAt,readContactBookSettings} from './contact-settings';
import {planningVersion} from './planning-json';
import {xmlText} from './groupware-codec';
type Ref={addressBookPath:string;expectedAccount:string};
type Recipient={recipientType:'user'|'group';recipientId:string};
type Share={href:string;recipientType:string;recipientId:string;role:'read'|'read-write';commonName:string};
const many=(x:any):any[]=>x===undefined?[]:Array.isArray(x)?x:[x];
const text=(x:any):string=>typeof x==='string'?x:typeof x?.['#text']==='string'?x['#text']:'';
const same=async(a:unknown,b:unknown)=>await planningVersion(a)===await planningVersion(b);
function own(book:Awaited<ReturnType<typeof readContactBookAt>>){if(!book.ownedByAccount||book.systemDerived||book.resourceTypes.some(t=>!['collection','addressbook'].includes(t))||!book.privileges.some(p=>['all','read'].includes(p))||!book.privileges.some(p=>['all','write'].includes(p))||!book.ctag&&!book.syncToken)throw Error('Eigenes reguläres lesbares Adressbuch mit nativem Gesamtschreibrecht erforderlich.');}
function recipient(a:Recipient,account:string){
 if(!['user','group'].includes(a.recipientType)||!a.recipientId||a.recipientId!==a.recipientId.trim()||a.recipientId.length>255||/[\/\\\x00-\x1f\x7f]/.test(a.recipientId))throw Error('Exakte lokale Nutzer-/Gruppenkennung ohne Pfad erforderlich.');
 if(a.recipientType==='user'&&a.recipientId.toLowerCase()===account.toLowerCase())throw Error('Eigentümer/eigenes Konto nicht als Freigabe ändern.');
 // Native principal identifiers are not URL paths; XML escaping is applied at serialization.
 return 'principal:principals/'+(a.recipientType==='user'?'users/':'groups/')+a.recipientId;
}
async function sharesAt(path:string){
 const rows=await groupwareProps(path,'<oc:invite xmlns:oc="http://owncloud.org/ns"/>');
 if(rows.length!==1||safeDavPath(rows[0].href,path)!==path||!Object.hasOwn(rows[0].props,'invite'))throw Error('Native Freigabeübersicht nicht eindeutig verfügbar.');
 const raw=rows[0].props.invite;if(raw!==''&&(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['user','organizer'].includes(k))))throw Error('Unbekannte native Freigabestruktur.');
 const users=many(raw?.user);if(users.length>100)throw Error('Mehr als100 Freigaben.');
 const result:Share[]=users.map(u=>{
  const href=text(u?.href),match=/^principal:principals\/(users|groups|circles|remote-users)\/(.+)$/.exec(href),access=u?.access;
  if(!match||!access||typeof access!=='object'||Array.isArray(access)||Object.keys(access).length!==1||!['read','read-write'].includes(Object.keys(access)[0]))throw Error('Mehrdeutiger nativer Empfänger oder Freigaberolle.');
  return {href,recipientType:match[1]==='users'?'user':match[1]==='groups'?'group':match[1],recipientId:match[2],role:Object.keys(access)[0] as Share['role'],commonName:text(u['common-name'])};
 }).sort((a,b)=>a.href.localeCompare(b.href));
 if(new Set(result.map(s=>s.href)).size!==result.length)throw Error('Doppelte Freigabekennung.');return result;
}
async function childrenAt(path:string){
 const rows=await groupwareProps(path,'<d:resourcetype/><d:getetag/><d:getcontentlength/>','1');if(rows.length>1001)throw Error('Mehr als1000 Kontakte; Buchumfang nicht vollständig bestätigt.');
 let self=0;const seen=new Set<string>(),children=[];
 for(const row of rows){const p=safeDavPath(row.href,path);if(seen.has(p))throw Error('Doppelte Inhaltskennung.');seen.add(p);if(p===path){self++;continue;}
  const tail=p.slice(path.length),types=Object.keys(row.props.resourcetype??{});if(!tail||tail.includes('/')||types.length)throw Error('Unerwarteter Adressbuchinhalt.');
  const etag=strongGroupwareEtag(text(row.props.getetag)),size=text(row.props.getcontentlength);if(size&&(!/^\d+$/.test(size)||!Number.isSafeInteger(Number(size))))throw Error('Ungültige Inhaltsgröße.');
  children.push({path:p,etag,bytes:size?Number(size):null});
 }
 if(self!==1)throw Error('Adressbuchumfang ohne eindeutige Wurzel.');return children.sort((a,b)=>a.path.localeCompare(b.path));
}
async function snapshot(a:Ref){
 const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)throw Error('Kontowechsel.');const book=await readContactBookAt(account,a.addressBookPath);own(book);
 const shares=await sharesAt(a.addressBookPath),children=await childrenAt(a.addressBookPath),last=await readContactBookAt(account,a.addressBookPath);
 if(last.version!==book.version||(await nextcloudIdentity()).uid!==a.expectedAccount)throw Error('Adressbuch oder Konto während Abruf verändert.');
 const version=await planningVersion({account:a.expectedAccount,book,shares,children});return {account,book,shares,children,version};
}
export async function readContactBookShares(a:Ref){const s=await snapshot(a);return {account:a.expectedAccount,addressBookPath:a.addressBookPath,book:s.book,shares:s.shares,contactCount:s.children.length,version:s.version,atomic:false,note:'Eigene direkte native Freigaben. Nur lokale Nutzer/Gruppen ändern; keine öffentlichen/föderierten Links. Freigabe betrifft bestehende und künftige Kontakte. Andere Zugriffswege können bestehen bleiben.'};}
type ShareArgs=Ref&Recipient&{expectedVersion:string;operation:'create'|'update'|'revoke';role?:'read'|'read-write';acknowledgeBookAccess:true};
export async function changeContactBookShare(a:ShareArgs){
 if(a.acknowledgeBookAccess!==true||!['create','update','revoke'].includes(a.operation)||a.operation!=='revoke'&&!['read','read-write'].includes(a.role??''))throw Error('Konkrete Freigabehandlung, Rolle und Zugriff auf bestehende/künftige Kontakte bestätigen.');
 const href=recipient(a,a.expectedAccount),before=await snapshot(a);if(before.version!==a.expectedVersion)throw Error('Freigaben, Inhalt oder Adressbuchversion verändert. Neu lesen.');
 const old=before.shares.find(s=>s.href===href);if(a.operation==='create'&&old||a.operation!=='create'&&!old)throw Error('Direkte Empfängerfreigabe schon vorhanden oder nicht gefunden.');
 if(a.operation==='update'&&old?.role===a.role)return {outcome:'unchanged',verified:true,version:before.version,shares:before.shares,atomic:false};
 if((await snapshot(a)).version!==before.version)throw Error('Freigabeumfang inzwischen verändert.');
 const xml=a.operation==='revoke'?`<oc:remove><d:href>${xmlText(href)}</d:href></oc:remove>`:`<oc:set><d:href>${xmlText(href)}</d:href><oc:${a.role}/></oc:set>`;
 let accepted=false,status:number|null=null;try{const r=await davFetch(a.addressBookPath,{method:'POST',headers:{'Content-Type':'application/xml; charset=utf-8'},body:`<oc:share xmlns:oc="http://owncloud.org/ns" xmlns:d="DAV:">${xml}</oc:share>`});status=r.status;accepted=status===200;await r.body?.cancel();}catch{}
 try{
  const after=await snapshot(a),entry=after.shares.find(s=>s.href===href),stable=(b:typeof after.book)=>({path:b.path,title:b.title,description:b.description,owner:b.owner,privileges:b.privileges,resourceTypes:b.resourceTypes,systemDerived:b.systemDerived});
  const targetMatches=a.operation==='revoke'?!entry:entry?.role===a.role,othersPreserved=await same(before.shares.filter(s=>s.href!==href),after.shares.filter(s=>s.href!==href));
  const verified=accepted&&targetMatches&&othersPreserved&&await same(before.children,after.children)&&await same(stable(before.book),stable(after.book));
  return {outcome:verified?'verified':'unknown',verified,account:a.expectedAccount,addressBookPath:a.addressBookPath,recipientType:a.recipientType,recipientId:a.recipientId,operation:a.operation,role:entry?.role??null,shares:after.shares,version:after.version,writeStatus:status,contactsPreserved:await same(before.children,after.children),otherAccessMayRemain:true,notificationMayBeSent:true,atomic:false,note:'Ein nativer POST, keine atomare Freigabeversion. Nur direkte gewählte Freigabe geprüft; andere Zugriffswege können fortbestehen. Native Benachrichtigungen möglich. Bei unknown dieses Buch/diesen Empfänger lesen, nicht wiederholen.'};
 }catch{return {outcome:'unknown',verified:false,account:a.expectedAccount,addressBookPath:a.addressBookPath,recipientId:a.recipientId,writeStatus:status,atomic:false,note:'Freigabeänderung nicht vollständig bestätigt. Diese Buch-/Empfängerkennung lesen; nicht wiederholen.'};}
}
async function deletion(a:Ref){const state=await snapshot(a),home=await readContactBookSettings();if(!('entries'in home)||home.account!==a.expectedAccount||!home.ownHome||!home.entries.includes(a.addressBookPath)||!home.privileges.some(p=>['all','write','unbind'].includes(p)))throw Error('Eigenes Heimbereich-Entfernungsrecht nicht bestätigt.');const version=await planningVersion({version:state.version,homeVersion:home.version});return {...state,home,deleteVersion:version};}
export async function prepareContactBookDeletion(a:Ref){const s=await deletion(a);return {account:a.expectedAccount,addressBookPath:a.addressBookPath,title:s.book.title,contactCount:s.children.length,contacts:s.children,shares:s.shares,version:s.deleteVersion,ready:true,atomic:false,note:'Nur Löschvorschau: eigenes gesamtes Adressbuch einschließlich aller aufgelisteten Kontakte und direkten Freigaben dauerhaft entfernen. Nativer Adressbuch-DELETE bietet keinen zugesagten Papierkorb-/Wiederherstellungsweg. Kein Kontakttext geladen. Vor Ausführung Umfang ausdrücklich bestätigen; keine atomare Versionsbedingung für das ganze Buch.'};}
export async function deleteContactBook(a:Ref&{expectedDeleteVersion:string;acknowledgeContents:true;acknowledgeShares:true;acknowledgeNoRestore:true}){
 if(a.acknowledgeContents!==true||a.acknowledgeShares!==true||a.acknowledgeNoRestore!==true)throw Error('Gesamten Kontakt-/Freigabeumfang und fehlenden zugesagten Rückweg ausdrücklich bestätigen.');
 const before=await deletion(a);if(before.deleteVersion!==a.expectedDeleteVersion||(await deletion(a)).deleteVersion!==before.deleteVersion)throw Error('Löschvorschau verändert. Neu prüfen.');
 let accepted=false,status:number|null=null;try{const r=await davFetch(a.addressBookPath,{method:'DELETE'});status=r.status;accepted=status===204;await r.body?.cancel();}catch{}
 let absent=false,othersPreserved=false,accountVerified=false;try{
  const after=await readContactBookSettings();accountVerified=after.account===a.expectedAccount;if(!('entries'in after))throw Error();
  absent=!after.entries.includes(a.addressBookPath);const stable=(b:any)=>Object.fromEntries(Object.entries(b).filter(([k])=>!['version','ctag','syncToken'].includes(k)));
  othersPreserved=await same(before.home.entries.filter(p=>p!==a.addressBookPath),after.entries)&&await same(before.home.books.filter(b=>b.path!==a.addressBookPath).map(stable),after.books.map(stable));
  const r=await davFetch(a.addressBookPath,{method:'PROPFIND',headers:{Depth:'0','Content-Type':'application/xml'},body:'<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'});absent=absent&&r.status===404;await r.body?.cancel();accountVerified=accountVerified&&(await nextcloudIdentity()).uid===a.expectedAccount;
 }catch{}
 const verified=accepted&&absent&&othersPreserved&&accountVerified;return {outcome:verified?'verified':'unknown',verified,account:a.expectedAccount,addressBookPath:a.addressBookPath,removedContactCount:verified?before.children.length:null,removedDirectShareCount:verified?before.shares.length:null,writeStatus:status,absent,othersPreserved,accountVerified,atomic:false,note:'Ein nativer Adressbuch-DELETE nach zweimaliger Umfangsprüfung; kein atomarer Schutz vor parallelen Neuanlagen. Kontakte und Freigaben im Buch betroffen, kein zugesagter Wiederherstellungsweg. Bei unknown genau diesen Buchpfad und Heimbereich lesen; nicht wiederholen oder neu anlegen.'};
}
