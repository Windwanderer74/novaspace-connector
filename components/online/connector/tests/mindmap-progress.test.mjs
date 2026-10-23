// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
await build({stdin:{contents:`export * from './lib/mindmap-deck-core'; export { changeMindmap } from './lib/mindmap-core';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/test/mindmap-progress.mjs'});
const api=await import('../.sites-runtime/test/mindmap-progress.mjs');
const node=(id,children=[])=>({data:{id,text:id,note:'keep note',custom:{keep:true}},children});
const source={root:node('root',[node('branch',[node('a'),node('b')]),node('empty',[node('idea')]),node('references')]),theme:'fresh-blue',unknown:{keep:true}};
const make=(n,d)=>Array.from({length:n},(_,i)=>({id:'task'+i,text:'Task '+i,done:i<d}));
const binding=(cardId)=>({boardId:5,cardId,checklistId:'pilot'});
const project=(map,id,cardId,items)=>api.projectDeckChecklist(map,id,binding(cardId),items,'https://cloud.example.test/index.php/apps/deck/card/'+cardId,false).map;
const find=(map,id)=>{let found;const walk=n=>{if(n.data.id===id)found=n;(n.children??[]).forEach(walk);};walk(map.root);return found;};
test('Parents count actual tasks with correct weight, not mean percentages or mirrored nodes',()=>{
  let map=api.registerMindmapProgress(source,['root','branch','empty','idea']);
  map=project(map,'a',77,make(1,1));map=project(map,'b',78,make(9,0));
  for(const id of ['root','branch']){const n=find(map,id);assert.equal(n.data.nfDeckAggregate.total,10);assert.equal(n.data.nfDeckAggregate.completed,1);assert.equal(n.data.progress,1);}
  assert.equal(find(map,'empty').data.nfDeckAggregate.percent,null);assert.equal(find(map,'empty').data.nfDeckAggregate.state,'unplanned');assert.equal(find(map,'empty').data.progress,1);
  assert.deepEqual(find(map,'references'),find(source,'references'));assert.deepEqual(map.unknown,source.unknown);assert.equal(map.root.data.text,'root');assert.equal(map.root.data.note,'keep note');
  assert.equal(source.root.data.progress,undefined);
});
test('Duplicate representations count once; contradictory duplicates stop rather than pick a winner',()=>{
  let map=api.registerMindmapProgress(source,['root','branch']);
  map=project(map,'a',77,make(2,1));map=project(map,'b',77,make(2,1));
  assert.equal(map.root.data.nfDeckAggregate.total,2);assert.equal(map.root.data.nfDeckAggregate.completed,1);
  assert.throws(()=>project(map,'b',77,make(2,2)),/widersprüchliche/);
});
test('Reopening, additions, task removal and node moves recount registered ancestors; no-op is identical',()=>{
  let map=api.registerMindmapProgress(source,['root','branch','empty']);map=project(map,'a',77,make(2,2));
  assert.equal(map.root.data.progress,9);map=project(map,'a',77,make(3,1));assert.equal(map.root.data.nfDeckAggregate.completed,1);assert.equal(map.root.data.nfDeckAggregate.total,3);assert.equal(map.root.data.progress,3);
  const before=structuredClone(map);map=project(map,'a',77,make(3,1));assert.deepEqual(map,before);
  map=api.changeMindmap(map,[{action:'move',nodeId:'a',parentId:'empty'}]);api.recountMindmapProgress(map);
  assert.equal(find(map,'branch').data.nfDeckAggregate.total,0);assert.equal(find(map,'empty').data.nfDeckAggregate.total,3);assert.equal(map.root.data.nfDeckAggregate.total,3);
  map=project(map,'a',77,[]);assert.equal(map.root.data.nfDeckAggregate.total,0);assert.equal(map.root.data.nfDeckAggregate.allChecked,false);assert.equal(map.root.data.progress,1);
});
test('A planned empty node can become a linked work block while keeping notes and propagating upwards',()=>{
  let map=api.registerMindmapProgress(source,['root','empty','idea']);map=project(map,'idea',79,make(2,1));
  assert.equal(find(map,'idea').data.nfDeckAggregate,undefined);assert.equal(find(map,'idea').data.nfDeckSync.cardId,79);assert.equal(find(map,'idea').data.note,'keep note');assert.equal(find(map,'empty').data.nfDeckAggregate.total,2);
});
test('Explicit opt-in protects manual progress, task rows and unrelated maps; invalid tracked data fails',()=>{
  assert.deepEqual(project(source,'a',77,make(2,1)).root.data,source.root.data);
  let map=structuredClone(source);find(map,'idea').data.progress=4;assert.throws(()=>api.registerMindmapProgress(map,['idea']),/Vorhandene/);
  map=project(source,'a',77,make(2,1));assert.throws(()=>api.registerMindmapProgress(map,['a']),/eigene Fortschritts/);
  assert.throws(()=>api.registerMindmapProgress(map,['a:deck-checklist:task0']),/eigene Fortschritts/);
  map=api.registerMindmapProgress(map,['root']);find(map,'a').data.nfDeckSync.items[0].done='yes';assert.throws(()=>api.recountMindmapProgress(map),/Ungültige Aufgabe/);
  assert.throws(()=>api.registerMindmapProgress(source,['absent']),/nicht gefunden/);
});
