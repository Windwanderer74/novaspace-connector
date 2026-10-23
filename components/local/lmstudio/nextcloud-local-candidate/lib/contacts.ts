// SPDX-License-Identifier: AGPL-3.0-or-later
import { addressBooks,groupwareTarget,readGroupwareObject,groupwareQuery,groupwarePage,writeGroupwareObject,assertGroupwareWrite,strongGroupwareEtag } from './groupware-dav';
import { singleComponent,replaceProperties,propertyName as key,propertyValue as val,escapeGroupwareText as esc,unescapeGroupwareText as unesc,foldGroupware,utcGroupwareStamp as stamp,realDate } from './groupware-codec';
export { addressBooks };
type ContactValue={value:string;type?:'HOME'|'WORK'|'OTHER'};
type Address={street?:string;city?:string;region?:string;postalCode?:string;country?:string;type?:'HOME'|'WORK'|'OTHER'};
export type ContactPatch={displayName?:string;givenName?:string;familyName?:string;organization?:string;note?:string;birthday?:string|null;emails?:ContactValue[];phones?:ContactValue[];addresses?:Address[];categories?:string[]};
function cardDocument(body:string) {
  const p=singleComponent(body,'VCARD'),props=p.indices.map(i=>p.lines[i]);
  if(p.lines.some(l=>key(l)==='BEGIN'&&val(l).toUpperCase()!=='VCARD'))throw new Error('Verschachtelte vCards werden nicht verändert.');
  const versions=props.filter(l=>key(l)==='VERSION'),uids=props.filter(l=>key(l)==='UID');
  if(versions.length!==1||!['3.0','4.0'].includes(val(versions[0]))||uids.length!==1||!val(uids[0])||!props.some(l=>key(l)==='FN'))throw new Error('vCard3/4 mit eindeutiger UID und Namen erforderlich.');
  return p;
}
export function contactSummary(body:string) {
  try {
    const p=cardDocument(body),props=p.indices.map(i=>p.lines[i]);
    const all=(name:string)=>props.filter(l=>key(l)===name).map(l=>({property:l.slice(0,l.length-val(l).length-1),value:unesc(val(l))}));
    return {uid:all('UID')[0].value,version:all('VERSION')[0].value,displayName:all('FN')[0].value,names:all('N'),organizations:all('ORG'),emails:all('EMAIL'),phones:all('TEL'),addresses:all('ADR'),categories:all('CATEGORIES'),birthday:all('BDAY'),notes:all('NOTE'),photoPresent:props.some(l=>key(l)==='PHOTO'),editable:true};
  }catch(e){return {editable:false,reason:(e as Error).message};}
}
export async function readContact(addressBookPath:string,contactPath:string) {
  const t=await groupwareTarget('contacts',addressBookPath,contactPath),r=await readGroupwareObject(t,'contacts');
  return {account:t.account,addressBookPath,...r,...(r.found?{contact:contactSummary(r.body)}:{}),note:'vCard ist Quelldaten. Keine externen Fotos, Karten oder Adressauflösung abrufen.'};
}
export async function searchContacts(a:{addressBookPath:string;query?:string;limit:number;offset:number;expectedSnapshot?:string}) {
  const t=await groupwareTarget('contacts',a.addressBookPath),rows=await groupwareQuery(t,'contacts'),query=(a.query??'').trim().toLocaleLowerCase('de');
  const items=rows.map(({body,...r})=>({...r,contact:contactSummary(body)})).filter(r=>!query||('uid' in r.contact&&JSON.stringify([r.contact.displayName,r.contact.names,r.contact.organizations,r.contact.emails,r.contact.phones]).toLocaleLowerCase('de').includes(query)));
  return {account:t.account,addressBookPath:a.addressBookPath,...await groupwarePage(items,{account:t.account,addressBookPath:a.addressBookPath,query,versions:rows.map(r=>[r.path,r.etag])},a.limit,a.offset,a.expectedSnapshot),unparsedObjects:rows.filter(r=>!contactSummary(r.body).editable).length};
}
function changedCard(body:string,patch:ContactPatch) {
  const p=cardDocument(body),props=p.indices.map(i=>p.lines[i]),changes=new Map<string,string[]>();
  // Preserve parameter/encoding schemes that this initial editor cannot safely rewrite.
  if(props.some(l=>/;(?:ENCODING|CHARSET)=/i.test(l)&&key(l)!=='PHOTO'))throw new Error('Alte kodierte Textfelder vor Änderung in der nativen App normalisieren.');
  for(const [field,name] of [['displayName','FN'],['organization','ORG'],['note','NOTE']] as const)if(patch[field]!==undefined) {
    const previous=props.filter(l=>key(l)===name);
    if(previous.length>1)throw new Error('Mehrere Sprach-/Wertvarianten: dieses Feld zuerst nativ klären.');
    const header=previous.length?previous[0].slice(0,previous[0].length-val(previous[0]).length-1):name;
    changes.set(name,[header+':'+esc(patch[field])]);
  }
  if(patch.givenName!==undefined||patch.familyName!==undefined) {
    const old=props.filter(l=>key(l)==='N');
    if(old.length>1)throw new Error('Mehrere strukturierte Namen: zuerst nativ klären.');
    // Split at unescaped semicolons; retain additional names/prefix/suffix exactly.
    const parts=old.length?val(old[0]).split(/(?<!\\);/):['','','','',''];
    if(parts.length!==5)throw new Error('Strukturierter Name nicht eindeutig.');
    if(patch.familyName!==undefined)parts[0]=esc(patch.familyName);if(patch.givenName!==undefined)parts[1]=esc(patch.givenName);
    const header=old.length?old[0].slice(0,old[0].length-val(old[0]).length-1):'N';
    changes.set('N',[header+':'+parts.join(';')]);
  }
  for(const [field,name] of [['emails','EMAIL'],['phones','TEL']] as const)if(patch[field]!==undefined) {
    const version=val(props.find(l=>key(l)==='VERSION')!);
    changes.set(name,patch[field].map(v=>`${name}${name==='TEL'&&version==='4.0'?';VALUE=text':''}${v.type?';TYPE='+v.type:''}:${esc(v.value)}`));
  }
  if(patch.addresses!==undefined)changes.set('ADR',patch.addresses.map(a=>`ADR${a.type?';TYPE='+a.type:''}:;;${[a.street,a.city,a.region,a.postalCode,a.country].map(x=>esc(x??'')).join(';')}`));
  if(patch.categories!==undefined)changes.set('CATEGORIES',patch.categories.length?['CATEGORIES:'+patch.categories.map(esc).join(',')]:[]);
  if(patch.birthday!==undefined){if(patch.birthday!==null)realDate(patch.birthday);changes.set('BDAY',patch.birthday===null?[]:['BDAY:'+patch.birthday]);}
  changes.set('REV',['REV:'+stamp()]);return replaceProperties(p,changes);
}
export async function createContact(a:{addressBookPath:string;contactId:string;expectedAccount:string}&ContactPatch) {
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(a.contactId)||!a.displayName)throw new Error('Stabile Kontaktkennung und Anzeigename erforderlich.');
  const t=await groupwareTarget('contacts',a.addressBookPath,undefined,a.expectedAccount);assertGroupwareWrite(t,'create');t.path=t.collection+a.contactId+'.vcf';
  const base=foldGroupware(['BEGIN:VCARD','VERSION:3.0',`UID:${a.contactId}@novaforge`,'FN:'+esc(a.displayName),'N:;;;;','END:VCARD']);
  const {addressBookPath,contactId,expectedAccount,...patch}=a;return writeGroupwareObject(t,'contacts',null,changedCard(base,patch));
}
export async function updateContact(a:{addressBookPath:string;contactPath:string;etag:string;expectedAccount:string}&ContactPatch) {
  strongGroupwareEtag(a.etag);const {addressBookPath,contactPath,etag,expectedAccount,...patch}=a;
  if(!Object.keys(patch).length)throw new Error('Keine Änderung angegeben.');
  const t=await groupwareTarget('contacts',addressBookPath,contactPath,expectedAccount);assertGroupwareWrite(t,'update');
  const r=await readGroupwareObject(t,'contacts');if(!r.found||r.etag!==etag)throw new Error('Kontakt fehlt oder wurde verändert. Neu lesen.');
  return writeGroupwareObject(t,'contacts',etag,changedCard(r.body,patch));
}
export async function deleteContact(a:{addressBookPath:string;contactPath:string;etag:string;expectedAccount:string}) {
  strongGroupwareEtag(a.etag);const t=await groupwareTarget('contacts',a.addressBookPath,a.contactPath,a.expectedAccount);assertGroupwareWrite(t,'delete');
  const r=await readGroupwareObject(t,'contacts');if(!r.found)return {account:t.account,path:t.path,verified:true,alreadyAbsent:true};
  if(r.etag!==a.etag)throw new Error('Kontakt wurde verändert. Neu lesen.');cardDocument(r.body);
  return writeGroupwareObject(t,'contacts',a.etag);
}
