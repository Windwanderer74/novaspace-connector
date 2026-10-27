// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
await build({stdin:{contents:`export * from './lib/deck-mindmap-workflow'; export { planningVersion } from './lib/planning-json'; export { createDeckMcpServer } from './lib/mcp'; export { syncMindmapCard } from './lib/mindmap-deck'; export { readTaskDescription, writeTaskDescription } from './lib/shared-task-content'; export { addConditionList, replaceConditionList } from './lib/mindmap-workflow-core'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { projectDeckChecklist, registerMindmapProgress } from './lib/mindmap-deck-core';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/deck-workflow.mjs'});
const api=await import('../.sites-runtime/test/deck-workflow.mjs');
const {createMcpHandler}=await import('@modelcontextprotocol/server');
const handler=createMcpHandler(()=>api.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service',NEXTCLOUD_APP_PASSWORD:'test-only'});
const binding={version:1,path:'/actual.km',fileId:'6044',nodeId:'block',checklistId:'pilot'};
const marker=`<!-- nf-mindmap:${JSON.stringify(binding)} -->`;
const rows=['- [x] First task <!-- nf-task:first -->','- [ ] Second task <!-- nf-task:second -->'];
const list=r=>`<!-- nf-checklist:pilot:start -->\n${r.join('\n')}\n<!-- nf-checklist:pilot:end -->`;
const source={root:{data:{id:'root',text:'Project'},children:[{data:{id:'block',text:'Work'},children:[]},{data:{id:'unrelated',text:'Other project',custom:{keep:true}},children:[]}]},theme:'fresh-blue'};
const baseMap=api.projectDeckChecklist(api.registerMindmapProgress(source,['root']),'block',{boardId:5,cardId:77,checklistId:'pilot'},[{id:'first',text:'First task',done:true},{id:'second',text:'Second task',done:false}],'https://cloud.example.test/index.php/apps/deck/card/77',false).map;
const ids={boardId:5,stackId:20,cardId:77};
const scopes=['deck:write','deck:read','files:read','files:write'];
let card,map,rev,requests,fault,deckGets;
function reset(){card={id:77,stackId:20,title:'◑ Work',description:marker+'\nKeep this note\n'+list(rows),type:'plain',owner:{uid:'service'},order:7,duedate:'2026-10-12T12:00:00Z',startdate:'2026-10-10T10:00:00Z',color:'12AB34',done:null,archived:false};map=structuredClone(baseMap);rev=1;requests=[];fault=null;deckGets=0;}
const tag=()=>`"v${rev}"`;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,o)=>{
  const path=new URL(url).pathname;requests.push({path,method:o.method});
  if(path.includes('/apps/deck/api/')){
    if(o.method==='PUT'){const body=JSON.parse(o.body);for(const key of ['taskDescription','syncTaskContent','expectedVersion','expectedMapEtag'])assert.equal(body[key],undefined);card={...card,...body};return Response.json(card);}
    deckGets++;if(fault==='source-race'&&deckGets===2)card.description+='\nAnother author';
    if(fault==='late-source-race'&&deckGets===3)card.description+='\nLater author';
    if(fault==='metadata-race'&&deckGets===2)card.color='FFFFFF';
    if(fault==='saved-source-race'&&deckGets===5)card.archived=true;
    return Response.json(card);
  }
  if(o.method==='PROPFIND'){
    const principal=path==='/remote.php/dav/';
    const props=principal?'<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>':`<d:resourcetype/><d:getetag>${tag()}</d:getetag><oc:fileid>${fault==='foreign-file'?'999':'6044'}</oc:fileid><oc:permissions>${fault==='readonly-map'?'G':'GW'}</oc:permissions>`;
    return new Response(`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>${path}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,{status:207});
  }
  if(o.method==='GET')return new Response(JSON.stringify(map),{headers:{etag:tag()}});
  assert.equal(o.method,'PUT');assert.equal(new Headers(o.headers).get('if-match'),tag());
  if(fault==='target-race')return new Response(null,{status:412});
  map=JSON.parse(o.body);rev++;return new Response(null,{status:204});
};
const writes=()=>requests.filter(x=>x.method==='PUT');
test('Linked edit mirrors checked rows, adjusts both graphics and preserves other work',async()=>{
  reset();const originalOther=structuredClone(map.root.children[1]);
  const r=await edit({...ids,description:card.description.replace('[ ] Second','[x] Second')},scopes);
  assert.equal(r.card.title,'● Work');assert.equal(r.mindmap.verified,true);assert.equal(r.mindmap.completed,2);assert.equal(r.mindmap.total,2);
  assert.equal(map.root.children[0].data.progress,9);assert.deepEqual(map.root.children[1],originalOther);
  assert.equal(map.root.data.progress,9);assert.equal(map.root.data.nfDeckAggregate.completed,2);assert.equal(map.root.data.nfDeckAggregate.total,2);
  assert.equal(card.duedate,'2026-10-12T12:00:00Z');assert.equal(card.archived,false);assert.equal(card.done,null);assert.match(card.description,/Keep this note/);
  assert.equal(card.startdate,'2026-10-10T10:00:00Z');assert.equal(card.color,'12AB34');
});
test('A new unmarked task gets a stable hidden ID; repeating, reordering and reopening remain consistent',async()=>{
  reset();let r=await edit({...ids,description:card.description.replace('<!-- nf-checklist:pilot:end -->','- [ ] New task\n<!-- nf-checklist:pilot:end -->')},scopes);
  assert.equal(r.mindmap.total,3);assert.equal(r.mindmap.completed,1);
  const id=card.description.match(/New task <!-- nf-task:([^ ]+) -->/)[1];assert.match(id,/^task_/);
  const before=writes().length;r=await edit({...ids,description:card.description},scopes);
  assert.equal(r.mindmap.unchanged,true);assert.equal(writes().length,before);
  r=await edit({...ids,description:marker+'\n'+list([`- [x] New name <!-- nf-task:${id} -->`,rows[1],rows[0].replace('[x]','[ ]')])},scopes);
  assert.equal(r.mindmap.total,3);assert.equal(r.mindmap.completed,1);
  assert.equal(map.root.children[0].children[0].children[0].data.nfDeckTaskId,id);
});
test('Missing file permissions, conflicting bindings and foreign file IDs stop before either write',async()=>{
  for(const kind of ['scope','binding','foreign-file','remove-marker']){
    reset();if(kind==='binding')map.root.children[0].data.nfDeckSync.cardId=99;
    if(kind==='foreign-file')fault=kind;
    const description=kind==='remove-marker'?card.description.replace(marker,''):card.description;
    await assert.rejects(edit({...ids,description},kind==='scope'?['deck:write','deck:read']:scopes));assert.equal(writes().length,0,kind);
  }
});
test('Source race prevents writes; target conflict reports saved Deck and pending map without replay',async()=>{
  reset();fault='source-race';await assert.rejects(edit({...ids,description:card.description.replace('[ ] Second','[x] Second')},scopes));assert.equal(writes().length,0);
  reset();fault='target-race';const r=await edit({...ids,description:card.description.replace('[ ] Second','[x] Second')},scopes);
  assert.equal(r.card.title,'● Work');assert.equal(r.mindmap.verified,false);assert.equal(r.mindmap.pending,true);
  assert.equal(writes().filter(x=>x.path.includes('/apps/deck/')).length,1);assert.equal(map.root.children[0].data.progress,5);
});
test('Ordinary cards need no file scopes and trigger no map requests',async()=>{
  reset();card.description='Ordinary work';card.title='Original';const r=await edit({...ids,title:'Renamed'},['deck:write']);
  assert.equal(r.card.title,'Renamed');assert.equal(r.mindmap,undefined);assert.ok(requests.every(x=>x.path.includes('/apps/deck/')));
});
test('Empty tasks remain empty; title markers do not multiply and incomplete work is never shown full',()=>{
  assert.equal(api.deckProgressTitle('Work',0,0),'○ Work');assert.equal(api.deckProgressTitle('◕ Work',100,99),'◕ Work');assert.equal(api.deckProgressTitle('◑ Work',4,1),'◔ Work');
  assert.equal(api.cardMindmapBinding('```\n'+marker+'\n```'),null);assert.throws(()=>api.cardMindmapBinding(marker+'\n'+marker));
});
test('Checklist examples in code fences remain byte-for-byte unchanged',()=>{
  const example='````markdown\n'+list(['- [ ] Example without ID'])+'\n```\n<!-- nf-mindmap:{bad} -->\n````';
  const desc=example+'\n'+marker+'\n'+list(rows);
  assert.deepEqual(api.cardMindmapBinding(desc),binding);
  assert.equal(api.normalizeWorkflowChecklist(desc,'pilot',marker+'\n'+list(rows)),desc);
});
process.on('exit',()=>{globalThis.fetch=nativeFetch;});

