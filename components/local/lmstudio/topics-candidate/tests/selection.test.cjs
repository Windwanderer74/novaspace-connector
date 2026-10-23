// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../plugin.cjs');
const catalogue=require('../TOOL-MANIFEST.json');
const fakeTool=t=>({...t,type:'remoteTool',pluginIdentifier:api.SOURCE_PLUGIN,parametersJsonSchema:t.inputSchema,checkParameters(){},implementation:async()=>({content:[{type:'text',text:'unchanged'}]})});
const remote=catalogue.map(fakeTool);
const names=selection=>api.selectTools(remote,selection).map(t=>t.name);
const run=ctl=>api.provideSelectedTools(ctl,async selection=>{
 const source=await ctl.client.plugins.pluginTools(api.SOURCE_PLUGIN);
 return {tools:api.selectTools(source.tools,selection),[Symbol.dispose]:()=>source[Symbol.dispose]()};
}); // Mock session factory only; production no longer calls plugins.pluginTools.
function controller(selection,open){
 const abort=new AbortController();
 return {abort,ctl:{abortSignal:abort.signal,getPluginConfig:()=>({get:key=>key==='extraTools'?selection.extraTools??[]:key==='excludedTools'?selection.excludedTools??[]:selection.topics.includes(key)}),client:{plugins:{pluginTools:open}}}};
}

