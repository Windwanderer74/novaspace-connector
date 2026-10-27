// SPDX-License-Identifier: AGPL-3.0-or-later
import {groupwareTarget,groupwareProps,readGroupwareObject,assertGroupwareWrite,strongGroupwareEtag} from './groupware-dav';
import {contactSummary} from './contacts';
import {planningVersion} from './planning-json';
import {davFetch,parseDav,readBody,safeDavPath,nextcloudIdentity,fileMetadata} from './nextcloud-read';
import {singleComponent,replaceProperties,propertyName,propertyValue,unfoldGroupware,utcGroupwareStamp} from './groupware-codec';
import {readVerifiedImage} from './attachment-files';
import {writeGroupwareObject} from './groupware-dav';

type Ref={addressBookPath:string;contactPath:string};
type Bound=Ref&{expectedAccount:string;expectedUid:string;etag:string};
export const CONTACT_PHOTO_LIMIT=128*1024;
const unknown='Ergebnis nicht vollständig bestätigt. Bekannte Kontaktkennung lesen; nicht automatisch wiederholen.';
async function snapshot(a:Ref){
 const target=await groupwareTarget('contacts',a.addressBookPath,a.contactPath),card=await readGroupwareObject(target,'contacts');
 if(!card.found)throw Error('Kontakt fehlt.');
 const summary=contactSummary(card.body);if(!summary.editable||!('uid'in summary))throw Error('Eindeutige vCard3/4 erforderlich.');
 return {target,card,summary};
}
function bound(a:Bound,c:Awaited<ReturnType<typeof snapshot>>){
 strongGroupwareEtag(a.etag);
 if(c.target.account!==a.expectedAccount||c.card.etag!==a.etag||c.summary.uid!==a.expectedUid)throw Error('Kontaktkonto, UID oder ETag verändert. Neu lesen.');
}
async function favoriteState(c:Awaited<ReturnType<typeof snapshot>>){
 const rows=await groupwareProps(c.target.path!,'<d:getetag/><n:favorite xmlns:n="http://nextcloud.com/ns"/>');
 if(rows.length!==1||safeDavPath(rows[0].href,c.target.collection)!==c.target.path||rows[0].props.getetag!==c.card.etag)throw Error('Kontaktmetadaten nicht eindeutig oder verändert.');
 const raw=rows[0].props.favorite;
 if(raw!==undefined&&!['','0','1',0,1,false,true].includes(raw))throw Error('Unbekannter nativer Favoritenwert.');
 const favorite=raw==='1'||raw===1||raw===true;
 return {favorite,version:await planningVersion({account:c.target.account,path:c.target.path,uid:c.summary.uid,etag:c.card.etag,body:c.card.body,favorite,privileges:c.target.privileges})};
}
export async function readContactOptions(a:Ref){
 const c=await snapshot(a),state=await favoriteState(c),last=await snapshot(a);
 if(last.target.account!==c.target.account||last.card.etag!==c.card.etag||last.card.body!==c.card.body)throw Error('Kontakt während Metadatenabruf verändert.');
 return {account:c.target.account,addressBookPath:a.addressBookPath,contactPath:a.contactPath,uid:c.summary.uid,etag:c.card.etag,...state,photoPresent:c.summary.photoPresent,atomic:false,note:'Favorit ist die native kontobezogene DAV-Eigenschaft, keine Kontaktgruppe. Version vor Änderungen erneut prüfen; keine atomare Metadatenbedingung.'};
}
export async function setContactFavorite(a:Bound&{expectedMetadataVersion:string;favorite:boolean}){
 let c=await snapshot(a);bound(a,c);
 if(c.target.systemDerived||!c.target.privileges.some(p=>['all','write','write-properties'].includes(p)))throw Error('Natives Metadaten-Schreibrecht erforderlich; Systembestand bleibt geschützt.');
 const state=await favoriteState(c);if(state.version!==a.expectedMetadataVersion)throw Error('Favoritenmetadaten verändert. Neu lesen.');
 if(state.favorite===a.favorite)return {outcome:'unchanged',verified:true,account:c.target.account,favorite:a.favorite,atomic:false};
 c=await snapshot(a);bound(a,c);if((await favoriteState(c)).version!==state.version)throw Error('Kontaktmetadaten inzwischen verändert.');
 const node=a.favorite?'<n:favorite xmlns:n="http://nextcloud.com/ns">1</n:favorite>':'<n:favorite xmlns:n="http://nextcloud.com/ns"/>',operation=a.favorite?'set':'remove';
 try{
  const r=await davFetch(c.target.path!,{method:'PROPPATCH',headers:{'If-Match':a.etag,'Content-Type':'application/xml; charset=utf-8'},body:`<d:propertyupdate xmlns:d="DAV:"><d:${operation}><d:prop>${node}</d:prop></d:${operation}></d:propertyupdate>`});
  if(r.status!==207){await r.body?.cancel();throw Error();}
  const rows=parseDav(await readBody(r,64*1024));
  if(rows.length!==1||safeDavPath(rows[0].href,c.target.collection)!==c.target.path||!Object.hasOwn(rows[0].props,'favorite'))throw Error();
  const after=await snapshot(a),meta=await favoriteState(after);
  const verified=after.target.account===c.target.account&&after.summary.uid===c.summary.uid&&after.card.body===c.card.body&&meta.favorite===a.favorite;
  return {outcome:verified?'verified':'unknown',verified,account:c.target.account,contactPath:a.contactPath,favorite:meta.favorite,version:meta.version,etag:after.card.etag,atomic:false,note:verified?'Nur native Favoriteneigenschaft gesetzt; vCard vollständig erhalten.':unknown};
 }catch{return {outcome:'unknown',verified:false,account:c.target.account,contactPath:a.contactPath,atomic:false,note:unknown};}
}
function photoProperties(body:string){const p=singleComponent(body,'VCARD'),photos=p.indices.map(i=>p.lines[i]).filter(l=>propertyName(l)==='PHOTO');if(photos.length>1)throw Error('Mehrere Kontaktbilder: zuerst nativ klären.');return {p,photos};}
function base64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function imageMime(bytes:Uint8Array){
 const starts=(a:number[])=>a.every((n,i)=>bytes[i]===n),text=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));
 return starts([137,80,78,71,13,10,26,10])?'image/png':starts([255,216,255])?'image/jpeg':['GIF87a','GIF89a'].includes(text(0,6))?'image/gif':text(0,4)==='RIFF'&&text(8,12)==='WEBP'?'image/webp':null;
}
function embeddedPhoto(line:string){
 const header=line.slice(0,line.length-propertyValue(line).length-1),value=propertyValue(line);let mime:string|undefined,data:string;
 const uri=/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value);
 if(uri){mime=uri[1].toLowerCase();data=uri[2];}
 else if(/;ENCODING=(?:b|BASE64)(?:;|$)/i.test(header)){
  const type=/;TYPE=(PNG|JPEG|JPG|GIF|WEBP)(?:;|$)/i.exec(header)?.[1]?.toLowerCase();mime=type?'image/'+(type==='jpg'?'jpeg':type):undefined;data=value;
 }else throw Error('Nur eingebettete Kontaktbilder lesen; externe Foto-URLs bleiben unaufgerufen.');
 if(data.length>4*Math.ceil(CONTACT_PHOTO_LIMIT/3)||!data||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('Ungültiges oder zu großes eingebettetes Bild; Grenze128KiB.');
 const binary=atob(data);if(btoa(binary)!==data)throw Error('Bildkodierung nicht eindeutig.');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),detected=imageMime(bytes);
 if(bytes.length>CONTACT_PHOTO_LIMIT||!detected||mime&&mime!==detected)throw Error('Bildinhalt, Typ oder Größe nicht bestätigt.');
 return {bytes,mimeType:detected,data};
}
export async function readContactPhoto(a:Bound){
 const c=await snapshot(a);bound(a,c);const {photos}=photoProperties(c.card.body);
 if(!photos.length)return {metadata:{account:c.target.account,contactPath:a.contactPath,uid:a.expectedUid,etag:a.etag,present:false,verified:true}};
 const photo=embeddedPhoto(photos[0]),last=await snapshot(a);bound(a,last);if(last.card.body!==c.card.body)throw Error('Kontaktbild während Abruf verändert.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',photo.bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 return {image:{type:'image' as const,mimeType:photo.mimeType,data:photo.data},metadata:{account:c.target.account,contactPath:a.contactPath,uid:a.expectedUid,etag:a.etag,present:true,size:photo.bytes.length,sha256,verified:true,externalFetch:false}};
}
export async function setContactPhoto(a:Bound&{sourcePath:string;fileId:string;sourceEtag:string;acknowledgeContactReaders:true}){
 if(a.acknowledgeContactReaders!==true)throw Error('Lesbarkeit des Bildes für Kontaktleser ausdrücklich bestätigen.');
 const c=await snapshot(a);bound(a,c);assertGroupwareWrite(c.target,'update');const {p,photos}=photoProperties(c.card.body);
 const account=await nextcloudIdentity();if(account.uid!==a.expectedAccount)throw Error('Kontowechsel.');
 const source=await fileMetadata(account,a.sourcePath);if(source?.size===null||!source||source.size>CONTACT_PHOTO_LIMIT)throw Error('Kontaktbild bis128KiB erforderlich.');
 const image=await readVerifiedImage(account,a.sourcePath,a.fileId,a.sourceEtag),data=base64(image.bytes);
 if(image.size>CONTACT_PHOTO_LIMIT)throw Error('Kontaktbild größer als128KiB.');
 const line=c.summary.version==='4.0'?`PHOTO;VALUE=uri:data:${image.mimeType};base64,${data}`:`PHOTO;ENCODING=b;TYPE=${image.mimeType.slice(6).toUpperCase()}:${data}`;
 const last=await snapshot(a);bound(a,last);assertGroupwareWrite(last.target,'update');if(last.card.body!==c.card.body)throw Error('Kontakt inzwischen verändert.');
 if(photos[0]===line)return {outcome:'unchanged',verified:true,account:a.expectedAccount,contactPath:a.contactPath};
 const body=replaceProperties(p,new Map([['PHOTO',[line]],['REV',['REV:'+utcGroupwareStamp()]]]));unfoldGroupware(body);
 const written=await writeGroupwareObject(last.target,'contacts',a.etag,body),now=await fileMetadata(account,a.sourcePath);
 const sourcePreserved=now?.fileId===a.fileId&&now.etag===a.sourceEtag&&now.permissions.includes('G')&&!now.downloadDenied;
 return {...written,verified:written.verified&&sourcePreserved,sourcePreserved,photoSha256:image.sha256,note:written.verified&&sourcePreserved?'Gewähltes Bild in vCard eingebettet; Originaldatei und andere Eigenschaften erhalten.':unknown};
}
export async function removeContactPhoto(a:Bound&{acknowledgeRemove:true}){
 if(a.acknowledgeRemove!==true)throw Error('Gezieltes Entfernen des Kontaktbildes bestätigen.');
 const c=await snapshot(a);bound(a,c);assertGroupwareWrite(c.target,'update');const {p,photos}=photoProperties(c.card.body);
 if(!photos.length)return {outcome:'unchanged',verified:true,account:a.expectedAccount,contactPath:a.contactPath};
 const last=await snapshot(a);bound(a,last);assertGroupwareWrite(last.target,'update');if(last.card.body!==c.card.body)throw Error('Kontakt inzwischen verändert.');
 return writeGroupwareObject(last.target,'contacts',a.etag,replaceProperties(p,new Map([['PHOTO',[]],['REV',['REV:'+utcGroupwareStamp()]]])));
}
