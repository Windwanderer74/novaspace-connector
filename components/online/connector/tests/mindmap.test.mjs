// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export { createDeckMcpServer } from './lib/mcp'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export * from './lib/mindmap-core'; export * from './lib/mindmap-deck-core';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/mindmap.mjs'});
const api = await import('../.sites-runtime/test/mindmap.mjs');
const { createMcpHandler } = await import('@modelcontextprotocol/server');
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service',NEXTCLOUD_APP_PASSWORD:'test-only',OAUTH_SIGNING_SECRET:'test-only-key-not-production-123456789',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test'});
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
// Structure from the actual read-only NovaSpace .km snapshot, plus unknown fields
// used only in memory to check preservation. No live project is created by tests.
const source={root:{data:{id:'root',text:'NovaSpace – Arbeitsbereiche',custom:{keep:true}},children:[{data:{id:'dltf7pimag00',created:1790849636677,text:'Dateien und Office'},children:[]},{data:{id:'dltf81eurz40',created:1790849662571,text:'Planung: Deck, Kalender, Aufgaben'},children:[]},{data:{id:'dltf84wt1cg0',created:1790849670186,text:'Kommunikation: Talk, Mail, Kontakte'},children:[]},{data:{id:'dltf87yqw6g0',created:1790849676835,text:'Abläufe: Flow und Genehmigungen'},children:[]}]},template:'default',theme:'fresh-blue',version:'1.4.43',unknown:{preserve:['all',42]}};
const root='/remote.php/dav/files/ChatGPT';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const wrap=s=>`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${s}</d:multistatus>`;
const row=(href,props)=>`<d:response><d:href>${esc(href)}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
let nodes, requests, fault, writes, gets, deckGets, cardDescription;
const tag=n=>`"v${n.rev}"`;
function reset(){nodes=new Map([['/',{id:'1',rev:1,type:'folder',permissions:'GCK'}],['/actual.km',{id:'6044',rev:1,type:'file',permissions:'GW',text:JSON.stringify(source)}]]);requests=[];fault=null;writes=0;gets=0;deckGets=0;cardDescription='';}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,o)=>{
  requests.push({url,o});const href=new URL(url).pathname;const h=new Headers(o.headers);
  if(href.includes('/apps/deck/api/')){assert.equal(o.method,'GET');deckGets++;return new Response(JSON.stringify({id:77,stackId:fault==='card-moved'?8:20,title:'Gewählte Karte',description:fault==='source-race'&&deckGets>1?cardDescription+'\nchanged':cardDescription,done:null,deletedAt:fault==='card-deleted'?1:0}),{status:fault==='card-missing'?404:200});}
  assert.equal(o.redirect,'manual');
  if(href==='/remote.php/dav/')return new Response(wrap(row(href,'<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>')),{status:207});
  const path=decodeURIComponent(href.slice(root.length))||'/';const node=nodes.get(path);
  if(o.method==='PROPFIND'){
    if(fault==='read-after-write'&&writes)return new Response(null,{status:403});
    if(!node)return new Response(null,{status:404});
    return new Response(wrap(row(href,`<d:resourcetype>${node.type==='folder'?'<d:collection/>':''}</d:resourcetype><d:getetag>${tag(node)}</d:getetag><oc:fileid>${node.id}</oc:fileid><oc:permissions>${node.permissions}</oc:permissions><nc:hide-download>${fault==='download-denied'?'true':'false'}</nc:hide-download>`)),{status:207});
  }
  if(o.method==='GET'){
    gets++;assert.equal(h.get('if-match'),tag(node));
    if(fault==='read-race'){node.rev++;}
    return new Response(node.text,{status:200,headers:{etag:tag(node)}});
  }
  assert.equal(o.method,'PUT');writes++;
  if(fault==='put-race')return new Response(null,{status:412});
  if(h.get('if-none-match')==='*'){assert.equal(node,undefined);}else assert.equal(h.get('if-match'),tag(node));
  nodes.set(path,{id:fault==='changed-id'?'999':node?.id??'7000',rev:(node?.rev??0)+1,type:'file',permissions:'GW',text:o.body});
  if(fault==='lost-response')throw new Error('network-secret');
  return new Response(null,{status:node?204:201});
};
async function call(name,args,scopes=['files:read','files:write','deck:read']){
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'test',clientId:'test',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const body=await response.text();const data=response.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(r=>r.id===1):JSON.parse(body);assert.ok(data.result,body);return data.result;
}
const identity={path:'/actual.km',fileId:'6044',etag:'"v1"'};
const rename={action:'rename',nodeId:'dltf7pimag00',text:'Dateien, Office und Mindmaps'};
test('Read supplies original map, parent IDs and exact verified identity without PUT',async()=>{
 reset();const r=await call('mindmap_read',{path:'/actual.km'},['files:read']);assert.equal(r.isError,undefined);assert.deepEqual(r.structuredContent.mindmap,source);assert.equal(r.structuredContent.nodeCount,5);assert.equal(r.structuredContent.nodes[1].parentId,'root');assert.equal(r.structuredContent.fileId,'6044');assert.equal(r.structuredContent.versionVerified,true);assert.equal(writes,0);
});
test('Each write requires read and write scopes, link also requires deck read; no network before grant',async()=>{
 for(const [name,args] of [['mindmap_create',{path:'/new.km',rootId:'root',title:'NovaSpace'}],['mindmap_update_nodes',{...identity,operations:[rename]}],['mindmap_link_card',{...identity,nodeId:'root',boardId:5,stackId:20,cardId:77}]]){
  for(const scopes of [['files:read'],['files:write']]){reset();const r=await call(name,args,scopes);assert.equal(r.isError,true);assert.equal(requests.length,0);}
 }
 reset();const r=await call('mindmap_link_card',{...identity,nodeId:'root',boardId:5,stackId:20,cardId:77},['files:read','files:write']);assert.equal(r.isError,true);assert.equal(requests.length,0);
});
test('Create verifies root and refuses existing files without overwrite',async()=>{
 reset();const r=await call('mindmap_create',{path:'/new.km',rootId:'project-root',title:'NovaSpace'});assert.equal(r.structuredContent.verified,true);assert.equal(JSON.parse(nodes.get('/new.km').text).root.data.id,'project-root');
 const duplicate=await call('mindmap_create',{path:'/new.km',rootId:'project-root',title:'Changed'});assert.equal(duplicate.isError,true);assert.equal(writes,1);
});
test('Atomic operation batch preserves metadata, unknown fields and untouched branches',async()=>{
 reset();const r=await call('mindmap_update_nodes',{...identity,operations:[rename,{action:'add',nodeId:'selected-step',parentId:'dltf7pimag00',text:'Ausgewählter Arbeitsschritt'},{action:'set_note',nodeId:'selected-step',note:'Eine konkrete Frage'},{action:'move',nodeId:'selected-step',parentId:'dltf81eurz40',index:0}]});assert.equal(r.structuredContent.verified,true);assert.equal(r.structuredContent.operationsApplied,4);assert.equal(r.structuredContent.fileId,'6044');assert.equal(writes,1);
 const map=JSON.parse(nodes.get('/actual.km').text);assert.deepEqual(map.unknown,source.unknown);assert.deepEqual(map.root.data,source.root.data);assert.equal(map.version,source.version);assert.equal(map.theme,source.theme);assert.equal(map.root.children[0].data.created,source.root.children[0].data.created);assert.deepEqual(map.root.children.slice(2),source.root.children.slice(2));assert.equal(map.root.children[1].children[0].data.note,'Eine konkrete Frage');
});
test('Duplicate IDs, cycles, root moves, missing nodes and bad late operation abort entire batch',async()=>{
 for(const op of [{action:'add',parentId:'root',nodeId:'root',text:'Duplicate'},{action:'move',nodeId:'root',parentId:'dltf7pimag00'},{action:'move',nodeId:'dltf7pimag00',parentId:'dltf7pimag00'},{action:'rename',nodeId:'absent',text:'Missing'},{action:'move',nodeId:'dltf7pimag00',parentId:'root',index:999}]){
  reset();const r=await call('mindmap_update_nodes',{...identity,operations:[rename,op]});assert.equal(r.isError,true);assert.equal(writes,0);assert.equal(nodes.get('/actual.km').text,JSON.stringify(source));
 }
});
test('Same-parent move uses position after removal; source object remains unmodified',()=>{
 const moved=api.changeMindmap(source,[{action:'move',nodeId:'dltf7pimag00',parentId:'root',index:2}]);assert.equal(moved.root.children[2].data.id,'dltf7pimag00');assert.equal(source.root.children[0].data.id,'dltf7pimag00');
 const nested=api.changeMindmap(source,[{action:'add',nodeId:'child',parentId:'dltf7pimag00',text:'child'}]);assert.throws(()=>api.changeMindmap(nested,[{action:'move',nodeId:'dltf7pimag00',parentId:'child'}]),/Nachkommen/);
});
test('Stale version, wrong file identity, denied permission and download prohibition never write',async()=>{
 for(const args of [{...identity,etag:'"stale"'},{...identity,fileId:'999'}]){reset();const r=await call('mindmap_update_nodes',{...args,operations:[rename]});assert.equal(r.isError,true);assert.equal(writes,0);}
 reset();nodes.get('/actual.km').permissions='G';assert.equal((await call('mindmap_update_nodes',{...identity,operations:[rename]})).isError,true);assert.equal(writes,0);
 reset();fault='download-denied';assert.equal((await call('mindmap_read',{path:'/actual.km'})).isError,true);assert.equal(gets,0);assert.equal(writes,0);
});
test('GET/PUT races produce errors; PUT not retried',async()=>{
 reset();fault='read-race';assert.equal((await call('mindmap_read',{path:'/actual.km'})).isError,true);assert.equal(writes,0);
 reset();fault='put-race';assert.equal((await call('mindmap_update_nodes',{...identity,operations:[rename]})).isError,true);assert.equal(writes,1);assert.equal(nodes.get('/actual.km').text,JSON.stringify(source));
});
test('Lost response reconciles; failed readback and replaced identity remain unverified',async()=>{
 reset();fault='lost-response';const a=await call('mindmap_update_nodes',{...identity,operations:[rename]});assert.equal(a.structuredContent.writeAccepted,null);assert.equal(a.structuredContent.verified,true);assert.equal(writes,1);assert.doesNotMatch(JSON.stringify(a),/network-secret/);
 for(const mode of ['read-after-write','changed-id']){reset();fault=mode;const r=await call('mindmap_update_nodes',{...identity,operations:[rename]});assert.equal(r.structuredContent.verified,false);assert.equal(r.structuredContent.operationsApplied,null);assert.equal(writes,1);}
});
test('Deck link uses native fields, preserves node, never creates card; repeated link is no-op',async()=>{
 reset();const args={...identity,nodeId:'dltf7pimag00',boardId:5,stackId:20,cardId:77};const r=await call('mindmap_link_card',args);assert.equal(r.structuredContent.verified,true);assert.equal(r.structuredContent.cardCreated,false);assert.equal(deckGets,1);const map=JSON.parse(nodes.get('/actual.km').text);assert.equal(map.root.children[0].data.hyperlink,'https://cloud.example.test/index.php/apps/deck/card/77');assert.equal(map.root.children[0].data.created,source.root.children[0].data.created);
 const again=await call('mindmap_link_card',{...args,etag:'"v2"'});assert.equal(again.structuredContent.unchanged,true);assert.equal(writes,1);assert.ok(requests.every(r=>r.o.method!=='POST'));
});
test('Different existing link, deleted or stale/missing card prevents file writes',async()=>{
 for(const mode of ['card-missing','card-deleted','card-moved','existing-link']){reset();fault=mode;if(mode==='existing-link'){const map=structuredClone(source);map.root.data.hyperlink='https://example.test/existing';nodes.get('/actual.km').text=JSON.stringify(map);}const r=await call('mindmap_link_card',{...identity,nodeId:'root',boardId:5,stackId:20,cardId:77});assert.equal(r.isError,true,mode);assert.equal(writes,0);}
});
test('Malformed JSON, duplicate IDs, binary, oversized or overdeep tree rejected',()=>{
 for(const text of ['{}','[1]','invalid','\0',JSON.stringify({root:{data:{id:'root',text:'a'},children:[{data:{id:'root',text:'duplicate'}}]}}),JSON.stringify({...source,padding:'ü'.repeat(65537)})])assert.throws(()=>api.parseMindmap(text));
 const deep={root:{data:{id:'r',text:'r'},children:[]}};let last=deep.root;for(let i=0;i<65;i++){const child={data:{id:String(i),text:String(i)},children:[]};last.children.push(child);last=child;}assert.throws(()=>api.parseMindmap(JSON.stringify(deep)),/Ebenen/);
});
test('Traversal and non-km paths, bad ETags and empty operation list fail before network',async()=>{
 for(const path of ['/../x.km','//x.km','/a\\b.km','/x.json','https://foreign.test/x.km']){reset();assert.equal((await call('mindmap_read',{path})).isError,true);assert.equal(requests.length,0);}
 for(const etag of ['*','W/"v1"','"v1"\r\nx']){reset();assert.equal((await call('mindmap_update_nodes',{...identity,etag,operations:[rename]})).isError,true);assert.equal(requests.length,0);}
 reset();assert.equal((await call('mindmap_update_nodes',{...identity,operations:[]})).isError,true);assert.equal(requests.length,0);
});
process.on('exit',()=>{globalThis.fetch=originalFetch;});

const list=(rows)=>`<!-- nf-checklist:pilot:start -->\n${rows}\n<!-- nf-checklist:pilot:end -->`;
const rows='- [x] Zuordnung prüfen <!-- nf-task:binding -->\n- [ ] Punkte spiegeln <!-- nf-task:mirror -->';
const syncArgs={...identity,nodeId:'dltf81eurz40',boardId:5,stackId:20,cardId:77,checklistId:'pilot'};
test('Checklist only counts selected area, ignores code examples, accepts checked case and CRLF',()=>{
 const desc='```markdown\n'+list(rows)+'\n```\n- [x] Other list\n'+list(rows.replace('[x]','[X]'));
 assert.deepEqual(api.parseDeckChecklist(desc.replaceAll('\n','\r\n'),'pilot'),[{id:'binding',text:'Zuordnung prüfen',done:true},{id:'mirror',text:'Punkte spiegeln',done:false}]);
 assert.equal(api.parseDeckChecklist(list(''),'pilot').length,0);
});
test('Malformed, duplicate and ambiguous work lists rejected, not silently counted',()=>{
 for(const desc of ['',list(rows)+list(rows),list(rows.replace('nf-task:mirror','nf-task:binding')),list('- [x] No stable ID'),list('    - [x] Nested <!-- nf-task:n -->'),list('```\n'+rows+'\n```'),list(rows).replace('pilot:end','other:end')])assert.throws(()=>api.parseDeckChecklist(desc,'pilot'));
});
test('Exact percentage and conservative native icon; empty is undefined and incomplete never full',()=>{
 const make=(n,d)=>Array.from({length:n},(_,i)=>({id:String(i),text:String(i),done:i<d}));
 assert.equal(api.checklistProgress(make(10,5)).percent,50);assert.equal(api.checklistProgress(make(10,8)).percent,80);
 assert.equal(api.checklistProgress(make(3,1)).percent,33.33);assert.equal(api.checklistProgress(make(100,99)).icon,8);
 assert.equal(api.checklistProgress(make(10,10)).icon,9);assert.equal(api.checklistProgress([]).percent,null);assert.equal(api.checklistProgress([]).allChecked,false);
});
test('Projection preserves unrelated content, IDs and metadata; repetition is identical',()=>{
 const binding={boardId:5,cardId:77,checklistId:'pilot'},items=api.parseDeckChecklist(list(rows),'pilot');
 const a=api.projectDeckChecklist(source,'dltf81eurz40',binding,items,'https://cloud.example.test/index.php/apps/deck/card/77',false);
 assert.equal(a.changed,true);assert.deepEqual(a.map.root.children[0],source.root.children[0]);assert.deepEqual(a.map.unknown,source.unknown);
 const b=api.projectDeckChecklist(a.map,'dltf81eurz40',binding,items,'https://cloud.example.test/index.php/apps/deck/card/77',false);
 assert.equal(b.changed,false);assert.deepEqual(b.map,a.map);assert.deepEqual(source.root.children[1].children,[]);
});
test('Stable tasks retain their identity on rename/reorder; reopening and removal are derived',()=>{
 const binding={boardId:5,cardId:77,checklistId:'pilot'},url='https://cloud.example.test/index.php/apps/deck/card/77';
 const a=api.projectDeckChecklist(source,'dltf81eurz40',binding,api.parseDeckChecklist(list(rows),'pilot'),url,false);
 const node=a.map.root.children[1], oldId=node.children[0].children[0].data.id;
 node.children[0].children[0].data.custom='keep';
 const b=api.projectDeckChecklist(a.map,'dltf81eurz40',binding,[{id:'mirror',text:'Andere Bezeichnung',done:true},{id:'binding',text:'Zuordnung erneut',done:false}],url,false);
 assert.equal(b.map.root.children[1].children[0].children[1].data.id,oldId);assert.equal(b.map.root.children[1].children[0].children[1].data.custom,'keep');assert.equal(b.progress.percent,50);
 assert.throws(()=>api.projectDeckChecklist(b.map,'dltf81eurz40',binding,[],url,true),/eigene Inhalte/);
 delete b.map.root.children[1].children[0].children[1].data.custom;
 const c=api.projectDeckChecklist(b.map,'dltf81eurz40',binding,[],url,true);assert.equal(c.progress.percent,null);assert.equal(c.statusConflict,true);
});
test('Foreign binding, links or own container contents cannot be overwritten',()=>{
 const binding={boardId:5,cardId:77,checklistId:'pilot'},url='https://cloud.example.test/index.php/apps/deck/card/77',items=api.parseDeckChecklist(list(rows),'pilot');
 let a=api.projectDeckChecklist(source,'dltf81eurz40',binding,items,url,false);
 assert.throws(()=>api.projectDeckChecklist(a.map,'dltf81eurz40',{...binding,cardId:78},items,url,false),/Zuordnung/);
 a.map.root.children[1].children[0].children.push({data:{id:'own',text:'Own note'}});
 assert.throws(()=>api.projectDeckChecklist(a.map,'dltf81eurz40',binding,items,url,false),/eigene Inhalte/);
 const foreign=structuredClone(source);foreign.root.children[1].data.hyperlink='https://example.test/other';assert.throws(()=>api.projectDeckChecklist(foreign,'dltf81eurz40',binding,items,url,false),/anderen Link/);
});
test('MCP sync uses scopes, guarded PUT and exact readback; repeated sync is no-op',async()=>{
 reset();cardDescription=list(rows);const r=await call('mindmap_sync_card',syncArgs);assert.equal(r.structuredContent.verified,true);assert.equal(r.structuredContent.progress.percent,50);assert.equal(writes,1);assert.equal(deckGets,2);
 const stored=JSON.parse(nodes.get('/actual.km').text).root.children[1].data.nfDeckSync;assert.match(stored.sourceFingerprint,/^[a-f0-9]{64}$/);assert.ok(stored.syncedAt);
 const again=await call('mindmap_sync_card',{...syncArgs,etag:'"v2"'});assert.equal(again.structuredContent.unchanged,true);assert.equal(writes,1);assert.deepEqual(JSON.parse(nodes.get('/actual.km').text).root.children[1].data.nfDeckSync,stored);
 for(const scopes of [['files:read','deck:read'],['files:read','files:write']]){reset();const denied=await call('mindmap_sync_card',syncArgs,scopes);assert.equal(denied.isError,true);assert.equal(requests.length,0);}
});
test('Source race, stale target, lost response and PUT conflict reconcile without blind retry',async()=>{
 reset();cardDescription=list(rows);fault='source-race';assert.equal((await call('mindmap_sync_card',syncArgs)).isError,true);assert.equal(writes,0);
 reset();cardDescription=list(rows);assert.equal((await call('mindmap_sync_card',{...syncArgs,etag:'"stale"'})).isError,true);assert.equal(writes,0);
 reset();cardDescription=list(rows);fault='put-race';assert.equal((await call('mindmap_sync_card',syncArgs)).isError,true);assert.equal(writes,1);
 reset();cardDescription=list(rows);fault='lost-response';assert.equal((await call('mindmap_sync_card',syncArgs)).structuredContent.verified,true);assert.equal(writes,1);
 reset();cardDescription=list(rows);fault='read-after-write';assert.equal((await call('mindmap_sync_card',syncArgs)).structuredContent.verified,false);assert.equal(writes,1);
});
