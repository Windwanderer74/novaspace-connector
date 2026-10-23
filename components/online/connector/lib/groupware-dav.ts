// SPDX-License-Identifier: AGPL-3.0-or-later
import { davFetch,nextcloudIdentity,listCalendars,parseDav,readBody,safeDavPath } from './nextcloud-read';
import { xmlText,unfoldGroupware } from './groupware-codec';
import { planningVersion } from './planning-json';
const many=(x:any):any[]=>x===undefined?[]:Array.isArray(x)?x:[x];
const value=(x:any):string=>typeof x==='string'?x:typeof x?.['#text']==='string'?x['#text']:'';
export function strongGroupwareEtag(etag:string) {if(!/^"[^"\x00-\x20\x7f]+"$/.test(etag))throw new Error('Frischer starker ETag erforderlich.');return etag;}
export async function groupwareProps(path:string,props:string,depth='0') {
  const r=await davFetch(path,{method:'PROPFIND',headers:{Depth:depth,'Content-Type':'application/xml'},body:`<d:propfind xmlns:d="DAV:" xmlns:a="urn:ietf:params:xml:ns:carddav"><d:prop>${props}</d:prop></d:propfind>`});
  if(r.status!==207){await r.body?.cancel();throw new Error(`DAV-Eigenschaften: HTTP ${r.status}.`);}
  return parseDav(await readBody(r,2*1024*1024));
}
export async function taskLists() {
  const data=await listCalendars();
  return {account:data.account,lists:data.calendars.filter(c=>c.components.includes('VTODO')),note:'Auch abgeleitete Deck-Ansichten können erscheinen. Native Rechte gelten; keine automatische Kopie oder Synchronisation von Deckkarten.'};
}
export async function addressBooks() {
  const account=await nextcloudIdentity();
  const base=account.filesHome.slice(0,account.filesHome.lastIndexOf('/files/'))+'/';
  const principal=await groupwareProps(account.principal,'<a:addressbook-home-set/>');
  if(principal.length!==1||safeDavPath(principal[0].href,base)!==account.principal)throw new Error('Adressbuch-Identität nicht bestätigt.');
  const home=safeDavPath(value(principal[0].props['addressbook-home-set']?.href),base+'addressbooks/');
  if(!home.endsWith('/'))throw new Error('Ungültiges Adressbuchverzeichnis.');
  const rows=await groupwareProps(home,'<d:resourcetype/><d:displayname/><d:owner/><d:current-user-privilege-set/>','1');
  if(rows.length>201)throw new Error('Mehr als 200 Adressbücher: Auswahl zu groß.');
  const books=rows.filter(r=>Object.hasOwn(r.props.resourcetype??{},'addressbook')).map(r=>{
    const path=safeDavPath(r.href,home),privileges=many(r.props['current-user-privilege-set']?.privilege).flatMap(p=>Object.keys(p));
    if(!/^[^/]+\/$/.test(path.slice(home.length)))throw new Error('Adressbuch gehört nicht zum ermittelten Heimbereich.');
    return {path,title:value(r.props.displayname),owner:value(r.props.owner?.href),privileges,readable:privileges.includes('read')||privileges.includes('all'),systemDerived:/\/(?:system|z-server-generated--system)(?:--[^/]*)?\/$/.test(path)};
  });
  return {account:account.uid,books,note:'Nur für dieses Konto sichtbare Adressbücher. System-/geteilte Bestände nicht als frei beschreibbar voraussetzen. Keine externe Adressauflösung.'};
}
export type GroupwareTarget={account:string;collection:string;path?:string;privileges:string[];systemDerived?:boolean};
export async function groupwareTarget(kind:'tasks'|'contacts',collection:string,path?:string,expectedAccount?:string):Promise<GroupwareTarget> {
  const data=kind==='tasks'?await taskLists():await addressBooks();
  if(expectedAccount!==undefined&&data.account!==expectedAccount)throw new Error('Kontowechsel: Änderung gestoppt.');
  const lists='lists' in data?data.lists:data.books;
  const entry=lists.find(c=>c.path===collection);if(!entry)throw new Error('Gewählte Aufgabenliste oder gewähltes Adressbuch nicht sichtbar.');
  const object=path===undefined?undefined:safeDavPath(path,collection);
  if(object!==undefined&&(!object.slice(collection.length)||object.slice(collection.length).includes('/')))throw new Error('Genau eine direkte Objektkennung erforderlich.');
  return {account:data.account,collection,path:object,privileges:entry.privileges,...('systemDerived' in entry?{systemDerived:entry.systemDerived}:{})};
}
export function assertGroupwareWrite(t:GroupwareTarget,operation:'create'|'update'|'delete') {
  const required=operation==='create'?'bind':operation==='delete'?'unbind':'write-content';
  if(t.systemDerived||!t.privileges.some(p=>['all','write',required].includes(p)))throw new Error('Natives Schreibrecht fehlt oder abgeleiteter Systembestand ist schreibgeschützt.');
}
export async function readGroupwareObject(t:GroupwareTarget,kind:'tasks'|'contacts') {
  if(!t.path)throw new Error('Objektkennung fehlt.');
  const card=kind==='contacts',prefix=card?'a':'c',ns=card?'carddav':'caldav',type=card?'addressbook':'calendar',field=card?'address-data':'calendar-data';
  const r=await davFetch(t.collection,{method:'REPORT',headers:{Depth:'1','Content-Type':'application/xml'},body:`<${prefix}:${type}-multiget xmlns:d="DAV:" xmlns:${prefix}="urn:ietf:params:xml:ns:${ns}"><d:prop><d:getetag/><${prefix}:${field}/></d:prop><d:href>${xmlText(t.path)}</d:href></${prefix}:${type}-multiget>`});
  if(r.status!==207){await r.body?.cancel();throw new Error(`DAV-Einzelabruf: HTTP ${r.status}.`);}
  const rows=parseDav(await readBody(r,512*1024),true);
  if(rows.length===0) {
    const direct=await davFetch(t.path,{method:'GET',headers:{Accept:card?'text/vcard':'text/calendar','Accept-Encoding':'identity','Cache-Control':'no-cache'}});
    if(direct.status===404){await direct.body?.cancel();return {found:false as const,path:t.path};}
    if(direct.status!==200){await direct.body?.cancel();throw new Error(`DAV-Objektprüfung: HTTP ${direct.status}.`);}
    const etag=strongGroupwareEtag(direct.headers.get('etag')??''),body=await readBody(direct,256*1024);
    return {found:true as const,path:t.path,etag,body};
  }
  if(rows.length!==1||safeDavPath(rows[0].href,t.collection)!==t.path)throw new Error('Einzelabruf lieferte eine fremde oder mehrdeutige Kennung.');
  if(rows[0].missing)return {found:false as const,path:t.path};
  const body=rows[0].props[field],etag=rows[0].props.getetag;
  if(typeof body!=='string'||typeof etag!=='string'||new TextEncoder().encode(body).length>256*1024)throw new Error('Unvollständiges oder zu großes DAV-Objekt.');
  return {found:true as const,path:t.path,etag:strongGroupwareEtag(etag),body};
}
export async function groupwareQuery(t:GroupwareTarget,kind:'tasks'|'contacts') {
  const card=kind==='contacts',p=card?'a':'c',type=card?'addressbook':'calendar',ns=card?'carddav':'caldav',field=card?'address-data':'calendar-data';
  const filter=card?'<a:filter><a:prop-filter name="FN"/></a:filter>':'<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>';
  const r=await davFetch(t.collection,{method:'REPORT',headers:{Depth:'1','Content-Type':'application/xml'},body:`<${p}:${type}-query xmlns:d="DAV:" xmlns:${p}="urn:ietf:params:xml:ns:${ns}"><d:prop><d:getetag/><${p}:${field}/></d:prop>${filter}</${p}:${type}-query>`});
  if(r.status!==207){await r.body?.cancel();throw new Error(`DAV-Suche: HTTP ${r.status}; keine vollständige Ergebnisliste bestätigt.`);}
  const rows=parseDav(await readBody(r,2*1024*1024));
  if(rows.length>1000)throw new Error('Mehr als 1000 Objekte; keine vollständige Auswahl möglich.');
  const seen=new Set<string>();
  return rows.map(row=>{
    const path=safeDavPath(row.href,t.collection),body=row.props[field],etag=strongGroupwareEtag(value(row.props.getetag));
    if(!path.slice(t.collection.length)||path.slice(t.collection.length).includes('/')||seen.has(path)||typeof body!=='string'||new TextEncoder().encode(body).length>256*1024)throw new Error('Ungültiges oder doppeltes Suchobjekt.');
    seen.add(path);return {path,etag,body};
  }).sort((a,b)=>a.path.localeCompare(b.path));
}
export async function groupwarePage<T>(items:T[],binding:unknown,limit:number,offset:number,expectedSnapshot?:string) {
  const snapshot=await planningVersion({binding,items});
  if(offset>0&&!expectedSnapshot||expectedSnapshot&&expectedSnapshot!==snapshot)throw new Error('Auswahl verändert oder Seitennachweis fehlt. Bei Seite 1 beginnen.');
  return {items:items.slice(offset,offset+limit),total:items.length,snapshot,nextOffset:offset+limit<items.length?offset+limit:null,consistency:'Lokale Seiten aus begrenzter nativer Antwort; kein atomarer Gesamtsnapshot.'};
}
export async function writeGroupwareObject(t:GroupwareTarget,kind:'tasks'|'contacts',etag:string|null,body?:string) {
  if(!t.path)throw new Error('Objektkennung fehlt.');
  let r:Response;
  try { r=await davFetch(t.path,{method:body===undefined?'DELETE':'PUT',headers:{'Content-Type':kind==='contacts'?'text/vcard; charset=utf-8':'text/calendar; charset=utf-8',...(etag===null?{'If-None-Match':'*'}:{'If-Match':strongGroupwareEtag(etag)})},body}); }
  catch {throw new Error(`Schreibergebnis unbekannt für ${t.path}. Bekannte Kennung lesen, nicht blind wiederholen.`);}
  await r.body?.cancel();
  if(r.status===412)throw new Error('Versionskonflikt: neu lesen; keine automatische Wiederholung.');
  if(!(body===undefined?[200,204]:[201,204]).includes(r.status))throw new Error(`DAV-Schreibantwort HTTP ${r.status}; Ergebnis an der bekannten Kennung prüfen.`);
  try {
    const after=await readGroupwareObject(t,kind);
    return {account:t.account,collection:t.collection,writeAccepted:true,verified:body===undefined?!after.found:after.found&&JSON.stringify(unfoldGroupware(after.body))===JSON.stringify(unfoldGroupware(body)),...after};
  }catch {return {account:t.account,collection:t.collection,path:t.path,writeAccepted:true,verified:false,note:'Schreibantwort erfolgreich; Rücklesen nicht bestätigt. Bekannte Kennung prüfen, nicht wiederholen.'};}
}