test('Catalogue has exactly 129 known tools; every tool is selectable',()=>{
 assert.equal(catalogue.length,129);assert.deepEqual(new Set(catalogue.map(t=>t.name)),api.KNOWN_TOOLS);
 assert.deepEqual(new Set(names({topics:[...api.MAIN_TOPICS,...api.EXTENSIONS]})),api.KNOWN_TOOLS);
});
test('Real SDK configuration reads per-chat switches and defaults; main registers both hooks',async()=>{
 let closed=0;const abort=new AbortController();
 const client={plugins:{pluginTools:async()=>({tools:remote,[Symbol.dispose](){closed++}})}};
 // The controller constructor is not a runtime export in SDK 1.5. Use its real
 // configuration parser, exactly as BaseController.getPluginConfig does.
 const ctl={client,abortSignal:abort.signal,getPluginConfig:s=>s.parse({fields:[{key:'mail',value:true}]})};
 assert.equal((await run(ctl)).length,7);abort.abort();assert.equal(closed,1);
 const hooks=[];await api.main({withConfigSchematics(c){hooks.push(c)},withToolsProvider(p){hooks.push(p)}});
 assert.deepEqual(hooks,[api.configSchematics,api.toolsProvider]);
});
test('LM Studio SDK host accepts configuration from the shipped module; no second SDK class instance',async()=>{
 const {LMStudioClient}=require('@lmstudio/sdk');
 const host=new LMStudioClient({baseUrl:'ws://127.0.0.1:1'}).plugins.getSelfRegistrationHost();
 const sent=[];
 // Replace only the network RPC; keep the real host validator, SDK classes and
 // serialization. The original fully bundled 0.1.0 fails before this RPC.
 host.port.callRpc=async(name,payload)=>{sent.push({name,payload})};
 await host.setConfigSchematics(api.configSchematics);
 assert.equal(sent.length,1);assert.equal(sent[0].name,'setConfigSchematics');
 assert.equal(sent[0].payload.schematics.fields.length,16);
 assert.equal(sent[0].payload.schematics.fields[0].typeParams.displayName,'Datei');
});
test('All 16384 topic combinations have a deduplicated union; source objects survive unchanged',()=>{
 const topics=[...api.MAIN_TOPICS,...api.EXTENSIONS];
 for(let mask=0;mask<16384;mask++){
  const selected=topics.filter((_,i)=>mask&(1<<i));
  const expected=new Set(api.BASE_TOOLS);
  for(const t of selected)for(const n of api.TOPIC_TOOLS[t])expected.add(n);
  if(selected.includes('mindmap'))for(const n of api.MINDMAP_FILES)expected.add(n);
  if(selected.includes('mindmap')&&selected.includes('deck'))for(const n of api.MINDMAP_DECK)expected.add(n);
  if(selected.includes('notes')&&selected.includes('trash'))for(const n of api.NOTES_TRASH)expected.add(n);
  const got=api.selectTools([...remote,...remote],{topics:selected});
  assert.deepEqual(new Set(got.map(t=>t.name)),expected);assert.equal(got.length,expected.size);
  assert.ok(got.every(t=>remote.includes(t)));
 }
});
test('Calendar and mail do not pull in files, unrelated communications or Deck',()=>{
 assert.equal(names({topics:['calendar']}).length,21);
 assert.equal(names({topics:['mail']}).length,7);
 for(const topic of ['calendar','mail'])assert.ok(names({topics:[topic]}).every(n=>n.startsWith(topic+'_')||api.BASE_TOOLS.includes(n)));
});
test('Mindmap supports files, and adds card operations only with Deck',()=>{
 const plain=names({topics:['mindmap']});assert.ok(plain.includes('files_stat'));
 assert.ok(api.MINDMAP_DECK.every(n=>!plain.includes(n)));
 const combined=names({topics:['mindmap','deck']});assert.ok(api.MINDMAP_DECK.every(n=>combined.includes(n)));
});
test('Fine selection, exclusions and future tools fail closed',()=>{
 const got=names({topics:['calendar'],extraTools:['files_read_pdf'],excludedTools:['calendar_delete_event']});
 assert.ok(got.includes('files_read_pdf'));assert.ok(!got.includes('calendar_delete_event'));
 assert.throws(()=>api.selectedNames({topics:['future']}));
 assert.throws(()=>api.selectedNames({topics:[],extraTools:['mail_send']}));
 const future={name:'files_delete'};assert.ok(!api.selectTools([...remote,future],{topics:['files']}).includes(future));
});
test('SDK schemas, callbacks and provider identity retain their original reference',async()=>{
 const selected=api.selectTools(remote,{topics:['files']});
 for(const t of selected){assert.equal(t,remote.find(r=>r.name===t.name));assert.equal(t.pluginIdentifier,api.SOURCE_PLUGIN);}
 const t=selected.find(t=>t.name==='files_read_image');
 const image={content:[{type:'image',data:'mock',mimeType:'image/png'}]};t.implementation=async()=>image;
 assert.equal(await t.implementation(),image);
});
test('API profile carries an explicit allowed_tools list; empty selection has no integration',()=>{
 const request=api.chatRequest({topics:['deck']},'test','local-model',catalogue.map(t=>t.name));
 assert.equal(request.integrations[0].id,api.SOURCE_PLUGIN);assert.equal(request.integrations[0].allowed_tools.length,30);
 assert.deepEqual(api.chatRequest({topics:[],excludedTools:api.BASE_TOOLS},'test','local-model',[]).integrations,[]);
});
test('Two chats use different selections; source session lives until normal disposal',async()=>{
 const sessions=[];const open=async id=>{assert.equal(id,api.SOURCE_PLUGIN);const s={tools:remote,closed:0,[Symbol.dispose](){this.closed++}};sessions.push(s);return s};
 const a=controller({topics:['mail']},open),b=controller({topics:['calendar']},open);
 const [at,bt]=await Promise.all([run(a.ctl),run(b.ctl)]);
 assert.equal(at.length,7);assert.equal(bt.length,21);assert.equal(sessions[0].closed,0);
 a.abort.abort();assert.equal(sessions[0].closed,1);assert.equal(sessions[1].closed,0);
 b.abort.abort();assert.equal(sessions[1].closed,1);
});
test('Abort during loading disposes a late session exactly once',async()=>{
 let resolve;const wait=new Promise(r=>resolve=r);const s={tools:remote,closed:0,[Symbol.dispose](){this.closed++}};
 const {ctl,abort}=controller({topics:['deck']},()=>wait);const loading=run(ctl);
 abort.abort();resolve(s);await assert.rejects(loading);assert.equal(s.closed,1);
});
test('Source errors do not expose credentials',async()=>{
 const b=controller({topics:['deck']},async()=>{throw Error('secret-password')});
 await assert.rejects(run(b.ctl),e=>!e.message.includes('secret-password'));
});
test('Invalid settings and empty selection do not open a source connection',async()=>{
 let count=0;const open=async()=>{count++;throw Error('must not connect')};
 const a=controller({topics:[],extraTools:['files_delete']},open);await assert.rejects(run(a.ctl));
 const b=controller({topics:[],excludedTools:api.BASE_TOOLS},open);assert.deepEqual(await run(b.ctl),[]);
 assert.equal(count,0);
});

test('Inventory theme has only three read tools and is disabled by default',()=>{
 const selected=names({topics:['inventory']});
 assert.deepEqual(new Set(selected),new Set([...api.BASE_TOOLS,'inventory_status','inventory_list_items','inventory_get_item']));
 assert.equal(api.configSchematics.parse({fields:[]}).get('inventory'),false);
 assert.throws(()=>api.selectedNames({topics:[],extraTools:['inventory_create_item']}));
});

test('Notes deletion needs Notes and Trash selection or an explicit fine-tool choice',()=>{assert.ok(!names({topics:['notes']}).includes('notes_delete'));assert.ok(!names({topics:['trash']}).includes('notes_delete'));assert.ok(names({topics:['notes','trash']}).includes('notes_delete'));assert.ok(names({topics:['notes'],extraTools:['notes_delete']}).includes('notes_delete'));});
