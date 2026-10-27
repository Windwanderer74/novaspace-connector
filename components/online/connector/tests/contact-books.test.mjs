// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export * from './lib/contact-book-management';export * from './lib/mcp-contact-book-management';export {inheritedPolicy,withConnectionPolicy} from './lib/connection-policy';export * from './lib/groupware-codec';export {setDeckRuntimeConfig} from './lib/runtime-config';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/contact-books.mjs'});
const api=await import('../.sites-runtime/test/contact-books.mjs');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'fixture',NEXTCLOUD_APP_PASSWORD:'fixture-private-transport',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',OAUTH_SIGNING_SECRET:'fixture-only-signing-12345678901234567890'});
const saved=globalThis.fetch;after(()=>globalThis.fetch=saved);
const home='/remote.php/dav/addressbooks/users/Soul/',book=home+'contacts/',book2=home+'second/',sourcePath=book+'source.vcf',targetPath=book2+'target.vcf',principal='/remote.php/dav/principals/users/Soul/';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(p,s)=>`<d:response><d:href>${esc(p)}</d:href><d:propstat><d:prop>${s}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi=s=>new Response(`<d:multistatus xmlns:d="DAV:" xmlns:a="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/">${s}</d:multistatus>`,{status:207});
let objects,books,calls,fault,homeRights;
const card=(uid,extra=[],version='3.0')=>api.foldGroupware(['BEGIN:VCARD','VERSION:'+version,'UID:'+uid,'FN:Arne Test','N:Test;Arne;;;',...extra,'END:VCARD']);
function reset(version='3.0'){
 objects=new Map([[sourcePath,{etag:'"s1"',body:card('source-uid',['EMAIL;TYPE=HOME:arne@example.test','item1.TEL;TYPE=WORK:+49 (123) 456','item1.X-ABLabel:Arbeit','NOTE:Quelle','X-SOURCE:bleibt'],version)}],[targetPath,{etag:'"t1"',body:card('target-uid',['EMAIL;TYPE=WORK:arne@example.test','TEL:+49123456','NOTE:Ziel','nfmerge1.EMAIL:other@example.test','nfmerge1.X-ABLabel:Behalten','X-TARGET;P="x:y":erhalten','PHOTO;VALUE=uri:https://external.invalid/private.png'],version)}]]);
 books=new Map([[book,{owner:principal,rights:['read','write'],ctag:1}],[book2,{owner:principal,rights:['read','write'],ctag:1}]]);calls=[];fault=null;
}
const writes=()=>calls.filter(c=>['PUT','DELETE','COPY','MOVE','PROPPATCH','POST'].includes(c.method));
const bRow=(p,b)=>row(p,`<d:resourcetype><d:collection/><a:addressbook/></d:resourcetype><d:displayname>Kontakte</d:displayname><d:owner><d:href>${b.owner}</d:href></d:owner><d:current-user-privilege-set>${b.rights.map(n=>`<d:privilege><d:${n}/></d:privilege>`).join('')}</d:current-user-privilege-set><cs:getctag>c${b.ctag}</cs:getctag>`);
const oRow=(p,o)=>row(p,`<d:getetag>${esc(o.etag)}</d:getetag><a:address-data>${esc(o.body)}</a:address-data>`);
globalThis.fetch=async(url,o)=>{
 const p=new URL(url).pathname,h=new Headers(o.headers);calls.push({path:p,method:o.method,body:o.body,headers:h});assert.equal(new URL(url).origin,'https://cloud.example.test');assert.equal(o.redirect,'manual');
 if(o.method==='PROPFIND'&&p==='/remote.php/dav/')return multi(row(p,`<d:current-user-principal><d:href>${fault==='accountAfter'&&writes().length?principal.replace('Soul','Other'):principal}</d:href></d:current-user-principal>`));
 if(o.method==='PROPFIND'&&p===principal)return multi(row(p,`<a:addressbook-home-set><d:href>${home}</d:href></a:addressbook-home-set>`));
 if(o.method==='PROPFIND'&&p===home)return multi(row(home,'<d:resourcetype><d:collection/></d:resourcetype><d:current-user-privilege-set>'+homeRights.map(n=>'<d:privilege><d:'+n+'/></d:privilege>').join('')+'</d:current-user-privilege-set>')+[...books].map(([p,b])=>bRow(p,b)).join(''));
 if(o.method==='PROPFIND'&&books.has(p))return multi(bRow(p,books.get(p)));
 if(o.method==='REPORT'){
  if(fault==='read503')return new Response(null,{status:503});
  if(o.body.includes('addressbook-query')){if(fault==='malformedQuery')return new Response('<html/>',{status:207});return multi([...objects].filter(([path])=>path.startsWith(p)).map(([path,obj])=>oRow(fault==='foreignQuery'?home+'foreign.vcf':path,obj)).join(''));}
  const path=o.body.match(/<d:href>([^<]+)<\/d:href>/)[1],obj=objects.get(path);
  if(fault==='readback503'&&writes().length)return new Response(null,{status:503});
  return obj?multi(oRow(path,obj)):multi(`<d:response><d:href>${path}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`);
 }
 if(o.method==='PUT'&&p===targetPath){assert.equal(h.get('If-Match'),'"t1"');assert.equal(h.get('Content-Type'),'text/vcard; charset=utf-8');
  if(fault==='race412')return new Response(null,{status:412});objects.set(p,{etag:'"t2"',body:o.body});books.get(book2).ctag++;
  if(fault==='tamper')objects.get(p).body=o.body.replace('X-TARGET;P="x:y":erhalten','X-TARGET:verändert');
  if(fault==='sourceAfter')objects.get(sourcePath).body+='X-RACE:1\r\n';
  if(fault==='ownerAfter')books.get(book2).owner=principal.replace('Soul','Other');
  if(fault==='lost')throw Error('fixture-private-transport');return new Response(null,{status:204});
 }
 throw Error('Unexpected fixture '+o.method+' '+p);
};
let shares;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,o)=>{
 const p=new URL(url).pathname,h=new Headers(o.headers),record=()=>calls.push({path:p,method:o.method,body:o.body,headers:h});
 if(o.method==='PROPFIND'&&p.startsWith(home)&&p!==home&&!books.has(p)){record();return new Response(null,{status:404});}
 if(o.method==='PROPFIND'&&books.has(p)&&o.body?.includes('oc:invite')){
  record();if(fault==='shares503')return new Response(null,{status:503});if(fault==='sharesMissing')return multi(row(p,''));
  const content=(shares.get(p)??[]).map(s=>`<oc:user><d:href>${esc(s.href)}</d:href><oc:common-name>${esc(s.name??'')}</oc:common-name><oc:invite-accepted/><oc:access><oc:${s.role}/></oc:access></oc:user>`).join('');
  const props=fault==='sharesMalformed'?'<oc:invite><oc:unexpected/></oc:invite>':`<oc:invite>${content}</oc:invite>`;
  return new Response(`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${row(p,props)}</d:multistatus>`,{status:207});
 }
 if(o.method==='PROPFIND'&&books.has(p)&&h.get('Depth')==='1'){
  record();if(fault==='children503')return new Response(null,{status:503});let rows=row(p,'<d:resourcetype><d:collection/></d:resourcetype>')+[...objects].filter(([path])=>path.startsWith(p)).map(([path,obj])=>row(fault==='foreignChild'?home+'outside.vcf':path,`<d:getetag>${esc(obj.etag)}</d:getetag><d:resourcetype/><d:getcontentlength>${obj.body.length}</d:getcontentlength>`)).join('');if(fault==='manyChildren')rows+=Array.from({length:1001},(_,i)=>row(p+i+'.vcf','<d:getetag>"v"</d:getetag>')).join('');return multi(rows);
 }
 if(o.method==='POST'&&books.has(p)){
  record();if(fault==='post409')return new Response(null,{status:409});const href=o.body.match(/<d:href>([^<]+)<\/d:href>/)[1].replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'),current=shares.get(p)??[],next=current.filter(s=>s.href!==href);
  if(!o.body.includes('<oc:remove>')&&fault!=='silentRecipient')next.push({href,role:o.body.includes('<oc:read-write/>')?'read-write':'read',name:''});shares.set(p,next);
  if(fault==='otherShare')shares.set(p,next.filter(s=>s.href.includes('New')));
  if(fault==='contactAfter')objects.get(sourcePath).etag='"changed"';if(fault==='ownerAfter')books.get(p).owner=principal.replace('Soul','Other');if(fault==='lost')throw Error('fixture-private-transport');return new Response(null,{status:200});
 }
 if(o.method==='DELETE'&&books.has(p)){
  record();if(fault==='delete409')return new Response(null,{status:409});if(fault!=='deleteIgnored'){books.delete(p);shares.delete(p);for(const key of objects.keys())if(key.startsWith(p))objects.delete(key);}
  if(fault==='deleteSibling')books.get(book2).owner=principal.replace('Soul','Other');if(fault==='lost')throw Error('fixture-private-transport');return new Response(null,{status:204});
 }
 return originalFetch(url,o);
};
function setup(){reset();homeRights=['read','write'];shares=new Map([[book,[{href:'principal:principals/users/Existing',role:'read',name:'Vorhanden'},{href:'principal:principals/groups/Team',role:'read-write',name:'Team'}]],[book2,[]]]);}
const ref=()=>({addressBookPath:book,expectedAccount:'Soul'});
async function shareArgs(patch={}){const p=await api.readContactBookShares(ref());return {...ref(),expectedVersion:p.version,recipientType:'user',recipientId:'New',operation:'create',role:'read',acknowledgeBookAccess:true,...patch};}
async function deleteArgs(){const p=await api.prepareContactBookDeletion(ref());return {...ref(),expectedDeleteVersion:p.version,acknowledgeContents:true,acknowledgeShares:true,acknowledgeNoRestore:true};}
test('Own native share view and delete preview bind roles, full child list, shares and owner without mutation',async()=>{setup();const s=await api.readContactBookShares(ref());assert.equal(s.shares.length,2);assert.equal(s.shares[1].role,'read');const p=await api.prepareContactBookDeletion(ref());assert.equal(p.contactCount,1);assert.equal(p.shares.length,2);assert.equal(p.ready,true);assert.match(p.note,/dauerhaft/);assert.equal(writes().length,0);});
test('Native create, role update and revoke change one explicit local recipient and preserve contacts and others',async()=>{setup();const original=objects.get(sourcePath).body;let a=await shareArgs();let r=await api.changeContactBookShare(a);assert.equal(r.verified,true,JSON.stringify(r));a=await shareArgs({operation:'update',role:'read-write'});assert.equal((await api.changeContactBookShare(a)).verified,true);a=await shareArgs({operation:'update',role:'read-write'});assert.equal((await api.changeContactBookShare(a)).outcome,'unchanged');assert.equal(writes().length,2);a=await shareArgs({operation:'revoke',role:undefined});r=await api.changeContactBookShare(a);assert.equal(r.verified,true);assert.equal(shares.get(book).length,2);assert.equal(objects.get(sourcePath).body,original);assert.equal(writes().length,3);assert.ok(writes().every(c=>c.method==='POST'));});
test('Group recipients and escaped local identifiers remain exact, never email or public shares',async()=>{setup();const a=await shareArgs({recipientType:'group',recipientId:'New & Team',role:'read-write'});assert.equal((await api.changeContactBookShare(a)).verified,true);assert.match(writes()[0].body,/groups\/New &amp; Team/);for(const bad of [{recipientId:'Soul'},{recipientId:'../Other'},{recipientType:'remote',recipientId:'x'},{recipientId:' x '},{role:'owner'},{acknowledgeBookAccess:false}]){setup();const a=await shareArgs(bad);await assert.rejects(api.changeContactBookShare(a));assert.equal(writes().length,0);}});
test('Stale share snapshot, contact/book changes, wrong account, foreign owner and insufficient rights block POST',async()=>{for(const f of ['version','contact','book','account','owner','rights','duplicate','missing']){setup();const a=await shareArgs();if(f==='version')a.expectedVersion='0'.repeat(64);if(f==='contact')objects.get(sourcePath).etag='"changed"';if(f==='book')books.get(book).ctag++;if(f==='account')a.expectedAccount='Other';if(f==='owner')books.get(book).owner=principal.replace('Soul','Other');if(f==='rights')books.get(book).rights=['read','write-properties'];if(f==='duplicate')a.recipientId='Existing';if(f==='missing')a.operation='revoke';await assert.rejects(api.changeContactBookShare(a));assert.equal(writes().length,0,f);}});
test('Unreadable/malformed/missing share lists and foreign/excessive child inventories never mean empty',async()=>{for(const f of ['shares503','sharesMissing','sharesMalformed','children503','foreignChild','manyChildren']){setup();fault=f;await assert.rejects(api.readContactBookShares(ref()));await assert.rejects(api.prepareContactBookDeletion(ref()));assert.equal(writes().length,0);}});
test('Lost/ignored/conflicting native shares, changed other shares/contacts/owner/account stay unknown without retry',async()=>{for(const f of ['lost','post409','silentRecipient','otherShare','contactAfter','ownerAfter','accountAfter']){setup();const a=await shareArgs();fault=f;const r=await api.changeContactBookShare(a);assert.equal(r.outcome,'unknown',f);assert.equal(writes().length,1);assert.doesNotMatch(JSON.stringify(r),/fixture-private-transport/);}});
test('Selected whole book deletion removes its contacts/shares once, confirms absence and preserves another book',async()=>{setup();const other=objects.get(targetPath).body,a=await deleteArgs(),r=await api.deleteContactBook(a);assert.equal(r.verified,true,JSON.stringify(r));assert.equal(r.removedContactCount,1);assert.equal(r.removedDirectShareCount,2);assert.equal(books.has(book),false);assert.equal(objects.has(sourcePath),false);assert.equal(objects.get(targetPath).body,other);assert.equal(writes().length,1);assert.equal(writes()[0].method,'DELETE');});
test('Delete version/contents/shares/parent rights/account or absent any consequence acknowledgement prevent deletion',async()=>{for(const f of ['version','contact','share','parent','account','contentsAck','sharesAck','restoreAck']){setup();const a=await deleteArgs();if(f==='version')a.expectedDeleteVersion='0'.repeat(64);if(f==='contact')objects.get(sourcePath).etag='"new"';if(f==='share')shares.get(book).push({href:'principal:principals/users/Unexpected',role:'read'});if(f==='parent')homeRights=['read'];if(f==='account')a.expectedAccount='Other';if(f==='contentsAck')a.acknowledgeContents=false;if(f==='sharesAck')a.acknowledgeShares=false;if(f==='restoreAck')a.acknowledgeNoRestore=false;await assert.rejects(api.deleteContactBook(a));assert.equal(writes().length,0,f);}});
test('Lost, failed, ignored deletion, sibling alteration and account changes stay unknown without recreate or cleanup',async()=>{for(const f of ['lost','delete409','deleteIgnored','deleteSibling','accountAfter']){setup();const a=await deleteArgs();fault=f;const r=await api.deleteContactBook(a);assert.equal(r.outcome,'unknown',f);assert.equal(writes().length,1);assert.doesNotMatch(JSON.stringify(r),/fixture-private-transport/);}});
test('Separate share/manage scopes and contact read-only/disabled policy reject before native traffic',async()=>{setup();const tools=new Map();api.registerContactBookTools({registerTool(n,c,f){tools.set(n,{c,f});}});assert.equal(tools.size,4);for(const {c,f}of tools.values()){assert.equal(c.inputSchema.safeParse({}).success,false);assert.equal((await f({},{})).isError,true);}for(const [name,scope]of [['contacts_change_book_share','contacts:share'],['contacts_delete_book','contacts:manage']]){const t=tools.get(name);assert.equal((await t.f({},{http:{authInfo:{scopes:['contacts:read','contacts:write']}}})).isError,true);for(const mode of ['read','off']){const p=api.inheritedPolicy();p.apps.contacts=mode;const r=await api.withConnectionPolicy(p,()=>t.f({},{http:{authInfo:{scopes:[scope,'contacts:read']}}}));assert.equal(r.isError,true);}}assert.equal(calls.length,0);});
