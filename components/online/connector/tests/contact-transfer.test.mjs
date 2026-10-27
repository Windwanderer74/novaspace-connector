// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export * from './lib/contact-settings';export * from './lib/contact-exchange';export * from './lib/mcp-contact-work';export * from './lib/contact-transfer';export * from './lib/mcp-contact-transfer';export {setDeckRuntimeConfig} from './lib/runtime-config';export {inheritedPolicy,withConnectionPolicy} from './lib/connection-policy';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/contact-transfer.mjs'});
const api=await import('../.sites-runtime/test/contact-transfer.mjs');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'fixture',NEXTCLOUD_APP_PASSWORD:'contact-fixture-secret',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',OAUTH_SIGNING_SECRET:'fixture-only-signing-12345678901234567890'});
const native=globalThis.fetch;after(()=>globalThis.fetch=native);
const principal='/remote.php/dav/principals/users/Soul/',home='/remote.php/dav/addressbooks/users/Soul/',bookPath=home+'contacts/',filesHome='/remote.php/dav/files/Soul',contactId='contact-import-one',contactPath=bookPath+contactId+'.vcf',originalPath=bookPath+'original.vcf',uid='unchanged-uid@example.test';
const enc=s=>new TextEncoder().encode(s),esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),unesc=s=>s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
const card=(extra=[],id=uid,version='3.0')=>['BEGIN:VCARD','VERSION:'+version,'UID:'+id,'FN:Arne Test','N:Test;Arne;;;','EMAIL;TYPE=HOME:arne@example.test','TEL;TYPE=WORK:+491234','X-CLIENT:keep',...extra,'END:VCARD',''].join('\r\n');
const row=(path,props)=>`<d:response><d:href>${esc(path)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi=s=>new Response(`<d:multistatus xmlns:d="DAV:" xmlns:a="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${s}</d:multistatus>`,{status:207});
const priv=r=>'<d:current-user-privilege-set>'+r.map(p=>`<d:privilege><d:${p}/></d:privilege>`).join('')+'</d:current-user-privilege-set>';
const file=(id,text)=>({id,bytes:enc(text),etag:'"f1"',rights:'GW',folder:false,denied:false});
let books,objects,files,calls,fault,homeRights,homeOverride,rootReads;
function reset(){books=new Map([[bookPath,{title:'Kontakte',description:'Behalten',owner:principal,rights:['read','write'],ctag:1,types:['collection','addressbook']}]]);objects=new Map();files=new Map([['/Import.vcf',file('9',card())],['/Exports',{id:'3',etag:'"folder"',rights:'GCKW',folder:true}]]);calls=[];fault=null;homeRights=['read','bind'];homeOverride=home;rootReads=0;}
const writes=()=>calls.filter(c=>['PUT','MKCOL','PROPPATCH','DELETE','MOVE','COPY','POST'].includes(c.method));
function bookRow(p,b){return row(p,`<d:resourcetype>${b.types.map(t=>t==='addressbook'?'<a:addressbook/>':'<d:collection/>').join('')}</d:resourcetype><d:displayname>${esc(b.title)}</d:displayname><a:addressbook-description>${esc(b.description)}</a:addressbook-description><d:owner><d:href>${b.owner}</d:href></d:owner>${priv(b.rights)}<cs:getctag>${b.ctag?'c'+b.ctag:''}</cs:getctag>`);}
const objectRow=(p,x)=>row(p,`<d:getetag>${esc(x.etag)}</d:getetag><a:address-data>${esc(x.text)}</a:address-data>`);
globalThis.fetch=async(url,o)=>{
 const p=new URL(url).pathname,method=o.method,h=new Headers(o.headers);calls.push({path:p,method,body:o.body,headers:h});assert.equal(new URL(url).origin,'https://cloud.example.test');assert.equal(o.redirect,'manual');assert.ok(o.signal);
 if(p==='/remote.php/dav/'){rootReads++;const who=fault==='changedAccount'?principal.replace('Soul','Other'):principal;return multi(row(p,`<d:current-user-principal><d:href>${who}</d:href></d:current-user-principal>`));}
 if(method==='PROPFIND'&&p.includes('/principals/users/'))return multi(row(p,`<a:addressbook-home-set><d:href>${homeOverride}</d:href></a:addressbook-home-set>`));
 if(method==='PROPFIND'&&p===homeOverride){if(fault==='home503')return new Response(null,{status:503});let rows=row(p,'<d:resourcetype><d:collection/></d:resourcetype>'+priv(homeRights))+[...books].map(([p,b])=>bookRow(p,b)).join('');if(fault==='homeMissing')rows=[...books].map(([p,b])=>bookRow(p,b)).join('');if(fault==='homeDuplicate')rows+=bookRow(bookPath,books.get(bookPath));if(fault==='homeMany')rows+=Array.from({length:201},(_,i)=>bookRow(home+'b'+i+'/',books.get(bookPath))).join('');return multi(rows);}
 if(method==='PROPFIND'&&books.has(p)){if(fault==='bookReadback'&&writes().length)return new Response(null,{status:503});return multi(bookRow(p,books.get(p)));}
 if(p.startsWith(filesHome+'/')){
  const path=p.slice(filesHome.length),f=files.get(path);
  if(method==='PROPFIND')return f?multi(row(p,`<d:resourcetype>${f.folder?'<d:collection/>':''}</d:resourcetype><d:getetag>${esc(f.etag)}</d:getetag><oc:fileid>${f.id}</oc:fileid><oc:permissions>${f.rights}</oc:permissions><d:getcontentlength>${f.bytes?.length??0}</d:getcontentlength><nc:hide-download>${f.denied}</nc:hide-download>`)):new Response(null,{status:404});
  if(method==='GET'){if(!f)return new Response(null,{status:404});assert.equal(h.get('If-Match'),f.etag);if(fault==='file503')return new Response(null,{status:503});return new Response(f.bytes,{headers:{etag:f.etag}});}
  if(method==='PUT'){assert.equal(h.get('If-None-Match'),'*');if(f||fault==='fileRace')return new Response(null,{status:412});files.set(path,file('77',o.body));if(fault==='exportTamper')files.get(path).bytes=enc('changed');if(fault==='exportSourceChange')objects.get(originalPath).etag='"new"';if(fault==='exportLost')throw Error('contact-fixture-secret');return new Response(null,{status:201});}
 }
 if(method==='MKCOL'){
  assert.equal(h.get('If-None-Match'),'*');assert.match(o.body,/<d:resourcetype><d:collection\/><a:addressbook\/>/);if(books.has(p)||fault==='bookRace')return new Response(null,{status:405});
  const title=unesc(o.body.match(/<d:displayname>([^]*?)<\/d:displayname>/)[1]),description=unesc(o.body.match(/<a:addressbook-description>([^]*?)<\/a:addressbook-description>/)?.[1]??'');books.set(p,{title,description,owner:principal,rights:['read','write'],ctag:1,types:['collection','addressbook']});
  if(fault==='createChangedSibling')books.get(bookPath).title='Concurrent';if(fault==='bookLost')throw Error('contact-fixture-secret');return new Response(null,{status:201});
 }
 if(method==='PROPPATCH'){
  const b=books.get(p);let changed='';for(const [key,tag]of [['title','d:displayname'],['description','a:addressbook-description']]){const match=o.body.match(new RegExp(`<${tag}>([^]*?)</${tag}>`));if(match){b[key]=unesc(match[1]);changed+=`<${tag}/>`;}}b.ctag++;
  if(fault==='patchOtherField')b.description='Unexpected';if(fault==='patchOwner')b.owner=principal.replace('Soul','Other');if(fault==='bookLost')throw Error('contact-fixture-secret');if(fault==='patchPartial')return multi(row(p,changed.replace('<a:addressbook-description/>','')));return multi(row(p,changed));
 }
 if(method==='REPORT'){
  if(o.body.includes('addressbook-query')){
   if(fault==='uid503')return new Response(null,{status:503});if(fault==='uidHtml')return new Response('<html/>',{status:207});if(fault==='uidMissing')return multi(row(bookPath+'x.vcf','<d:getetag>"x"</d:getetag>'));if(fault==='uidMany')return multi(Array.from({length:101},(_,i)=>objectRow(bookPath+i+'.vcf',{text:card(),etag:'"x"'})).join(''));
   const match=unesc(o.body.match(/<a:text-match[^>]*>([^]*?)<\/a:text-match>/)[1]);return multi([...objects].filter(([path,x])=>path.startsWith(p)&&x.text.toLowerCase().includes(match.toLowerCase())).map(([path,x])=>objectRow(fault==='uidForeign'?home+'other/x.vcf':path,x)).join(''));
  }
  const target=unesc(o.body.match(/<d:href>([^<]+)<\/d:href>/)[1]);if(fault==='targetReadback'&&writes().length)return new Response(null,{status:503});const x=objects.get(target);return x?multi(objectRow(target,x)):multi(`<d:response><d:href>${target}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`);
 }
 if(method==='GET'&&p===originalPath){const x=objects.get(p);assert.equal(h.get('If-Match'),x.etag);if(fault==='raw403')return new Response(null,{status:403});return new Response(fault==='rawHtml'?'<html/>':x.text,{headers:{etag:fault==='rawEtag'?'"wrong"':x.etag}});}
 if(method==='COPY'||method==='MOVE'){
  assert.equal(h.get('Overwrite'),'F');assert.equal(h.get('If-Match'),objects.get(p)?.etag);assert.equal(h.get('Depth'),'0');
  const destination=new URL(h.get('Destination'));assert.equal(destination.origin,'https://cloud.example.test');const target=destination.pathname;
  if(objects.has(target)||fault==='transferRace')return new Response(null,{status:412});
  if(fault==='transferUidRace')return new Response(null,{status:409});
  const original=objects.get(p);objects.set(target,{text:original.text,etag:'\"target1\"'});
  if(method==='MOVE'&&fault!=='transferRetainsSource')objects.delete(p);
  if(fault==='transferTamper')objects.get(target).text=original.text.replace('X-CLIENT:keep','X-CLIENT:changed');
  if(fault==='transferChangesSource'&&objects.has(p))objects.get(p).text+='X-CHANGED:bad\r\n';
  if(fault==='transferLost')throw Error('contact-fixture-secret');
  if(fault==='transferAccountAfter')fault='changedAccount';
  if(fault==='transferOwnerAfter')books.get(home+'destination/').owner=principal.replace('Soul','Other');
  return new Response(null,{status:201});
 }
 if(method==='PUT'&&p===contactPath){assert.equal(h.get('If-None-Match'),'*');assert.equal(h.get('Content-Type'),'text/vcard; charset=utf-8');if(objects.has(p)||fault==='targetRace'||fault==='uidRace')return new Response(null,{status:fault==='uidRace'?409:412});objects.set(p,{text:o.body,etag:'"v1"'});books.get(bookPath).ctag++;if(fault==='importLost')throw Error('contact-fixture-secret');if(fault==='importTamper')objects.get(p).text=o.body.replace('X-CLIENT:keep','X-CLIENT:changed');if(fault==='sourceAfterImport')files.get('/Import.vcf').etag='"changed"';if(fault==='sourceDeniedAfterImport')files.get('/Import.vcf').denied=true;return new Response(null,{status:201});}
 throw Error('Unexpected fixture '+method+' '+p);
};

