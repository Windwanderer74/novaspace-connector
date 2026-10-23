// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
await build({stdin:{contents:`export * from './lib/mindmap-workflow-core';export * from './lib/mindmap-deck-core';export * from './browser/deck-mindmap-client';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/test/conditions.mjs'});
const api=await import('../.sites-runtime/test/conditions.mjs');
const binding={version:1,path:'/plan.km',fileId:'32',nodeId:'work',checklistId:'work'};
const source={root:{data:{id:'root',text:'Project'},children:[{data:{id:'work',text:'Work'},children:[]},{data:{id:'other',text:'Other',custom:'keep'},children:[]}]}};
const one={id:'one',text:'First condition',done:false},two={id:'two',text:'Second condition',done:true};
const project=(map,d)=>api.projectDeckChecklist(map,'work',{boardId:5,cardId:88,checklistId:'work'},api.workflowItems(d,binding),'https://cloud.example/index.php/apps/deck/card/88',false,api.workflowLists(d,binding));
test('All named lists project to one capsule/card; ancestors count actual conditions once',()=>{
 let d=api.newConditionDescription(binding,[one]);d=api.addConditionList(d,binding,{id:'review',title:'Review'});d=api.replaceConditionList(d,binding,{id:'review',title:'Review',items:[]},[two]);
 const result=project(api.registerMindmapProgress(source,['root']),d),node=result.map.root.children[0];
 assert.equal(result.progress.total,2);assert.equal(result.progress.completed,1);assert.equal(result.map.root.data.nfDeckAggregate.total,2);assert.equal(node.children.length,2);assert.equal(node.data.nfDeckSync.cardId,88);assert.equal(node.children[1].data.text,'Review · 1/1');assert.deepEqual(result.map.root.children[1],source.root.children[1]);assert.equal(project(result.map,d).changed,false);
});
test('Rename/reorder/reopen preserve IDs, notes and prose; empty additional lists do not count as fulfilled',()=>{
 let d=api.newConditionDescription(binding,[one,two]);d+='\n\nUnrelated prose';let map=project(source,d).map;map.root.children[0].children[0].children[0].data.note='Keep';
 d=api.replaceConditionList(d,binding,{id:'work',title:'Updated'},[{...two,done:false},{...one,text:'Renamed'}]);d=api.addConditionList(d,binding,{id:'later',title:'Later'});
 const next=project(map,d);assert.equal(next.progress.total,2);assert.equal(next.progress.completed,0);assert.equal(next.map.root.children[0].children[0].children[1].data.note,'Keep');assert.equal(next.map.root.children[0].children[1].data.progress,1);assert.match(d,/Unrelated prose/);assert.deepEqual(api.workflowItems(d,binding).map(i=>i.id),['two','one']);
});
test('Code examples and noncanonical JSON stay untouched; only live manifest and section change',()=>{
 const live=api.newConditionDescription(binding,[one]);const example='````md\n'+live+'\n```\nstill example\n````\n';
 let d=example+live.replace('"version":1','"version": 1');d=api.replaceConditionList(d,binding,{id:'work',title:'Renamed'},[two]);d=api.addConditionList(d,binding,{id:'new',title:'New'});
 assert.equal(d.slice(0,example.length),example);assert.equal(api.workflowLists(d,binding).length,2);assert.equal(api.workflowItems(d,binding)[0].id,'two');
});
test('Duplicates, removed manifests/lists and foreign reserved nodes fail before writes',()=>{
 const first=api.newConditionDescription(binding,[one]);let d=api.addConditionList(first,binding,{id:'review',title:'Review'});
 assert.throws(()=>api.replaceConditionList(d,binding,{id:'review',title:'Review'},[one]),/mehrere/);
 assert.throws(()=>api.normalizeCardWorkflow(first,binding,d),/entfernen/);
 assert.throws(()=>api.normalizeCardWorkflow(first.replace(/^.*nf-conditions:.*\n/m,''),binding,first),/entfernt/);
 const map=structuredClone(source);map.root.children[1].children=[{data:{id:'work:deck-checklist:review',text:'Private'},children:[]}];assert.throws(()=>project(map,d));
});
test('Explicit browser condition edits preserve card state; stale input and target conflict never replay',async()=>{
 let card={id:88,stackId:20,title:'○ Work',description:api.newConditionDescription(binding,[one]),done:null,duedate:'keep'},map=project(source,card.description).map,writes=[],conflict=false;
 const client={card:async()=>structuredClone(card),map:async()=>({text:JSON.stringify(map),etag:'"v1"',fileId:'32'}),saveCard:async(_r,_c,title,description)=>{writes.push('card');card={...card,title,description};return structuredClone(card);},saveMap:async(_p,_e,_i,text)=>{writes.push('map');if(conflict)throw Error('412');map=JSON.parse(text);}};
 const ref={boardId:5,stackId:20,cardId:88};await assert.rejects(api.editDeckConditions(client,ref,'stale',d=>d));assert.deepEqual(writes,[]);
 await api.editDeckConditions(client,ref,card.description,d=>api.replaceConditionList(d,binding,{id:'work',title:'Bedingungen'},[{...one,done:true}]));assert.equal(map.root.children[0].data.nfDeckSync.completed,1);assert.equal(card.duedate,'keep');
 writes=[];conflict=true;await assert.rejects(api.editDeckConditions(client,ref,card.description,d=>api.replaceConditionList(d,binding,{id:'work',title:'Bedingungen'},[one])),/Karte gespeichert/);assert.deepEqual(writes,['card','map']);assert.equal(api.workflowItems(card.description,binding)[0].done,false);
});

test('Native rich-editor adjacent metadata stays parseable and normalizes without losing rows',()=>{
 const original=api.newConditionDescription(binding,[one]);const joined=original.replace(' -->\n\n<!-- nf-conditions:',' --> <!-- nf-conditions:');assert.deepEqual(api.cardMindmapBinding(joined),binding);assert.equal(api.workflowItems(joined,binding)[0].id,'one');const normalized=api.normalizeCardWorkflow(joined,binding,original);assert.match(normalized,/ -->\n\n<!-- nf-conditions:/);
});
