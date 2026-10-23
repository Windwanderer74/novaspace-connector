// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
await build({stdin:{contents:`export * from './lib/deck-mindmap-workflow'; export { addConditionList, replaceConditionList } from './lib/mindmap-workflow-core'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { projectDeckChecklist, registerMindmapProgress } from './lib/mindmap-deck-core';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/deck-workflow.mjs'});
const api=await import('../.sites-runtime/test/deck-workflow.mjs');
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
function reset(){card={id:77,stackId:20,title:'◑ Work',description:marker+'\nKeep this note\n'+list(rows),type:'plain',owner:{uid:'service'},order:7,duedate:'2026-10-12T12:00:00Z',done:null,archived:false};map=structuredClone(baseMap);rev=1;requests=[];fault=null;deckGets=0;}
const tag=()=>`"v${rev}"`;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,o)=>{
  const path=new URL(url).pathname;requests.push({path,method:o.method});
  if(path.includes('/apps/deck/api/')){
    if(o.method==='PUT'){card={...card,...JSON.parse(o.body)};return Response.json(card);}
    deckGets++;if(fault==='source-race'&&deckGets===2)card.description+='\nAnother author';
    return Response.json(card);
  }
  if(o.method==='PROPFIND'){
    const principal=path==='/remote.php/dav/';
    const props=principal?'<d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal>':`<d:resourcetype/><d:getetag>${tag()}</d:getetag><oc:fileid>${fault==='foreign-file'?'999':'6044'}</oc:fileid><oc:permissions>GW</oc:permissions>`;
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
  const r=await api.updateCardInMindmapWorkflow({...ids,description:card.description.replace('[ ] Second','[x] Second')},scopes);
  assert.equal(r.card.title,'● Work');assert.equal(r.mindmap.verified,true);assert.equal(r.mindmap.completed,2);assert.equal(r.mindmap.total,2);
  assert.equal(map.root.children[0].data.progress,9);assert.deepEqual(map.root.children[1],originalOther);
  assert.equal(map.root.data.progress,9);assert.equal(map.root.data.nfDeckAggregate.completed,2);assert.equal(map.root.data.nfDeckAggregate.total,2);
  assert.equal(card.duedate,'2026-10-12T12:00:00Z');assert.equal(card.archived,false);assert.equal(card.done,null);assert.match(card.description,/Keep this note/);
});
test('A new unmarked task gets a stable hidden ID; repeating, reordering and reopening remain consistent',async()=>{
  reset();let r=await api.updateCardInMindmapWorkflow({...ids,description:card.description.replace('<!-- nf-checklist:pilot:end -->','- [ ] New task\n<!-- nf-checklist:pilot:end -->')},scopes);
  assert.equal(r.mindmap.total,3);assert.equal(r.mindmap.completed,1);
  const id=card.description.match(/New task <!-- nf-task:([^ ]+) -->/)[1];assert.match(id,/^task_/);
  const before=writes().length;r=await api.updateCardInMindmapWorkflow({...ids,description:card.description},scopes);
  assert.equal(r.mindmap.unchanged,true);assert.equal(writes().length,before);
  r=await api.updateCardInMindmapWorkflow({...ids,description:marker+'\n'+list([`- [x] New name <!-- nf-task:${id} -->`,rows[1],rows[0].replace('[x]','[ ]')])},scopes);
  assert.equal(r.mindmap.total,3);assert.equal(r.mindmap.completed,1);
  assert.equal(map.root.children[0].children[0].children[0].data.nfDeckTaskId,id);
});
test('Missing file permissions, conflicting bindings and foreign file IDs stop before either write',async()=>{
  for(const kind of ['scope','binding','foreign-file','remove-marker']){
    reset();if(kind==='binding')map.root.children[0].data.nfDeckSync.cardId=99;
    if(kind==='foreign-file')fault=kind;
    const description=kind==='remove-marker'?card.description.replace(marker,''):card.description;
    await assert.rejects(api.updateCardInMindmapWorkflow({...ids,description},kind==='scope'?['deck:write','deck:read']:scopes));assert.equal(writes().length,0,kind);
  }
});
test('Source race prevents writes; target conflict reports saved Deck and pending map without replay',async()=>{
  reset();fault='source-race';await assert.rejects(api.updateCardInMindmapWorkflow({...ids,description:card.description.replace('[ ] Second','[x] Second')},scopes));assert.equal(writes().length,0);
  reset();fault='target-race';const r=await api.updateCardInMindmapWorkflow({...ids,description:card.description.replace('[ ] Second','[x] Second')},scopes);
  assert.equal(r.card.title,'● Work');assert.equal(r.mindmap.verified,false);assert.equal(r.mindmap.pending,true);
  assert.equal(writes().filter(x=>x.path.includes('/apps/deck/')).length,1);assert.equal(map.root.children[0].data.progress,5);
});
test('Ordinary cards need no file scopes and trigger no map requests',async()=>{
  reset();card.description='Ordinary work';card.title='Original';const r=await api.updateCardInMindmapWorkflow({...ids,title:'Renamed'},['deck:write']);
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
 let result=await api.updateCardInMindmapWorkflow({...ids,description},scopes);assert.equal(result.mindmap.verified,true);assert.equal(result.mindmap.total,3);assert.equal(map.root.children[0].children.length,2);assert.equal(map.root.data.nfDeckAggregate.total,3);
 description=card.description.replace('[ ] Review condition','[x] Review condition');result=await api.updateCardInMindmapWorkflow({...ids,description},scopes);assert.equal(result.mindmap.completed,2);assert.equal(map.root.children[0].children[1].children[0].data.nfDeckTaskId,'third');
});
