// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
await build({stdin:{contents:`export * from './lib/source-capsule-core';export { createSourceCapsule } from './lib/mindmap';export { setDeckRuntimeConfig } from './lib/runtime-config';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/source-capsule.mjs'});
const api=await import('../.sites-runtime/test/source-capsule.mjs');
const source={root:{data:{id:'root',text:'Project',hyperlink:'https://cloud.test/index.php/apps/deck/card/504',nfDeckAutoNodes:1,nfDeckAggregate:{version:1,scope:'defined-checklist-tasks'},custom:'keep'},children:[]},theme:'fresh-blue',extra:{keep:true}};
const input={parentId:'root',capsuleId:'capsule',documentNodeId:'document',title:'Brief beantworten',source:{path:'/letter.pdf',fileId:'73',etag:'"s1"'},sourceUrl:'https://cloud.test/index.php/f/73'};
test('Atomic capsule/document projection preserves project fields, creates no card and excludes document from progress',()=>{const out=api.addSourceCapsule(source,input);assert.equal(out.unchanged,false);assert.equal(out.map.root.children.length,1);const capsule=out.map.root.children[0],doc=capsule.children[0];assert.equal(doc.data.nfSource.fileId,'73');assert.equal(doc.data.nfSource.etagAtLink,'"s1"');assert.equal(doc.data.hyperlink,input.sourceUrl);assert.equal(doc.data.progress,undefined);assert.equal(capsule.data.nfDeckAggregate.total,0);assert.equal(capsule.data.nfDeckAggregate.allChecked,false);assert.equal(capsule.data.hyperlink,undefined);assert.equal(out.map.root.data.custom,'keep');assert.deepEqual(out.map.extra,source.extra);assert.equal(source.root.children.length,0);});
test('A repeat with different proposed identifiers reuses the existing source branch unchanged',()=>{const first=api.addSourceCapsule(source,input);const second=api.addSourceCapsule(first.map,{...input,capsuleId:'other',documentNodeId:'other-doc',title:'Another title'});assert.equal(second.unchanged,true);assert.equal(second.capsuleId,'capsule');assert.equal(second.documentNodeId,'document');assert.deepEqual(second.map,first.map);});
test('Existing older native source link is reused without rewriting historical metadata',()=>{const old=structuredClone(source);old.root.children.push({data:{id:'old',text:'Old capsule'},children:[{data:{id:'old-document',text:'PDF',hyperlink:input.sourceUrl,nfSource:{version:1,kind:'file',fileId:'73',etagAtLink:'"old"'}}}]});const out=api.addSourceCapsule(old,input);assert.equal(out.unchanged,true);assert.equal(out.capsuleId,'old');assert.deepEqual(out.map,old);});
test('Duplicate sources, conflicting links and identifier collisions do not produce a modified map',()=>{const out=api.addSourceCapsule(source,input).map;const duplicate=structuredClone(out);duplicate.root.children.push({data:{id:'duplicate',text:'Duplicate PDF',hyperlink:input.sourceUrl}});assert.throws(()=>api.addSourceCapsule(duplicate,input),/mehrfach/);const conflict=structuredClone(out);conflict.root.children[0].children[0].data.hyperlink='https://cloud.test/index.php/f/99';assert.throws(()=>api.addSourceCapsule(conflict,input),/anderen Link/);assert.throws(()=>api.addSourceCapsule(source,{...input,capsuleId:'root'}),/belegt/);assert.throws(()=>api.addSourceCapsule(source,{...input,documentNodeId:'capsule'}),/belegt/);});
test('Mirrored task, bound work capsule and source nodes cannot receive new ground capsules',()=>{for(const data of [{nfDeckChecklistOwner:'owner'},{nfDeckSync:{version:1}},{nfSource:{version:1}}]){const map=structuredClone(source);Object.assign(map.root.data,data);assert.throws(()=>api.addSourceCapsule(map,input),/übergeordneten/);}});
test('Invalid source paths, source versions, links and blank names are rejected',()=>{for(const path of ['/../letter.pdf','/a//b.pdf','/a\\b.pdf','letter.pdf'])assert.throws(()=>api.addSourceCapsule(source,{...input,source:{...input.source,path}}));for(const changed of [{title:'  '},{source:{...input.source,etag:'W/"s1"'}},{sourceUrl:'https://cloud.test/index.php/f/99'},{sourceUrl:'https://user:secret@cloud.test/index.php/f/73'}])assert.throws(()=>api.addSourceCapsule(source,{...input,...changed}));});
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.test',NEXTCLOUD_LOGIN_NAME:'test',NEXTCLOUD_APP_PASSWORD:'test-only'});
const originalFetch=globalThis.fetch;let mapText,rev,writes,mode,sourceReads,requests;
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(href,props)=>`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns"><d:response><d:href>${esc(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
function reset(fault){mapText=JSON.stringify(source);rev=1;writes=0;mode=fault;sourceReads=0;requests=[];}
globalThis.fetch=async(url,o)=>{const href=new URL(url).pathname,h=new Headers(o.headers);requests.push({href,method:o.method});if(href==='/remote.php/dav/')return new Response(row(href,'<d:current-user-principal><d:href>/remote.php/dav/principals/users/test/</d:href></d:current-user-principal>'),{status:207});
 const pdf=href.endsWith('/letter.pdf'),folder=href.endsWith('/collection'),sourceObject=pdf||folder||href.endsWith('/notes.txt');if(o.method==='PROPFIND'){if(sourceObject)sourceReads++;const tag=sourceObject?(folder&&mode==='folder-after-write'?`"s${rev}"`:mode==='source-race'&&sourceReads>=2?'"s2"':'"s1"'):`"m${rev}"`;return new Response(row(href,`<d:resourcetype>${folder?'<d:collection/>':''}</d:resourcetype><d:getetag>${tag}</d:getetag><oc:fileid>${sourceObject?(mode==='folder-replaced'&&sourceReads>=2?'74':'73'):'72'}</oc:fileid><oc:permissions>${sourceObject?'G':'GW'}</oc:permissions><nc:hide-download>${sourceObject&&mode==='denied'?'true':'false'}</nc:hide-download>`),{status:207});}
 if(o.method==='GET'){assert.equal(pdf,false);assert.equal(h.get('if-match'),`"m${rev}"`);return new Response(mapText,{headers:{etag:`"m${rev}"`}});}
 assert.equal(o.method,'PUT');assert.equal(pdf,false);writes++;assert.equal(h.get('if-match'),`"m${rev}"`);if(mode==='put-race')return new Response(null,{status:412});mapText=o.body;rev++;return new Response(null,{status:204});};
const args={path:'/project.km',fileId:'72',etag:'"m1"',parentId:'root',capsuleId:'capsule',documentNodeId:'document',title:'Brief beantworten',sourcePath:'/letter.pdf',sourceFileId:'73',sourceEtag:'"s1"'};
test('Server writes capsule and source together once, and repeated use only reads',async()=>{reset();const first=await api.createSourceCapsule(args);assert.equal(first.verified,true);assert.equal(first.cardCreated,false);assert.equal(writes,1);assert.equal(JSON.parse(mapText).root.children[0].children[0].data.nfSource.fileId,'73');const second=await api.createSourceCapsule({...args,etag:'"m2"'});assert.equal(second.unchanged,true);assert.equal(writes,1);assert.ok(requests.every(r=>!r.href.includes('/apps/deck/')));});
test('Stale map, changed source and denied download cause no write; a conditional PUT race is not retried',async()=>{for(const fault of ['source-race','denied']){reset(fault);await assert.rejects(api.createSourceCapsule(args));assert.equal(writes,0);}reset();await assert.rejects(api.createSourceCapsule({...args,etag:'"stale"'}));assert.equal(writes,0);reset('put-race');await assert.rejects(api.createSourceCapsule(args));assert.equal(writes,1);assert.equal(mapText,JSON.stringify(source));});
process.on('exit',()=>{globalThis.fetch=originalFetch;});
test('Folder capsule links only the container and reuses its identity after contents or name change',()=>{
 const folderInput={...input,source:{path:'/collection',fileId:'73',etag:'"s1"',kind:'folder'}};
 const first=api.addSourceCapsule(source,folderInput),doc=first.map.root.children[0].children[0];
 assert.equal(doc.data.text,'Ordner: collection');assert.equal(doc.data.nfSource.kind,'folder');assert.equal(doc.children.length,0);assert.equal(doc.data.progress,undefined);
 const again=api.addSourceCapsule(first.map,{...folderInput,source:{...folderInput.source,path:'/renamed',etag:'"s9"'},capsuleId:'new',documentNodeId:'new-doc'});
 assert.equal(again.unchanged,true);assert.deepEqual(again.map,first.map);
 assert.throws(()=>api.addSourceCapsule(first.map,{...folderInput,source:{...folderInput.source,kind:'file'}}),/widersprechen/);
});
test('Folder checks preserve identity and permissions while file versions remain strict',()=>{
 const expected={...input.source,kind:'folder'},metadata={kind:'folder',fileId:'73',etag:'"s2"',permissions:'G',downloadDenied:false};
 assert.equal(api.sourceMetadataMatches(metadata,expected,true),false);assert.equal(api.sourceMetadataMatches(metadata,expected),true);
 for(const patch of [{kind:'file'},{fileId:'74'},{permissions:''},{downloadDenied:true}])assert.equal(api.sourceMetadataMatches({...metadata,...patch},expected),false);
 assert.equal(api.sourceMetadataMatches({...metadata,kind:'file'},{...expected,kind:'file'}),false);
});
test('Other file formats use the same guarded link without reading source bytes',async()=>{
 reset();const out=await api.createSourceCapsule({...args,sourcePath:'/notes.txt',title:'Notizen'});assert.equal(out.verified,true);assert.equal(writes,1);
 assert.equal(JSON.parse(mapText).root.children[0].children[0].data.nfSource.kind,'file');assert.ok(requests.filter(r=>r.href.endsWith('/notes.txt')).every(r=>r.method==='PROPFIND'));
});
test('Saving a map inside the source folder changes its ETag but keeps the folder link verified and reusable',async()=>{
 reset('folder-after-write');const first=await api.createSourceCapsule({...args,sourcePath:'/collection',sourceKind:'folder'});
 assert.equal(first.verified,true);assert.equal(first.sourceIdentityVerified,true);assert.equal(first.sourceVersionVerified,null);assert.equal(writes,1);
 const second=await api.createSourceCapsule({...args,etag:'"m2"',sourcePath:'/collection',sourceKind:'folder',sourceEtag:'"s2"'});
 assert.equal(second.unchanged,true);assert.equal(writes,1);assert.equal(JSON.parse(mapText).root.children[0].children[0].data.nfSource.kind,'folder');
});
test('A stale entry version, replaced folder or wrong source kind stops before writing',async()=>{
 reset();await assert.rejects(api.createSourceCapsule({...args,sourcePath:'/collection',sourceKind:'folder',sourceEtag:'"old"'}));assert.equal(writes,0);
 reset('folder-replaced');await assert.rejects(api.createSourceCapsule({...args,sourcePath:'/collection',sourceKind:'folder'}));assert.equal(writes,0);
 reset();await assert.rejects(api.createSourceCapsule({...args,sourcePath:'/collection'}));assert.equal(writes,0);
});
test('A source mindmap cannot link to itself as its own ground capsule',async()=>{
 reset();await assert.rejects(api.createSourceCapsule({...args,sourceFileId:'72'}),/andere Ziel-Mindmap/);assert.equal(writes,0);assert.equal(requests.length,0);
});