const destinationBook=home+'destination/',destinationPath=destinationBook+'target-one.vcf';
function seedTransfer(version='3.0'){
 reset();books.set(destinationBook,{title:'Ziel',description:'Ziel behalten',owner:principal,rights:['read','write'],ctag:1,types:['collection','addressbook']});
 objects.set(originalPath,{text:card(['PHOTO;VALUE=URI:https://external.invalid/photo.png','CATEGORIES:Arbeit,Familie','X-SOURCE:keep'],uid,version),etag:'"o1"'});
}
const input=(patch={})=>({addressBookPath:bookPath,contactPath:originalPath,etag:'"o1"',expectedUid:uid,expectedAccount:'Soul',destinationAddressBookPath:destinationBook,destinationContactId:'target-one',operation:'copy',...patch});
async function execute(patch={}){const a=input(patch),p=await api.prepareContactTransfer(a);return api.transferContact({...a,expectedTransferVersion:p.version,acknowledgeTransfer:true,acknowledgeDestinationReaders:true});}
test('Transfer preview binds two books, full source, UID and destination without mutation',async()=>{seedTransfer();const p=await api.prepareContactTransfer(input());assert.equal(p.ready,true);assert.equal(p.uid,uid);assert.equal(p.destinationContactPath,destinationPath);assert.match(p.version,/^[a-f0-9]{64}$/);assert.equal(p.version,(await api.prepareContactTransfer(input())).version);assert.equal(p.body,undefined);assert.equal(writes().length,0);});
test('Native COPY/MOVE preserve complete vCard3/4 and UID, use one native mutation and verify both paths',async()=>{for(const operation of ['copy','move'])for(const version of ['3.0','4.0']){seedTransfer(version);const original=objects.get(originalPath).text,r=await execute({operation});assert.equal(r.verified,true,JSON.stringify(r));assert.equal(r.uidPreserved,true);assert.equal(objects.get(destinationPath).text,original);assert.equal(objects.has(originalPath),operation==='copy');assert.equal(writes().length,1);assert.equal(writes()[0].method,operation.toUpperCase());}});
test('Existing exact UID or target path blocks ready; no merge or renamed identity',async()=>{for(const target of [destinationPath,destinationBook+'other.vcf']){seedTransfer();objects.set(target,{text:card(),etag:'"old"'});const p=await api.prepareContactTransfer(input());assert.equal(p.ready,false);await assert.rejects(api.transferContact({...input(),expectedTransferVersion:p.version,acknowledgeTransfer:true,acknowledgeDestinationReaders:true}));assert.equal(writes().length,0);}});
test('Changed source/account/UID/ETag/book rights, same book and unsafe target IDs stop before transfer',async()=>{for(const f of ['account','uid','etag','sourceOwner','targetOwner','targetRead','targetBind','sameBook','path','id','system']){seedTransfer();const a=input({operation:'move'});if(f==='account')a.expectedAccount='Other';if(f==='uid')a.expectedUid='other';if(f==='etag')a.etag='"old"';if(f==='sourceOwner')books.get(bookPath).owner=principal.replace('Soul','Other');if(f==='targetOwner')books.get(destinationBook).owner=principal.replace('Soul','Other');if(f==='targetRead')books.get(destinationBook).rights=['bind'];if(f==='targetBind')books.get(destinationBook).rights=['read'];if(f==='sameBook')a.destinationAddressBookPath=bookPath;if(f==='path')a.contactPath=destinationPath;if(f==='id')a.destinationContactId='../escape';if(f==='system')books.get(bookPath).types=['collection'];await assert.rejects(api.prepareContactTransfer(a));assert.equal(writes().length,0,f);}});
test('Unconfirmed readers/transfer or stale preview never invokes native COPY/MOVE',async()=>{for(const f of ['readers','ack','version','body','metadata']){seedTransfer();const p=await api.prepareContactTransfer(input()),a={...input(),expectedTransferVersion:p.version,acknowledgeTransfer:true,acknowledgeDestinationReaders:true};if(f==='readers')a.acknowledgeDestinationReaders=false;if(f==='ack')a.acknowledgeTransfer=false;if(f==='version')a.expectedTransferVersion='0'.repeat(64);if(f==='body')objects.get(originalPath).text=card(['X-ADDED:changed']);if(f==='metadata')books.get(destinationBook).ctag++;await assert.rejects(api.transferContact(a));assert.equal(writes().length,0,f);}});
test('Unreadable or ambiguous UID query never means a free destination',async()=>{for(const f of ['uid503','uidHtml','uidMissing','uidMany']){seedTransfer();fault=f;await assert.rejects(api.prepareContactTransfer(input()));assert.equal(writes().length,0,f);}});
test('Race/lost reply/tampering/changed account remain unknown and never retry or delete as cleanup',async()=>{for(const f of ['transferRace','transferUidRace','transferLost','transferTamper','transferChangesSource','transferAccountAfter','transferOwnerAfter']){seedTransfer();fault=f;const r=await execute();assert.equal(r.outcome,'unknown',f);assert.equal(writes().length,1);assert.doesNotMatch(JSON.stringify(r),/contact-fixture-secret/);assert.ok(objects.has(originalPath));}});
test('Move with retained source is unverified; duplicate response never creates an alternative path',async()=>{seedTransfer();fault='transferRetainsSource';const r=await execute({operation:'move'});assert.equal(r.verified,false);assert.equal(r.targetMatches,true);assert.equal(r.sourceStateMatches,false);assert.equal(writes().length,1);assert.equal(objects.size,2);});
test('Both transfer contracts enforce scopes and exact acknowledgement schemas before native calls',async()=>{seedTransfer();const tools=new Map();api.registerContactTransferTools({registerTool(n,c,f){tools.set(n,{c,f});}});assert.equal(tools.size,2);for(const {c,f}of tools.values()){assert.equal((await f({},{})).isError,true);assert.equal(calls.length,0);assert.equal(c.inputSchema.safeParse({}).success,false);}const t=tools.get('contacts_transfer');assert.equal((await t.f({},{http:{authInfo:{scopes:['contacts:write']}}})).isError,true);assert.equal(calls.length,0);assert.equal(t.c.inputSchema.safeParse({...input(),expectedTransferVersion:'a'.repeat(64),acknowledgeTransfer:true}).success,false);});
