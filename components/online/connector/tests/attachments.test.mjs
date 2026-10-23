// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export * from './lib/deck-attachments'; export * from './lib/notes-files'; export * from './lib/attachment-files'; export {registerAttachmentTools} from './lib/mcp-attachments'; export {inheritedPolicy,withConnectionPolicy} from './lib/connection-policy'; export {setDeckRuntimeConfig} from './lib/runtime-config';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/attachments.mjs'});
const api=await import('../.sites-runtime/test/attachments.mjs');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'fixture',NEXTCLOUD_APP_PASSWORD:'secret-attachment-fixture',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',OAUTH_SIGNING_SECRET:'test-only-signing-key-12345678901234567890'});
const original=globalThis.fetch;after(()=>globalThis.fetch=original);
const root='/index.php/apps/deck/api/v1.0/boards/5',aroot='/index.php/apps/deck/api/v1.1/boards/5/stacks/20/cards/30/attachments',dav='/remote.php/dav/files/ChatGPT';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,1,2,3]);
let board,card,attachments,note,files,calls,fault;
const copy=x=>JSON.parse(JSON.stringify(x));
const modern=(patch={})=>({id:70,cardId:30,type:'file',data:'Bild.png',deletedAt:0,extendedData:{path:'/Bild.png',fileid:90,permissions:1},...patch});
function reset(){
 board={id:5,title:'Planung',archived:false,labels:[],users:[{uid:'ChatGPT'}],acl:[],permissions:{PERMISSION_READ:true,PERMISSION_EDIT:true}};
 card={id:30,stackId:20,title:'Karte',description:'Erhalten',labels:[],assignedUsers:[],archived:false,done:null};attachments=[];
 note={id:8,internalPath:'Notes/Projekt/Original.md',title:'Bereinigter Titel',content:'Unveränderter Text',category:'Projekt',favorite:false,readonly:false,etag:'n1'};
 files=new Map([['/Bild.png',{id:'90',etag:'"img1"',mime:'image/png',permissions:'GRW',bytes:png}],['/Notes/Projekt/Original.md',{id:'8',etag:'"note1"',mime:'text/markdown',permissions:'GW',bytes:new TextEncoder().encode(note.content)}]]);
 calls=[];fault=null;
}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const row=(path,f)=>`<d:response><d:href>${esc(dav+path.split('/').map(encodeURIComponent).join('/'))}</d:href><d:propstat><d:prop><d:resourcetype>${f.folder?'<d:collection/>':''}</d:resourcetype><d:getetag>${esc(f.etag)}</d:getetag><oc:fileid>${f.id}</oc:fileid><oc:permissions>${f.permissions}</oc:permissions><d:displayname>${esc(path.split('/').at(-1))}</d:displayname><d:getcontentlength>${f.size??f.bytes?.length??0}</d:getcontentlength><d:getcontenttype>${f.mime??''}</d:getcontenttype><nc:hide-download>${f.denied?'true':'false'}</nc:hide-download></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const multi=rows=>new Response(`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${rows}</d:multistatus>`,{status:207});
const nr=data=>Response.json(data,{headers:{'X-Notes-API-Versions':fault==='oldApi'?'1.2,1.3':'1.2,1.4'}});
const writes=()=>calls.filter(c=>['POST','PUT','DELETE'].includes(c.method));
globalThis.fetch=async(url,o)=>{
 const u=new URL(url),p=u.pathname,method=o.method;calls.push({path:p,method,body:o.body,query:u.search,headers:new Headers(o.headers)});
 assert.equal(u.origin,'https://cloud.example.test');assert.equal(o.redirect,'manual');assert.ok(o.signal);
 if(p==='/remote.php/dav/')return multi('<d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>');
 if(p.startsWith(dav+'/')){
  const path=p.slice(dav.length).split('/').map(decodeURIComponent).join('/').replace(/\/$/,'');const f=files.get(path);if(!f)return new Response(null,{status:404});
  if(method==='GET'){
   assert.equal(new Headers(o.headers).get('if-match'),f.etag);
   const r=new Response(fault==='badBytes'?new Uint8Array([1,2,3]):f.bytes,{headers:{etag:fault==='weakEtag'?'W/"img1"':f.etag,'content-type':f.mime,'content-length':String(f.bytes.length)}});
   if(fault==='sourceChangedDuringRead')f.etag='"changed"';return r;
  }
  assert.equal(method,'PROPFIND');const rows=[row(path,f)];
  if(new Headers(o.headers).get('depth')==='1')for(const [fp,ff] of files)if(!(fault==='missingInventory'&&fp.endsWith('/Bild.png'))&&fp!==path&&fp.slice(0,fp.lastIndexOf('/'))===path)rows.push(row(fp,ff));
  return multi(rows.join(''));
 }
 if(p===root)return Response.json(board);
 if(p===root+'/stacks')return Response.json([{id:20,boardId:5,title:'Offen',cards:[card]}]);
 if(p===root+'/stacks/20/cards/30')return Response.json(card);
 if(p===aroot)return Response.json(attachments);
 if(p===aroot+'/70'){
  assert.equal(method,'DELETE');assert.equal(u.searchParams.get('type'),'file');attachments=attachments.filter(a=>!(a.type==='file'&&Number(a.id)===70));
  if(fault==='sourceAccessLost')files.delete('/Bild.png');if(fault==='lost')throw Error('secret-attachment-fixture');return Response.json({});
 }
 if(p==='/ocs/v2.php/apps/files_sharing/api/v1/shares'){
  assert.equal(method,'POST');const body=new URLSearchParams(o.body);assert.equal(body.get('path'),'/Bild.png');assert.equal(body.get('shareType'),'12');assert.equal(body.get('shareWith'),'30');assert.equal(body.get('permissions'),'1');assert.equal(body.get('sendMail'),'false');
  attachments.push(modern());if(fault==='lost')throw Error('secret-attachment-fixture');if(fault==='otherCard')card.description='Parallel';if(fault==='otherAttachment')attachments.push(modern({id:71,data:'Fremd'}));
  return Response.json({ocs:{meta:{status:'ok',statuscode:100},data:{id:'70',share_type:12,share_with:'30',permissions:1,file_source:90}}});
 }
 if(p==='/index.php/apps/notes/api/v1/notes/8')return nr(note);
 if(p==='/index.php/apps/notes/api/v1.4/settings')return nr({});
 if(p==='/index.php/apps/notes/api/v1.4/attachment/8'){
  assert.equal(method,'POST');assert.ok(o.body instanceof FormData);assert.equal(new Headers(o.headers).has('content-type'),false);
  const image=o.body.get('file');assert.equal(image.name,'Bild.png');assert.equal(image.type,'image/png');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
  files.set('/Notes/Projekt/.attachments.8',{id:'99',folder:true,etag:'"folder"',permissions:'GW'});
  files.set('/Notes/Projekt/.attachments.8/Bild.png',{id:'100',etag:'"copy1"',mime:'image/png',permissions:'GW',bytes:fault==='differentCopy'?Uint8Array.from([...png.slice(0,-1),9]):png});
  if(fault==='lost')throw Error('secret-attachment-fixture');if(fault==='noteChanged')note.etag='n2';if(fault==='sourceAfter')files.get('/Bild.png').etag='"img2"';
  return nr({filename:fault==='escape'?'.attachments.8/../other.png':'.attachments.8/Bild.png'});
 }
 throw Error('Unexpected fixture endpoint '+method+' '+p);
};
const ref={boardId:5,stackId:20,cardId:30};
async function guard(){const r=await api.listDeckAttachments(ref);return {...ref,expectedAccount:'ChatGPT',expectedVersion:r.version,expectedBoardVersion:r.boardVersion,expectedAttachmentsVersion:r.snapshot};}
async function noteArgs(){const r=await api.listNoteAttachments({id:8});return {id:8,expectedAccount:'ChatGPT',expectedNoteEtag:r.noteEtag,expectedAttachmentsVersion:r.snapshot,sourcePath:'/Bild.png',fileId:'90',etag:'"img1"'};}
const attach=async patch=>api.attachDeckFile({...await guard(),sourcePath:'/Bild.png',fileId:'90',etag:'"img1"',acknowledgeBoardAccess:true,...patch});
test('Deck API1.1 lists both types, normalizes string IDs and separates share ID from file ID',async()=>{reset();attachments=[modern({id:'70',cardId:'30',extendedData:{path:'Bild.png',fileid:90,permissions:1}}),{id:70,cardId:30,type:'deck_file',data:'alt',deletedAt:0}];const r=await api.listDeckAttachments(ref);assert.equal(r.attachments.length,2);assert.equal(r.attachments[1].id,70);assert.match(r.snapshot,/^[a-f0-9]{64}$/);const f=await api.resolveDeckAttachment({...ref,attachmentId:70});assert.equal(f.fileId,'90');assert.equal(f.path,'/Bild.png');assert.equal(writes().length,0);});
test('Cross-card, duplicate, escaping paths and more than200 attachments are refused',async()=>{for(const mode of ['card','duplicate','escape','many']){reset();attachments=mode==='card'?[modern({cardId:31})]:mode==='duplicate'?[modern(),modern()]:mode==='escape'?[modern({extendedData:{path:'/../other',fileid:90}})]:Array.from({length:201},(_,i)=>modern({id:i+1}));await assert.rejects(api.listDeckAttachments(ref));assert.equal(writes().length,0);}});
test('Deck attaches existing file by read-only native share and preserves bytes/card/other attachments',async()=>{reset();attachments=[{id:3,cardId:30,type:'deck_file',data:'alt',deletedAt:0}];const r=await attach();assert.equal(r.outcome,'verified',JSON.stringify(r));assert.equal(r.sourcePreserved,true);assert.equal(r.attachmentId,70);assert.equal(r.nativeShareType,12);assert.equal(r.emailRequested,false);assert.equal(writes().length,1);assert.equal(card.description,'Erhalten');assert.deepEqual(files.get('/Bild.png').bytes,png);});
test('Deck missing acknowledgement/account/versions/source rights/identity and duplicates stop before sharing',async()=>{for(const mode of ['ack','account','version','board','snapshot','rights','denied','id','duplicate','permission']){reset();const a={...await guard(),sourcePath:'/Bild.png',fileId:'90',etag:'"img1"',acknowledgeBoardAccess:true};if(mode==='ack')a.acknowledgeBoardAccess=false;if(mode==='account')a.expectedAccount='Soul';if(mode==='version')a.expectedVersion='0'.repeat(64);if(mode==='board')board.acl.push({id:9});if(mode==='snapshot')attachments.push(modern());if(mode==='rights')files.get('/Bild.png').permissions='GW';if(mode==='denied')files.get('/Bild.png').denied=true;if(mode==='id')a.fileId='91';if(mode==='duplicate'){attachments.push(modern());a.expectedAttachmentsVersion=(await api.listDeckAttachments(ref)).snapshot;}if(mode==='permission')board.permissions.PERMISSION_EDIT=false;await assert.rejects(api.attachDeckFile(a));assert.equal(writes().length,0,mode);}});
test('Deck lost response and concurrent card/attachment change yield unknown after one POST',async()=>{for(const f of ['lost','otherCard','otherAttachment']){reset();fault=f;const r=await attach();assert.equal(r.outcome,'unknown');assert.equal(writes().length,1);assert.doesNotMatch(JSON.stringify(r),/secret-attachment/);}});
test('Deck detach uses explicit type=file even when legacy ID collides, preserving original and legacy attachment',async()=>{reset();attachments=[modern(),{id:70,cardId:30,type:'deck_file',data:'alt',deletedAt:0}];const a=await guard(),item=(await api.listDeckAttachments(ref)).attachments.find(x=>x.type==='file');const r=await api.detachDeckFile({...a,attachmentId:70,expectedAttachmentVersion:item.version});assert.equal(r.outcome,'verified');assert.equal(r.sourcePreserved,true);assert.equal(attachments.length,1);assert.equal(attachments[0].type,'deck_file');assert.equal(writes().length,1);});
test('Legacy-only and stale attachment cannot be detached with modern operation',async()=>{for(const f of ['legacy','stale']){reset();attachments=[modern({type:f==='legacy'?'deck_file':'file'})];const a=await guard();await assert.rejects(api.detachDeckFile({...a,attachmentId:70,expectedAttachmentVersion:'0'.repeat(64)}));assert.equal(writes().length,0);}});
test('Deck source access loss after detach remains unknown and is not called source deletion',async()=>{reset();attachments=[modern()];const a=await guard(),item=(await api.listDeckAttachments(ref)).attachments[0];fault='sourceAccessLost';const r=await api.detachDeckFile({...a,attachmentId:70,expectedAttachmentVersion:item.version});assert.equal(r.outcome,'unknown');assert.equal(r.sourcePreserved,false);assert.equal(writes().length,1);});
test('Notes resolves native internalPath and exact file ID without title guessing',async()=>{reset();const r=await api.resolveNoteFile({id:8});assert.equal(r.path,'/Notes/Projekt/Original.md');assert.equal(r.fileId,'8');delete note.internalPath;await assert.rejects(api.resolveNoteFile({id:8}),/Dateipfad/);assert.equal((await api.resolveNoteFile({id:8,path:'/Notes/Projekt/Original.md'})).fileId,'8');await assert.rejects(api.resolveNoteFile({id:8,path:'/Bild.png'}));});
test('Notes attachment inventory reads only own folder and excludes category files and foreign note folders',async()=>{reset();files.set('/Notes/Projekt/alt.png',{...files.get('/Bild.png'),id:'91'});files.set('/Notes/Projekt/.attachments.9',{id:'92',folder:true,permissions:'GW',etag:'"folder"'});const r=await api.listNoteAttachments({id:8});assert.deepEqual(r.attachments,[]);assert.equal(r.folder,'/Notes/Projekt/.attachments.8');assert.ok(!calls.some(c=>c.headers.get('depth')==='1'));});
test('Notes native multipart image creates new verified copy, preserves note text and returns encoded Markdown',async()=>{reset();const a=await noteArgs(),r=await api.attachNoteImage(a);assert.equal(r.outcome,'verified',JSON.stringify(r));assert.equal(r.fileId,'100');assert.equal(r.sourcePreserved,true);assert.equal(r.noteContentChanged,false);assert.equal(note.content,'Unveränderter Text');assert.equal(r.markdown,'![Bild](<.attachments.8/Bild.png>)');assert.equal(writes().length,1);});
test('Notes old API, readonly, missing native write, wrong account and stale snapshot stop before upload',async()=>{for(const f of ['oldApi','readonly','rights','account','snapshot','etag']){reset();const a=await noteArgs();if(f==='oldApi')fault=f;if(f==='readonly')note.readonly=true;if(f==='rights')files.get('/Notes/Projekt/Original.md').permissions='G';if(f==='account')a.expectedAccount='Soul';if(f==='snapshot')a.expectedAttachmentsVersion='0'.repeat(64);if(f==='etag')a.expectedNoteEtag='old';await assert.rejects(api.attachNoteImage(a));assert.equal(writes().length,0,f);}});
test('Image invalid bytes/MIME/size/weak GET ETag and changed version stop upload',async()=>{for(const f of ['badBytes','mime','size','weakEtag','sourceChangedDuringRead','denied']){reset();const a=await noteArgs();if(['badBytes','weakEtag','sourceChangedDuringRead'].includes(f))fault=f;if(f==='mime')files.get('/Bild.png').mime='image/jpeg';if(f==='size')files.get('/Bild.png').size=api.IMAGE_LIMIT+1;if(f==='denied')files.get('/Bild.png').denied=true;await assert.rejects(api.attachNoteImage(a));assert.equal(writes().length,0,f);}});
test('Image filename traversal, wrong suffix and duplicate names are refused without creating copies',async()=>{for(const name of ['../Bild.png','Bild.txt','Bild\\x.png']){reset();await assert.rejects(api.attachNoteImage({...await noteArgs(),fileName:name}));assert.equal(writes().length,0);}reset();files.set('/Notes/Projekt/.attachments.8',{id:'99',folder:true,etag:'"folder"',permissions:'GW'});files.set('/Notes/Projekt/.attachments.8/Bild.png',{...files.get('/Bild.png'),id:'101'});await assert.rejects(api.attachNoteImage(await noteArgs()),/vorhanden/);assert.equal(writes().length,0);});
test('Lost upload, unsafe returned path, changed note/source or differing copy remain unknown with one POST and no cleanup',async()=>{for(const f of ['lost','escape','noteChanged','sourceAfter','differentCopy','missingInventory']){reset();const a=await noteArgs();fault=f;const r=await api.attachNoteImage(a);assert.equal(r.outcome,'unknown',f);assert.equal(writes().length,1);assert.doesNotMatch(JSON.stringify(r),/secret-attachment/);assert.ok(!calls.some(c=>c.method==='DELETE'));}});
test('All seven MCP tools require every declared scope before network, with cross-app write policies enforced',async()=>{reset();const tools=new Map();api.registerAttachmentTools({registerTool(n,c,f){tools.set(n,{c,f});}});assert.equal(tools.size,7);for(const [name,{c,f}] of tools){const scopes=c.securitySchemes[0].scopes;for(const missing of scopes){const r=await f({}, {http:{authInfo:{scopes:scopes.filter(s=>s!==missing)}}});assert.equal(r.isError,true,name+' missing '+missing);assert.equal(calls.length,0);}}
 const t=tools.get('deck_attach_file'),context={http:{authInfo:{scopes:t.c.securitySchemes[0].scopes}}};for(const mode of ['off','read']){const policy=api.inheritedPolicy();policy.apps.files=mode;const r=await api.withConnectionPolicy(policy,()=>t.f({},context));assert.equal(r.isError,true);assert.equal(calls.length,0);}
 const n=tools.get('notes_attach_image'),nc={http:{authInfo:{scopes:n.c.securitySchemes[0].scopes}}},np=api.inheritedPolicy();np.apps.notes='write';np.apps.files='off';assert.equal((await api.withConnectionPolicy(np,()=>n.f({},nc))).isError,true);assert.equal(calls.length,0);
 assert.equal(t.c.annotations.openWorldHint,true);assert.match(t.c.description,/spätere Kartenleser/);
});