test('Connector edits share all named condition lists with the browser and project one card',async()=>{
 reset();let description=api.addConditionList(card.description,binding,{id:'review',title:'Review'});description=api.replaceConditionList(description,binding,{id:'review',title:'Review'},[{id:'third',text:'Review condition',done:false}]);
 let result=await edit({...ids,description},scopes);assert.equal(result.mindmap.verified,true);assert.equal(result.mindmap.total,3);assert.equal(map.root.children[0].children.length,2);assert.equal(map.root.data.nfDeckAggregate.total,3);
 description=card.description.replace('[ ] Review condition','[x] Review condition');result=await edit({...ids,description},scopes);assert.equal(result.mindmap.completed,2);assert.equal(map.root.children[0].children[1].children[0].data.nfDeckTaskId,'third');
});

async function edit(input,allowed=scopes){
 const guards=input.taskDescription===undefined?{}:{expectedVersion:await api.planningVersion(card),expectedMapEtag:tag()};
 return api.updateCardInMindmapWorkflow({...guards,...input},allowed);
}
const work=()=>map.root.children[0].data;
const reconcile=()=>edit({...ids,syncTaskContent:true},scopes);
test('MCP shared title and description retain notes, history, goals, IDs and all native PUT fields',async()=>{
 reset();work().note='Only on the map';work().custom={keep:true};const other=structuredClone(map.root.children[1]);
 const r=await edit({...ids,title:'Named together',taskDescription:'First paragraph\n\nShared detail'},scopes);
 assert.equal(r.card.title,'◑ Named together');assert.equal(r.taskContent.description,'First paragraph\n\nShared detail');
 assert.equal(api.readTaskDescription(card.description),work().nfTaskContent.description);assert.equal(work().nfDeckSync.content.title,'Named together');
 assert.equal(work().text,'Named together · 1/2 · 50 %');assert.equal(work().note,'Only on the map');assert.deepEqual(work().custom,{keep:true});assert.deepEqual(map.root.children[1],other);
 assert.match(card.description,/Keep this note/);assert.deepEqual(work().nfDeckSync.items.map(i=>i.id),['first','second']);
 assert.equal(card.duedate,'2026-10-12T12:00:00Z');assert.equal(card.startdate,'2026-10-10T10:00:00Z');assert.equal(card.order,7);assert.equal(typeof card.owner==='string'?card.owner:card.owner.uid,'service');assert.equal(card.color,'12AB34');assert.equal(card.done,null);assert.equal(card.archived,false);
 const before=writes().length;const again=await reconcile();assert.equal(again.mindmap.unchanged,true);assert.equal(writes().length,before);
});
test('Map-side content and disjoint changes reconcile into the same card without changing the planning note',async()=>{
 reset();await reconcile();work().note='Separate';work().text='From map';work().nfTaskContent.description='Map description';
 let r=await reconcile();assert.equal(r.card.title,'◑ From map');assert.equal(api.readTaskDescription(card.description),'Map description');assert.equal(work().note,'Separate');
 work().text='Another map name';r=await edit({...ids,taskDescription:'Different field from MCP'},scopes);
 assert.equal(r.taskContent.title,'Another map name');assert.equal(work().nfTaskContent.description,'Different field from MCP');
});
test('Full card-body edits still update the managed description and preserve fenced examples and other prose',async()=>{
 reset();await edit({...ids,taskDescription:'Before'},scopes);
 const example='\n```html\n<!-- nf-task-content:start -->\nExample\n<!-- nf-task-content:end -->\n```\n';
 const body=api.writeTaskDescription(card.description,'Through full body')+example;
 const r=await edit({...ids,description:body},scopes);
 assert.equal(r.taskContent.description,'Through full body');assert.ok(card.description.endsWith(example));
 await edit({...ids,taskDescription:''},scopes);assert.equal(work().nfTaskContent.description,'');assert.equal(api.readTaskDescription(card.description),'');assert.ok(card.description.endsWith(example));
});
test('Both conflicting saved fields and a conflicting incoming edit stop before any new write',async()=>{
 for(const field of ['title','description'])for(const mode of ['saved','incoming','concealed']){
  reset();await edit({...ids,taskDescription:'Base'},scopes);
  if(field==='title')work().text='Map choice';else work().nfTaskContent.description='Map choice';
  if(mode!=='incoming'){if(field==='title')card.title='◑ Deck choice';else card.description=api.writeTaskDescription(card.description,'Deck choice');}
  const patch=mode==='saved'?{syncTaskContent:true}:field==='title'?{title:mode==='concealed'?'Map choice':'Requested'}:{taskDescription:mode==='concealed'?'Map choice':'Requested'};
  const before=writes().length;await assert.rejects(edit({...ids,...patch},scopes),/unterschiedlich/);assert.equal(writes().length,before);
 }
});
test('Unknown or malformed shared modes, wrong bindings, missing scopes and readonly map cannot write',async()=>{
 for(const kind of ['ordinary','mixed','malformed','reserved','readonly-map','scope','wrong-content-version']){
  reset();let patch={taskDescription:'Shared'};let allowed=scopes;
  if(kind==='ordinary')card.description='Plain card';if(kind==='mixed')patch.description=card.description;
  if(kind==='malformed')card.description+='\n<!-- nf-task-content:start -->\nUnclosed';
  if(kind==='reserved')patch.taskDescription='<!-- nf-mindmap:reserved -->';
  if(kind==='readonly-map')fault=kind;if(kind==='scope')allowed=scopes.filter(x=>x!=='files:write');
  if(kind==='wrong-content-version')work().nfDeckSync.content={version:99,title:'Bad',description:''};
  await assert.rejects(edit({...ids,...patch},allowed));assert.equal(writes().length,0,kind);
 }
});
test('Fresh card guards cover metadata and the native helper re-read; post-save races leave map pending',async()=>{
 for(const mode of ['metadata-race','late-source-race']){reset();fault=mode;await assert.rejects(edit({...ids,taskDescription:'Shared'},scopes),/geändert/);assert.equal(writes().length,0,mode);}
 reset();fault='saved-source-race';const r=await edit({...ids,taskDescription:'Saved'},scopes);assert.equal(r.mindmap.pending,true);assert.equal(writes().filter(x=>x.path.includes('/apps/deck/')).length,1);assert.equal(writes().filter(x=>!x.path.includes('/apps/deck/')).length,0);
});
test('Map CAS conflict can resume with syncTaskContent only, without replaying the saved card edit',async()=>{
 reset();fault='target-race';let r=await edit({...ids,title:'Saved first',taskDescription:'Keep saved content'},scopes);
 assert.equal(r.mindmap.pending,true);assert.equal(api.readTaskDescription(card.description),'Keep saved content');assert.equal(work().nfTaskContent,undefined);
 const deckWrites=writes().filter(x=>x.path.includes('/apps/deck/')).length;fault=null;r=await reconcile();
 assert.equal(r.mindmap.verified,true);assert.equal(writes().filter(x=>x.path.includes('/apps/deck/')).length,deckWrites);assert.equal(work().nfTaskContent.description,'Keep saved content');assert.equal(work().nfDeckSync.content.title,'Saved first');
});
test('Stale caller card/map versions and missing paired guards reject a shared description before writes',async()=>{
 for(const kind of ['card','map','missing']){
  reset();const guard={expectedVersion:await api.planningVersion(card),expectedMapEtag:tag()};
  if(kind==='card')card.description+='\nNew saved history';if(kind==='map'){work().note='New saved planning note';rev++;}
  const args={...ids,taskDescription:'Stale edit',...(kind==='missing'?{}:guard)};
  await assert.rejects(api.updateCardInMindmapWorkflow(args,scopes),/veraltet|benötigt/);assert.equal(writes().length,0,kind);
 }
});
test('The map-only sync can import Deck content but never discard a map edit or acquire Deck write access',async()=>{
 reset();await edit({...ids,taskDescription:'Base'},scopes);
 card.title='◑ Changed in Deck';card.description=api.writeTaskDescription(card.description,'Changed in Deck');
 const sync=()=>api.syncMindmapCard({path:binding.path,fileId:binding.fileId,etag:tag(),nodeId:binding.nodeId,...ids,checklistId:binding.checklistId});
 const before=writes().filter(x=>x.path.includes('/apps/deck/')).length;let r=await sync();assert.equal(r.verified,true);assert.equal(work().nfTaskContent.description,'Changed in Deck');assert.equal(work().nfDeckSync.content.title,'Changed in Deck');assert.equal(writes().filter(x=>x.path.includes('/apps/deck/')).length,before);
 work().text='Pending map name';const count=writes().length;await assert.rejects(sync(),/syncTaskContent/);assert.equal(writes().length,count);assert.equal(work().text,'Pending map name');
});

