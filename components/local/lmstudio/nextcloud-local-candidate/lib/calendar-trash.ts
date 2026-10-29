// SPDX-License-Identifier: AGPL-3.0-or-later
import {nextcloudAccount,safeDavPath,parseDav} from './nextcloud-read';
import {calendarRequest} from './calendar-settings';
import {planningVersion} from './planning-json';
const text=(v:any):string=>typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
export async function calendarTrashMetadata(account:Awaited<ReturnType<typeof nextcloudAccount>>){
 const path=account.calendarHome+'trashbin/objects/',root=await calendarRequest(path,'PROPFIND','<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>','0');
 if(root.status!==207)throw Error('Kalenderpapierkorb nicht bestätigt.');const rootRows=parseDav(root.text);if(rootRows.length!==1||safeDavPath(rootRows[0].href,path)!==path||!Object.hasOwn(rootRows[0].props.resourcetype??{},'collection'))throw Error('Papierkorbsammlung nicht bestätigt.');
 // Native DeletedCalendarObjectsCollection.getChildren() is NotImplemented.
 // Its calendarQuery() returns the complete visible trash, ignoring filters.
 const r=await calendarRequest(path,'REPORT','<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:n="http://nextcloud.com/ns"><d:prop><d:resourcetype/><d:getetag/><n:deleted-at/><n:calendar-uri/><n:source-calendar-uri/><n:calendar-owner-principal-uri/><n:delegator/></d:prop><c:filter><c:comp-filter name="VCALENDAR"/></c:filter></c:calendar-query>','1');
 if(r.status!==207)throw Error('Kalenderpapierkorb nicht vollständig bestätigt.');const rows=parseDav(r.text);if(rows.length>1000)throw Error('Mehr als1000 sichtbare Kalenderpapierkorbeinträge.');
 const seen=new Set<string>(),objects:{path:string;etag:string;deletedAt:string;calendarUri:string;sourceCalendarUri:string}[]=[];
 const nativePrincipal=account.principal.slice(account.principal.indexOf('principals/users/')).replace(/\/$/,'');
 for(const row of rows){const p=safeDavPath(row.href,path);if(seen.has(p))throw Error('Doppelte Papierkorbkennung.');seen.add(p);if(!p.slice(path.length)||p.slice(path.length).includes('/')||Object.keys(row.props.resourcetype??{}).length)throw Error('Ungültiger Papierkorbumfang.');
  const owner=text(row.props['calendar-owner-principal-uri']).replace(/\/$/,''),delegator=text(row.props.delegator);if(!owner)throw Error('Papierkorbeigentümer nicht bestätigt.');
  // Do not offer shared/delegated trash as if it belonged to this identity.
  if(![account.principal.replace(/\/$/,''),nativePrincipal].includes(owner)||delegator)continue;
  const etag=text(row.props.getetag),deletedAt=text(row.props['deleted-at']),calendarUri=text(row.props['calendar-uri']),sourceCalendarUri=text(row.props['source-calendar-uri']);
  if(!etag||etag.length>255||/[\x00-\x20\x7f]/.test(etag)||!deletedAt||!Number.isFinite(Date.parse(deletedAt))||!calendarUri||/[\/\\\x00-\x1f\x7f]/.test(calendarUri)||!sourceCalendarUri||sourceCalendarUri!==calendarUri)throw Error('Eigene Papierkorbidentität, Originalkalender oder Version nicht eindeutig.');
  objects.push({path:p,etag,deletedAt,calendarUri,sourceCalendarUri});
 }
 objects.sort((a,b)=>a.path.localeCompare(b.path));return {path,objects,version:await planningVersion(objects)};
}
