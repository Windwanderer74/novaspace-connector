// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:"export * from './lib/notes'; export * from './lib/deck-planning'; export * from './lib/connection-policy'; export {setDeckRuntimeConfig} from './lib/runtime-config'; export {registerPlanningTools,PLANNING_TOOL_NAMES} from './lib/mcp-planning';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/planning.mjs'});
const api=await import('../.sites-runtime/test/planning.mjs');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'fixture',NEXTCLOUD_APP_PASSWORD:'never-expose-test-password',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',OAUTH_SIGNING_SECRET:'test-only-signing-key-12345678901234567890'});
const original=globalThis.fetch;after(()=>globalThis.fetch=original);
let board,cards,note,calls,fault;
const root='/index.php/apps/deck/api/v1.0/boards/5';
function reset(){board={id:5,title:'Planung',archived:false,labels:[{id:7,title:'Wichtig',color:'FF0000'}],users:[{uid:'Soul'}],permissions:{PERMISSION_EDIT:true,PERMISSION_MANAGE:true}};cards=[{id:10,stackId:20,title:'Offen',description:'Original',archived:false,done:null,labels:[],assignedUsers:[]},{id:11,stackId:20,title:'Archiv',description:'Alt',archived:true,done:'2026-10-22',labels:[],assignedUsers:[]}];note={id:8,title:'Notiz',content:'Original',category:'Projekt',favorite:false,readonly:false,etag:'v1'};calls=[];fault=null;}
function nr(data,headers={}){return Response.json(data,{headers:{'X-Notes-API-Versions':'0.2,1.4',...headers}});}
globalThis.fetch=async(url,o)=>{
 const path=new URL(url).pathname;calls.push({path,o});assert.equal(o.redirect,'manual');assert.ok(o.signal);assert.ok(url.startsWith('https://cloud.example.test/'));
 if(path==='/remote.php/dav/')return new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});
 if(fault==='redirect')return new Response(null,{status:302,headers:{location:'https://foreign.test'}});
 if(path.startsWith('/index.php/apps/notes/')){
  if(path.endsWith('/settings'))return fault==='oldApi'?Response.json({}):nr({notesPath:'Notes',fileSuffix:'.txt'});
  if(path.endsWith('/notes')&&o.method==='GET'){
   if(fault==='lastChunk')return nr([note,{id:99},{id:100}]);
   return nr([note],{'X-Notes-Chunk-Cursor':'opaque-cursor','X-Notes-Chunk-Pending':'1'});
  }
  if(o.method==='GET')return fault==='readback'&&note.etag==='v2'?new Response(null,{status:503}):nr(note);
  if(fault==='conflict')return new Response(null,{status:412});
  if(o.method==='PUT'){assert.equal(new Headers(o.headers).get('If-Match'),'"v1"');note={...note,...JSON.parse(o.body),etag:'v2'};}
  if(o.method==='POST')note={...note,...JSON.parse(o.body),etag:'v2'};
  if(fault==='lost')throw new Error('never-expose-test-password');
  return nr(note);
 }
 if(path===root)return Response.json(board);
 if(path===root+'/stacks'||path===root+'/stacks/archived')return Response.json([{id:20,boardId:fault==='foreignStack'?6:5,title:'In Arbeit',cards:cards.filter(c=>c.archived===path.endsWith('/archived'))}]);
 if(path===root+'/stacks/20/cards/10')return Response.json(cards[0]);
 if(path.includes('/labels')){const p=JSON.parse(o.body);board.labels.push({id:9,...p});return Response.json({id:9,...p});}
 const c=cards[0],p=JSON.parse(o.body);
 if(path.endsWith('/assignLabel'))c.labels.push({id:p.labelId});
 if(path.endsWith('/removeLabel'))c.labels=c.labels.filter(x=>x.id!==p.labelId);
 if(path.endsWith('/assignUser'))c.assignedUsers.push({participant:{uid:p.userId}});
 if(path.endsWith('/unassignUser'))c.assignedUsers=c.assignedUsers.filter(x=>x.participant.uid!==p.userId);
 return Response.json(c);
};
const writes=()=>calls.filter(c=>['POST','PUT','DELETE'].includes(c.o.method));
const selection=()=>({boardId:5,archive:'all',status:'all',limit:1,offset:0});
async function guard(){const c=await api.readPlanningCard(5,20,10);return {boardId:5,stackId:20,cardId:10,expectedAccount:'ChatGPT',expectedVersion:c.version,expectedBoardVersion:c.boardVersion,present:true};}
test('Notes chunk search retains cursor even for an empty matching page; final ID-only index is accepted',async()=>{reset();let r=await api.listNotes({limit:1,query:'absent'});assert.deepEqual(r.notes,[]);assert.equal(r.nextCursor,'opaque-cursor');assert.equal(r.complete,false);fault='lastChunk';r=await api.listNotes({limit:1,cursor:r.nextCursor});assert.equal(r.notes[0].id,8);assert.equal(r.indexOnlyEntries,2);assert.equal(r.complete,true);});
test('Notes patch sends only requested fields with native If-Match; preserves content/category/favorite',async()=>{reset();const r=await api.updateNote({id:8,etag:'v1',expectedAccount:'ChatGPT',title:'Neu'});assert.equal(r.outcome,'verified');assert.deepEqual(JSON.parse(writes()[0].o.body),{title:'Neu'});assert.equal(r.note.content,'Original');assert.equal(r.note.category,'Projekt');assert.equal(r.note.favorite,false);assert.equal(r.atomicVersionCondition,false);});
test('Stale note, wrong account and native readonly stop before writes',async()=>{for(const mode of ['etag','account','readonly']){reset();if(mode==='readonly')note.readonly=true;await assert.rejects(api.updateNote({id:8,etag:mode==='etag'?'old':'v1',expectedAccount:mode==='account'?'Soul':'ChatGPT',content:'Neu'}));assert.equal(writes().length,0);}});
test('Readonly native note still permits favorite only',async()=>{reset();note.readonly=true;assert.equal((await api.updateNote({id:8,etag:'v1',expectedAccount:'ChatGPT',favorite:true})).outcome,'verified');assert.equal(note.content,'Original');});
test('Native precondition conflict does not retry; lost write response is redacted and not repeated',async()=>{for(const f of ['conflict','lost']){reset();fault=f;await assert.rejects(api.updateNote({id:8,etag:'v1',expectedAccount:'ChatGPT',content:'Neu'}),e=>!e.message.includes('never-expose')&&/Versionskonflikt|unbekannt/.test(e.message));assert.equal(writes().length,1);}});
test('Notes create verifies API before POST and returns known ID on lost readback',async()=>{reset();fault='oldApi';await assert.rejects(api.createNote({expectedAccount:'ChatGPT',title:'Neu',content:'Text'}));assert.equal(writes().length,0);reset();fault='readback';const r=await api.createNote({expectedAccount:'ChatGPT',title:'Neu',content:'Text'});assert.equal(r.outcome,'unknown');assert.equal(r.id,8);assert.equal(writes().length,1);});
test('Deck includes explicit archive and protects subsequent pages against changed snapshot',async()=>{reset();const a=selection(),r=await api.listPlanningCards(a);assert.equal(r.total,2);assert.equal(r.cards[0].id,10);const p=await api.listPlanningCards({...a,offset:1,expectedSnapshot:r.snapshot});assert.equal(p.cards[0].id,11);cards[1].title='Changed';await assert.rejects(api.listPlanningCards({...a,offset:1,expectedSnapshot:r.snapshot}),/verändert/);await assert.rejects(api.listPlanningCards({...a,offset:1}),/Seitennachweis/);});
test('Deck status/label/assignee filters use active cards; archive assignment limitation is explicit',async()=>{reset();cards[0].labels=[{id:7}];cards[0].assignedUsers=[{participant:{uid:'Soul'}}];const a={...selection(),archive:'active',status:'open',labelId:7,assignee:'Soul'};assert.equal((await api.listPlanningCards(a)).total,1);await assert.rejects(api.listPlanningCards({...a,archive:'all'}),/Archiv/);fault='foreignStack';await assert.rejects(api.listPlanningCards({...selection(),archive:'active'}),/Fremde/);});
test('Deck labels/assignments preserve other relations and content, and repeat becomes unchanged',async()=>{reset();cards[0].labels=[{id:6}];let r=await api.setPlanningCardRelation({...await guard(),labelId:7});assert.equal(r.outcome,'verified');assert.deepEqual(cards[0].labels.map(l=>l.id),[6,7]);assert.equal(cards[0].description,'Original');r=await api.setPlanningCardRelation({...await guard(),labelId:7});assert.equal(r.outcome,'unchanged');assert.equal(writes().length,1);r=await api.setPlanningCardRelation({...await guard(),userId:'Soul'});assert.equal(r.outcome,'verified');});
test('Deck denies stale versions, unknown members and insufficient native permissions before mutation',async()=>{for(const f of ['version','member','permission']){reset();const a=await guard();if(f==='version')a.expectedVersion='0'.repeat(64);if(f==='permission')board.permissions.PERMISSION_EDIT=false;await assert.rejects(api.setPlanningCardRelation({...a,userId:f==='member'?'stranger':'Soul'}));assert.equal(writes().length,0);}});
test('Deck label creation checks native manage right, duplicate title and board version',async()=>{reset();const a={boardId:5,title:'Wichtig',color:'00FF00',expectedAccount:'ChatGPT',expectedBoardVersion:(await api.readPlanningBoard(5)).version};await assert.rejects(api.savePlanningLabel(a),/bereits/);assert.equal(writes().length,0);assert.equal((await api.savePlanningLabel({...a,title:'Plan'})).outcome,'verified');});
test('Redirect errors never expose credentials or retry a native request',async()=>{reset();fault='redirect';await assert.rejects(api.readNote(8),/HTTP 302/);assert.equal(calls.length,1);});
test('Legacy policy adds Notes off without changing input or existing app modes; null is invalid',()=>{reset();const p=api.inheritedPolicy();for(const app of ['notes','tasks','contacts'])delete p.apps[app];const original=JSON.stringify(p);assert.equal(api.parseConnectionPolicy(p).apps.notes,'off');assert.equal(JSON.stringify(p),original);assert.equal(api.inheritedPolicy().apps.notes,'off');assert.throws(()=>api.parseConnectionPolicy({...api.inheritedPolicy(),apps:{...api.inheritedPolicy().apps,notes:null}}));});
test('Every new MCP tool checks both scopes before data access and has deliberate app mapping',async()=>{reset();const callbacks=new Map();api.registerPlanningTools({registerTool(n,c,f){callbacks.set(n,{c,f});}});assert.equal(callbacks.size,api.PLANNING_TOOL_NAMES.length);for(const [name,{c,f}] of callbacks){assert.equal(api.appForTool(name),name.startsWith('notes_')?'notes':'deck');assert.ok(c.securitySchemes[0].scopes.length);const r=await f({},{});assert.equal(r.isError,true);assert.equal(calls.length,0);}});
