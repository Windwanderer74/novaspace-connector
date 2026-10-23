// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
await build({stdin:{contents:`export * from './browser/deck-mindmap-client'; export { projectDeckChecklist, registerMindmapProgress } from './lib/mindmap-deck-core';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/deck-browser.mjs'});
const api=await import('../.sites-runtime/test/deck-browser.mjs');
const ref={boardId:5,stackId:20,cardId:77};
const marker='<!-- nf-mindmap:'+JSON.stringify({version:1,path:'/actual.km',fileId:'6044',nodeId:'block',checklistId:'pilot'})+' -->';
const rows=['- [x] First task <!-- nf-task:first -->','- [ ] Second task <!-- nf-task:second -->'];
const list=r=>`<!-- nf-checklist:pilot:start -->\n${r.join('\n')}\n<!-- nf-checklist:pilot:end -->`;
const source={root:{data:{id:'root',text:'Project'},children:[{data:{id:'block',text:'Work'},children:[]},{data:{id:'other',text:'Other',custom:'keep'},children:[]}]}};
const initial=api.projectDeckChecklist(api.registerMindmapProgress(source,['root']),'block',{boardId:5,cardId:77,checklistId:'pilot'},[{id:'first',text:'First task',done:true},{id:'second',text:'Second task',done:false}],'https://cloud.example.test/index.php/apps/deck/card/77',false).map;
let card,map,writes,reads,fault;
const client={
 card:async()=>{reads++;if(fault==='card-race'&&reads===2)card.description+='\nChanged elsewhere';return structuredClone(card);},
 saveCard:async(_ref,_current,title,description)=>{writes.push('card');card={...card,title,description};return structuredClone(card);},
 map:async()=>{if(fault==='denied')throw Error('HTTP 403');return {text:JSON.stringify(map),etag:'"v1"',fileId:fault==='foreign'?'999':'6044'};},
 saveMap:async(_path,etag,id,text)=>{writes.push('map');assert.equal(etag,'"v1"');assert.equal(id,'6044');if(fault==='target-race')throw Error('HTTP 412');map=JSON.parse(text);},
};
function reset(){card={id:77,stackId:20,title:'◑ Work',description:marker+'\n'+list(rows),done:null,duedate:'keep-date'};map=structuredClone(initial);writes=[];reads=0;fault=null;}
test('Only successful native mutation routes can select a same-origin numeric Deck card',()=>{
 const origin='https://cloud.example.test',path='/index.php/apps/deck/api/v1.0/boards/5/stacks/20/cards/77';
 assert.deepEqual(api.savedCardRef(path,'PUT',origin),ref);assert.deepEqual(api.savedCardRef(origin+path,'PATCH',origin),ref);
 for(const [url,method] of [[path,'GET'],['https://foreign.test'+path,'PUT'],[path+'/attachments','PUT'],['/remote.php/dav/files/test/a.km','PUT'],[path.replace('/77','/0'),'PUT']])assert.equal(api.savedCardRef(url,method,origin),null);
});
test('Native OCS saves select only a same-origin card ID for lookup against known linked cards',()=>{
 const origin='https://cloud.example.test',path='/ocs/v2.php/apps/deck/api/v1.0/cards/77';
 assert.equal(api.savedLinkedCardId(path,'PUT',origin),77);
 for(const [url,method] of [[path,'GET'],['https://foreign.test'+path,'PUT'],[path+'/attachments','PUT'],[path.replace('/77','/0'),'PUT']])assert.equal(api.savedLinkedCardId(url,method,origin),null);
});
test('Native rich editor inline closing boundary retains all tasks and writes a canonical checklist',async()=>{
 reset();card.description=card.description.replace('\n<!-- nf-checklist:pilot:end -->',' <!-- nf-checklist:pilot:end -->').replace('[x] First','[ ] First');
 const r=await api.syncSavedDeckCard(client,ref);assert.equal(r.progress.total,2);assert.equal(r.progress.completed,0);assert.match(card.description,/\n<!-- nf-checklist:pilot:end -->/);assert.equal(map.root.data.progress,1);
});
test('An already saved native checkbox edit updates both pies and ancestors without altering check states',async()=>{
 reset();card.description=card.description.replace('[ ] Second','[x] Second');
 const r=await api.syncSavedDeckCard(client,ref);assert.equal(r.linked,true);assert.equal(r.card.title,'● Work');assert.equal(r.progress.completed,2);
 assert.equal(map.root.data.progress,9);assert.equal(map.root.data.nfDeckAggregate.total,2);assert.deepEqual(map.root.children[1],initial.root.children[1]);assert.equal(card.duedate,'keep-date');assert.match(card.description,/\[x\] Second/);
});
test('New native checkbox rows get stable IDs; repeat is no-op and reopening changes progress',async()=>{
 reset();card.description=card.description.replace('<!-- nf-checklist:pilot:end -->','- [ ] New task\n<!-- nf-checklist:pilot:end -->');
 let r=await api.syncSavedDeckCard(client,ref);assert.equal(r.progress.total,3);const id=card.description.match(/New task <!-- nf-task:([^ ]+) -->/)[1];assert.match(id,/^task_/);
 writes=[];reads=0;r=await api.syncSavedDeckCard(client,ref);assert.equal(r.unchanged,true);assert.deepEqual(writes,[]);
 card.description=card.description.replace('[x] First','[ ] First');reads=0;r=await api.syncSavedDeckCard(client,ref);assert.equal(r.progress.completed,0);assert.equal(map.root.data.progress,1);
});
test('Missing IDs on existing native rows retain stable identity via the previous map snapshot',async()=>{
 reset();card.description=card.description.replace(' <!-- nf-task:second -->','');const r=await api.syncSavedDeckCard(client,ref);assert.equal(r.progress.total,2);assert.match(card.description,/Second task <!-- nf-task:second -->/);
});
test('Ordinary cards do not access files or write anything',async()=>{
 reset();card.description='Ordinary';fault='denied';assert.deepEqual(await api.syncSavedDeckCard(client,ref),{linked:false});assert.deepEqual(writes,[]);
});
test('Wrong identity, binding, moved card or source race stop without changing saved native work',async()=>{
 for(const kind of ['foreign','binding','moved','card-race','denied']){reset();fault=kind;if(kind==='binding')map.root.children[0].data.nfDeckSync.cardId=99;if(kind==='moved')card.stackId=21;await assert.rejects(api.syncSavedDeckCard(client,ref));assert.deepEqual(writes,[],kind);}
});
test('Target conflict leaves the already saved Deck state intact and does not replay the edit',async()=>{
 reset();card.description=card.description.replace('[ ] Second','[x] Second');fault='target-race';await assert.rejects(api.syncSavedDeckCard(client,ref),/412/);assert.deepEqual(writes,['card','map']);assert.equal(card.title,'● Work');assert.equal(map.root.data.progress,5);
});