async function call(args,allowed=scopes){
 if(args.taskDescription!==undefined)args={expectedVersion:await api.planningVersion(card),expectedMapEtag:tag(),...args};
 const response=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'update_card',arguments:{...ids,...args}}})}),{authInfo:{token:'test',clientId:'test',scopes:allowed,resource:new URL('https://connector.example.test/deck-mcp')}});
 const body=await response.text();const value=response.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5))).find(message=>message.id===1):JSON.parse(body);assert.ok(value?.result,body);return value.result;
}
test('Actual MCP schema accepts shared edits and explicit resumption, retaining the established tool and scopes',async()=>{
 reset();let r=await call({title:'MCP name',taskDescription:'MCP text'});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.taskContent.description,'MCP text');
 work().text='Map name';r=await call({syncTaskContent:true});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(card.title,'◑ Map name');
});
test('Actual MCP edits a native empty-goals capsule without a false conflict or duplicate task',async()=>{
 reset();
 card={...card,title:'○ Work',description:marker+'\n<!-- nf-conditions:{"version":1,"lists":[{"id":"pilot","title":"Goals"}]} -->\nOriginal native history\n'+list([])};
 map=api.projectDeckChecklist(baseMap,'block',{boardId:5,cardId:77,checklistId:'pilot'},[],work().hyperlink,false,[{id:'pilot',title:'Goals',items:[]}]).map;
 work().text='Work · noch keine Ziele';work().note='Keep native planning note';
 const other=structuredClone(map.root.children[1]);
 const r=await call({title:'Shared empty task',taskDescription:'Description without invented goals'});
 assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.mindmap.verified,true);
 assert.equal(card.title,'○ Shared empty task');assert.equal(work().nfDeckSync.content.title,'Shared empty task');
 assert.equal(work().nfTaskContent.description,'Description without invented goals');assert.equal(work().note,'Keep native planning note');
 assert.match(card.description,/Original native history/);assert.equal(work().nfDeckSync.total,0);assert.equal(work().nfDeckSync.completed,0);
 assert.equal(work().id,'block');assert.equal(map.root.children[0].children.length,1);assert.equal(map.root.children[0].children[0].children.length,0);
 assert.deepEqual(map.root.children[1],other);
 const count=writes().length;const again=await call({syncTaskContent:true});
 assert.equal(again.isError,undefined,JSON.stringify(again));assert.equal(again.structuredContent.mindmap.unchanged,true);assert.equal(writes().length,count);
});
test('Actual MCP schema rejects ambiguous/invalid modes and every missing write/read scope without writes',async()=>{
 for(const args of [{description:'Body',taskDescription:'Shared'},{taskDescription:'x'.repeat(16001)},{taskDescription:'Missing card guard',expectedVersion:undefined},{taskDescription:'Missing map guard',expectedMapEtag:undefined},{syncTaskContent:false},{}]){reset();const r=await call(args);assert.equal(r.isError,true);assert.equal(requests.length,0);}
 for(const missing of scopes){reset();const r=await call({taskDescription:'No permission'},scopes.filter(s=>s!==missing));assert.equal(r.isError,true,missing);assert.equal(writes().length,0);}
});
