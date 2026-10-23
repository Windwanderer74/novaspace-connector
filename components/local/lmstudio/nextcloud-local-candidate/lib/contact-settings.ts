// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudIdentity,davFetch,parseDav,safeDavPath,readBody} from './nextcloud-read';
import {groupwareProps} from './groupware-dav';
import {xmlText} from './groupware-codec';
import {planningVersion} from './planning-json';

type Account=Awaited<ReturnType<typeof nextcloudIdentity>>;
const many=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
const text=(v:any):string=>typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
const ns='xmlns:d="DAV:" xmlns:a="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/"';
const props='<d:resourcetype/><d:displayname/><d:owner/><d:current-user-privilege-set/><d:sync-token/><cs:getctag/><a:addressbook-description/>';
const privileges=(p:any)=>many(p['current-user-privilege-set']?.privilege).flatMap(v=>Object.keys(v)).sort();
export async function contactHome(account:Account){
 const base=account.filesHome.slice(0,account.filesHome.lastIndexOf('/files/'))+'/';
 const rows=await groupwareProps(account.principal,'<a:addressbook-home-set/>');
 if(rows.length!==1||safeDavPath(rows[0].href,base)!==account.principal)throw Error('CardDAV-Prinzipal nicht bestätigt.');
 const home=safeDavPath(text(rows[0].props['addressbook-home-set']?.href),base+'addressbooks/');
 if(!home.endsWith('/'))throw Error('Adressbuchverzeichnis nicht bestätigt.');
 return {home,base,own:home===base+'addressbooks/users/'+encodeURIComponent(account.uid)+'/'};
}
export function contactBookPath(home:string,input:string){
 const p=safeDavPath(input,home);
 if(!p.endsWith('/')||!/^[^/]+\/$/.test(p.slice(home.length)))throw Error('Direkte Adressbuchkennung aus Kontakteübersicht erforderlich.');
 return p;
}
async function propfind(path:string,depth:string){
 const r=await davFetch(path,{method:'PROPFIND',headers:{Depth:depth,'Content-Type':'application/xml; charset=utf-8'},body:`<d:propfind ${ns}><d:prop>${props}</d:prop></d:propfind>`});
 if(r.status!==207){await r.body?.cancel();throw Error(`Adressbucheigenschaften: HTTP ${r.status}.`);}
 return parseDav(await readBody(r,2*1024*1024));
}
function normalize(account:Account,home:string,base:string,row:any){
 const p=row.props,path=contactBookPath(home,row.href),owner=text(p.owner?.href);
 let ownedByAccount=false;try{ownedByAccount=safeDavPath(owner,base+'principals/users/').replace(/\/$/,'')===account.principal.replace(/\/$/,'');}catch{}
 return {path,title:text(p.displayname),description:text(p['addressbook-description']),owner,ownedByAccount,privileges:privileges(p),resourceTypes:Object.keys(p.resourcetype??{}).sort(),systemDerived:/\/(?:system|z-server-generated--system)(?:--[^/]*)?\/$/.test(path),syncToken:text(p['sync-token']),ctag:text(p.getctag)};
}
export async function readContactBookAt(account:Account,input:string){
 const {home,base}=await contactHome(account),path=contactBookPath(home,input),rows=await propfind(path,'0');
 if(rows.length!==1||safeDavPath(rows[0].href,home)!==path||!Object.hasOwn(rows[0].props.resourcetype??{},'addressbook'))throw Error('Kein eindeutiges natives Adressbuch.');
 const book=normalize(account,home,base,rows[0]);return {...book,version:await planningVersion(book)};
}
export async function readContactBookSettings(input?:string){
 const account=await nextcloudIdentity();
 if(input!==undefined)return {account:account.uid,book:await readContactBookAt(account,input),atomic:false};
 const {home,base,own}=await contactHome(account),rows=await propfind(home,'1');
 if(rows.length>201)throw Error('Mehr als200 Adressbucheinträge.');
 const seen=new Set<string>(),entries:string[]=[],books:Awaited<ReturnType<typeof readContactBookAt>>[]=[];let homeProps:any;
 for(const row of rows){const path=safeDavPath(row.href,home);if(seen.has(path))throw Error('Doppelte Adressbuchkennung.');seen.add(path);if(path===home){homeProps=row.props;continue;}contactBookPath(home,path);entries.push(path);if(Object.hasOwn(row.props.resourcetype??{},'addressbook')){const b=normalize(account,home,base,row);books.push({...b,version:await planningVersion(b)});}}
 if(!homeProps||!Object.hasOwn(homeProps.resourcetype??{},'collection'))throw Error('Adressbuchverzeichnis nicht bestätigt.');
 entries.sort();books.sort((a,b)=>a.path.localeCompare(b.path));
 const collection={addressBookHome:home,ownHome:own,privileges:privileges(homeProps),entries,books};
 return {account:account.uid,...collection,version:await planningVersion(collection),atomic:false,note:'Nur Eigenschaften und sichtbare Kennungen. Neue Adressbücher gehören dem technischen Konto. Keine Freigaben oder Kontakte geändert; Metadatenversion ist keine atomare Schreibbedingung.'};
}
export function ownContactBook(book:Awaited<ReturnType<typeof readContactBookAt>>,operation:'create'|'metadata'){
 if(!book.ownedByAccount||book.systemDerived||book.resourceTypes.some(t=>!['collection','addressbook'].includes(t))||!book.privileges.some(p=>['all','read'].includes(p))||!book.privileges.some(p=>['all','write',operation==='create'?'bind':'write-properties'].includes(p))||!book.ctag&&!book.syncToken)throw Error('Eigenes reguläres Adressbuch mit Lese-/Schreibrecht und Änderungskennung erforderlich.');
}
type Patch={title?:string;description?:string};
function patchXml(patch:Patch){
 for(const [key,v]of Object.entries(patch))if(!['title','description'].includes(key)||typeof v!=='string'||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)||new TextDecoder().decode(new TextEncoder().encode(v))!==v||v.length>(key==='title'?255:4000)||key==='title'&&!v.trim())throw Error('Ungültige Adressbucheigenschaft.');
 return Object.entries(patch).map(([k,v])=>`<${k==='title'?'d:displayname':'a:addressbook-description'}>${xmlText(v)}</${k==='title'?'d:displayname':'a:addressbook-description'}>`).join('');
}
const matches=(b:any,p:Patch)=>Object.entries(p).every(([k,v])=>b[k]===v);
async function mutation(path:string,method:string,body:string){
 const r=await davFetch(path,{method,body,headers:{'Content-Type':'application/xml; charset=utf-8',...(method==='MKCOL'?{'If-None-Match':'*'}:{})}});
 return {status:r.status,text:await readBody(r,2*1024*1024)};
}
export async function createContactBook(a:Patch&{addressBookId:string;title:string;expectedAccount:string;expectedCollectionVersion:string}){
 const {addressBookId,expectedAccount,expectedCollectionVersion,...patch}=a;
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(addressBookId)||/^(?:system|z-server-generated--system)(?:--|$)/.test(addressBookId))throw Error('Stabile nicht reservierte Adressbuchkennung8–80 Zeichen erforderlich.');
 const xml=patchXml(patch),account=await nextcloudIdentity(),before=await readContactBookSettings();
 if(account.uid!==expectedAccount||before.account!==expectedAccount||!('books'in before)||before.version!==expectedCollectionVersion)throw Error('Konto oder Adressbuchverzeichnis verändert. Ohne Pfad neu lesen.');
 if(!before.ownHome||!before.privileges.some(p=>['all','write','bind'].includes(p)))throw Error('Eigenes Adressbuchverzeichnis mit nativem Anlagerecht erforderlich.');
 const path=contactBookPath(before.addressBookHome,before.addressBookHome+addressBookId+'/');
 if(before.entries.includes(path)||before.books.some(b=>b.title.toLocaleLowerCase('de')===a.title.toLocaleLowerCase('de')))throw Error('Adressbuchkennung oder gleichnamiges Adressbuch schon vorhanden.');
 const last=await readContactBookSettings();if(last.account!==expectedAccount||!('books'in last)||last.version!==before.version)throw Error('Adressbuchbestand inzwischen verändert.');
 try{
  const r=await mutation(path,'MKCOL',`<d:mkcol ${ns}><d:set><d:prop><d:resourcetype><d:collection/><a:addressbook/></d:resourcetype>${xml}</d:prop></d:set></d:mkcol>`);
  if(r.status!==201)throw Error();
  const after=await readContactBookSettings();if(!('books'in after))throw Error();const book=after.books.find(b=>b.path===path);
  const verified=after.account===expectedAccount&&book?.ownedByAccount===true&&!book.systemDerived&&book.resourceTypes.join(',')==='addressbook,collection'&&matches(book,patch)&&after.entries.length===before.entries.length+1&&before.entries.every(p=>after.entries.includes(p))&&await planningVersion(after.books.filter(b=>b.path!==path))===await planningVersion(before.books);
  return {outcome:verified?'verified':'unknown',verified,account:expectedAccount,addressBookPath:path,book:book??null,atomic:false};
 }catch{return {outcome:'unknown',verified:false,account:expectedAccount,addressBookPath:path,atomic:false,note:'Anlage nicht vollständig bestätigt. Genau diese Kennung lesen; nicht wiederholen oder Ersatzkennung wählen.'};}
}
export async function updateContactBook(a:Patch&{addressBookPath:string;expectedAccount:string;expectedVersion:string}){
 const {addressBookPath,expectedAccount,expectedVersion,...patch}=a,xml=patchXml(patch);
 if(!xml)throw Error('Keine Adressbucheigenschaft angegeben.');
 const account=await nextcloudIdentity();if(account.uid!==expectedAccount)throw Error('Kontowechsel: Adressbuchänderung gestoppt.');
 const before=await readContactBookAt(account,addressBookPath);ownContactBook(before,'metadata');
 if(before.version!==expectedVersion)throw Error('Adressbuch verändert. Eigenschaften neu lesen.');
 if(matches(before,patch))return {outcome:'unchanged',verified:true,account:expectedAccount,book:before,atomic:false};
 if((await nextcloudIdentity()).uid!==expectedAccount||(await readContactBookAt(account,addressBookPath)).version!==before.version)throw Error('Konto oder Adressbuch inzwischen verändert.');
 try{
  const r=await mutation(addressBookPath,'PROPPATCH',`<d:propertyupdate ${ns}><d:set><d:prop>${xml}</d:prop></d:set></d:propertyupdate>`);
  if(r.status!==207)throw Error();const rows=parseDav(r.text),keys=Object.keys(patch).map(k=>k==='title'?'displayname':'addressbook-description');
  if(rows.length!==1||safeDavPath(rows[0].href,(await contactHome(account)).home)!==addressBookPath||keys.some(k=>!Object.hasOwn(rows[0].props,k)))throw Error();
  const after=await readContactBookAt(account,addressBookPath),invariant=(b:any)=>Object.fromEntries(Object.entries(b).filter(([k])=>!['title','description','version','ctag','syncToken'].includes(k)));
  const verified=(await nextcloudIdentity()).uid===expectedAccount&&matches(after,patch)&&['title','description'].every(k=>Object.hasOwn(patch,k)||(after as any)[k]===(before as any)[k])&&await planningVersion(invariant(after))===await planningVersion(invariant(before));
  return {outcome:verified?'verified':'unknown',verified,account:expectedAccount,book:after,atomic:false,note:'Nur angegebene Metadaten gesetzt. Keine atomare Versionsbedingung; bei unknown Eigenschaften lesen, nicht automatisch wiederholen.'};
 }catch{return {outcome:'unknown',verified:false,account:expectedAccount,addressBookPath,atomic:false,note:'Änderung nicht vollständig bestätigt. Genau dieses Adressbuch lesen; nicht automatisch wiederholen.'};}
}
