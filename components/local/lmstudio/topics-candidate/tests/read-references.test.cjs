// SPDX-License-Identifier: AGPL-3.0-or-later
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const api=require('../plugin.cjs');
const root=mkdtempSync(join(tmpdir(),'nf-read-reference-'));
after(()=>rmSync(root,{recursive:true,force:true}));
let number=0;
const expectedMapEtag='"fixture-map-v1"';
const expectedSourceEtag='"fixture-source-v1"';
const mapPath='/Fixture_MixedCase_Tests/FIXTURE_REFERENCE.km';
const sourcePath='/Fixture_MixedCase_Tests/FIXTURE_REFERENCE.txt';
const args={parentId:'fixture_reference_root',capsuleId:'capsule',documentNodeId:'source',title:'Prüfquelle',sourceKind:'file'};
async function connect(fault='',write=true){
 const n=number++,config=join(root,n+'-config.json'),log=join(root,n+'-calls.jsonl');
 writeFileSync(config,JSON.stringify({baseUrl:'https://cloud.example.invalid',expectedUser:'Soul',scopes:['calendar:read','files:read',...(write?['files:write']:[])],groups:['files','mindmap','deck']}));
 const abort=new AbortController();
 const session=await api.connectLocalMcp({expectedUser:'Soul',parameters:{command:process.execPath,args:['--require',join(__dirname,'fixtures/mindmap-reference-fetch.cjs'),join(__dirname,'fixtures/nextcloud-local.cjs'),config],env:{NC_MCP_URL:'https://cloud.example.invalid',NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'fixture',NS_TEST_REFERENCE_LOG:log,NS_TEST_REFERENCE_FAULT:fault},stderr:'ignore'}},{topics:['files','mindmap','deck']},abort.signal);
 const ctx={signal:abort.signal,status(){},warn(){},callId:1};
 const call=async(name,a)=>{const tool=session.tools.find(t=>t.name===name);assert.ok(tool,name);tool.checkParameters(a);return tool.implementation(a,ctx);};
 return {session,call,log};
}
const calls=log=>readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
async function reads(call){
 const map=await call('mindmap_read',{path:mapPath}),source=await call('files_stat',{path:sourcePath});
 assert.equal(map.isError,undefined,JSON.stringify(map));assert.equal(source.isError,undefined,JSON.stringify(source));
 return {map,source,refs:{mindmapRef:map.structuredContent.mindmapRef,sourceRef:source.structuredContent.sourceRef}};
}

test('SDK contract separates two read references and rejects the observed raw ID/ETag payload',async()=>{
 const {session}=await connect();
 try{
  for(const name of ['mindmap_add_source_capsule','mindmap_link_file']){
   const tool=session.tools.find(t=>t.name===name);
   const fields=name==='mindmap_link_file'?{nodeId:args.parentId}:args;
   assert.doesNotThrow(()=>tool.checkParameters({...fields,mindmapRef:'map-reference',sourceRef:'source-reference'}));
   assert.throws(()=>tool.checkParameters({...fields,fileId:'70002',etag:expectedSourceEtag.slice(1,-1),sourceFileId:'70002',sourceEtag:expectedSourceEtag.slice(1,-1)}));
   assert.throws(()=>tool.checkParameters({...fields,mindmapRef:'map-reference',sourceRef:'source-reference',path:mapPath,sourcePath}));
   for(const key of ['mindmapRef','sourceRef']){
    const incomplete={...fields,mindmapRef:'map',sourceRef:'source'};delete incomplete[key];
    assert.throws(()=>tool.checkParameters(incomplete),new RegExp(key));
   }
  }
 }finally{session[Symbol.dispose]();}
});

test('Real SDK and unchanged personal core bind original quoted ETags and distinct IDs, then read back one source capsule',async()=>{
 const {session,call,log}=await connect();
 try{
  const {map,source,refs}=await reads(call);
  assert.equal(map.structuredContent.fileId,'70001');assert.equal(map.structuredContent.etag,expectedMapEtag);
  assert.equal(source.structuredContent.fileId,'70002');assert.equal(source.structuredContent.etag,expectedSourceEtag);
  assert.ok(refs.mindmapRef.startsWith('map-'));assert.ok(refs.sourceRef.startsWith('source-'));
  const result=await call('mindmap_add_source_capsule',{...args,...refs});
  assert.equal(result.isError,undefined,JSON.stringify(result));assert.equal(result.structuredContent.verified,true);
  const after=await call('mindmap_read',{path:mapPath});
  assert.equal(after.structuredContent.fileId,'70001');assert.equal(after.structuredContent.nodeCount,3);
  const ref=after.structuredContent.mindmap.root.children[0].children[0].data.nfSource;
  assert.equal(ref.fileId,'70002');assert.equal(ref.etagAtLink,expectedSourceEtag);
  assert.equal(after.structuredContent.mindmap.root.data.id,args.parentId);
  const original=await call('files_read_text',{path:sourcePath});
  assert.equal(original.structuredContent.text,'Referenzprüfung – ÄÖÜ äöü ß\nZeile 2 bleibt erhalten.\n');
  const puts=calls(log).filter(c=>c.method==='PUT');assert.equal(puts.length,1);assert.equal(puts[0].ifMatch,expectedMapEtag);
  const replay=await call('mindmap_add_source_capsule',{...args,...refs});
  assert.equal(replay.structuredContent.code,'read_reference_required');assert.equal(calls(log).filter(c=>c.method==='PUT').length,1);
 }finally{session[Symbol.dispose]();}
});

test('Direct file link uses the same binding and original metadata',async()=>{
 const {session,call}=await connect();
 try{
  const {refs}=await reads(call);
  const r=await call('mindmap_link_file',{nodeId:args.parentId,...refs});
  assert.equal(r.structuredContent.verified,true,JSON.stringify(r));assert.equal(r.structuredContent.sourceFileId,'70002');
 }finally{session[Symbol.dispose]();}
});

test('Unknown, swapped and cross-session references stop before any native request',async()=>{
 const a=await connect(),b=await connect();
 try{
  const {refs}=await reads(a.call);
  for(const [call,log,payload] of [
   [a.call,a.log,{...args,mindmapRef:'invented',sourceRef:refs.sourceRef}],
   [a.call,a.log,{...args,mindmapRef:refs.sourceRef,sourceRef:refs.mindmapRef}],
   [b.call,b.log,{...args,...refs}],
  ]){
   const before=calls(log).length,r=await call('mindmap_add_source_capsule',payload);
   assert.equal(r.isError,true);assert.equal(r.structuredContent.code,'read_reference_required');assert.equal(calls(log).length,before);
  }
 }finally{a.session[Symbol.dispose]();b.session[Symbol.dispose]();}
});

test('Reported lowercase path still fails; a chosen search result reads, binds and reads back the original mixed-case paths without copying them',async()=>{
 const {session,call,log}=await connect();
 try{
  const wrong=await call('mindmap_read',{path:mapPath.replace('MixedCase_Tests','mixedcase_tests')});
  assert.equal(wrong.isError,true);assert.match(JSON.stringify(wrong),/404/);
  const found=await call('files_search',{folder:'/',query:'FIXTURE_REFERENCE',recursive:true,limit:10});
  assert.equal(found.isError,undefined,JSON.stringify(found));
  const entries=found.structuredContent.entries;
  const selectedMap=entries.find(e=>e.fileId==='70001'),selectedSource=entries.find(e=>e.fileId==='70002');
  assert.equal(selectedMap.path,mapPath);assert.equal(selectedSource.path,sourcePath);
  assert.ok(selectedMap.fileRef.startsWith('file-'));assert.ok(selectedSource.fileRef.startsWith('file-'));
  const map=await call('mindmap_read',{fileRef:selectedMap.fileRef});
  const source=await call('files_stat',{fileRef:selectedSource.fileRef});
  assert.equal(map.structuredContent.path,mapPath);assert.equal(source.structuredContent.path,sourcePath);
  const result=await call('mindmap_add_source_capsule',{...args,mindmapRef:map.structuredContent.mindmapRef,sourceRef:source.structuredContent.sourceRef});
  assert.equal(result.structuredContent.verified,true,JSON.stringify(result));
  const after=await call('mindmap_read',{fileRef:selectedMap.fileRef});
  const original=await call('files_read_text',{fileRef:selectedSource.fileRef});
  assert.equal(after.structuredContent.fileId,'70001');assert.equal(after.structuredContent.nodeCount,3);
  assert.equal(original.structuredContent.fileId,'70002');assert.equal(original.structuredContent.text,'Referenzprüfung – ÄÖÜ äöü ß\nZeile 2 bleibt erhalten.\n');
  assert.deepEqual(calls(log).filter(c=>c.method==='PUT').map(c=>({path:c.path,ifMatch:c.ifMatch})),[{path:'/remote.php/dav/files/Soul'+mapPath,ifMatch:expectedMapEtag}]);
 }finally{session[Symbol.dispose]();}
});

test('Ordner entries also provide explicit file choices; legacy exact-path readers remain available',async()=>{
 const {session,call}=await connect();
 try{
  const listing=await call('files_list',{folder:'/Fixture_MixedCase_Tests'});
  assert.equal(listing.isError,undefined,JSON.stringify(listing));
  const selected=listing.structuredContent.entries.find(e=>e.fileId==='70001');
  assert.ok(selected.fileRef);
  const read=await call('mindmap_read',{fileRef:selected.fileRef});
  assert.equal(read.structuredContent.fileId,'70001');assert.equal(read.structuredContent.path,mapPath);
  const direct=await call('files_read_text',{path:sourcePath});
  assert.equal(direct.structuredContent.fileId,'70002');
 }finally{session[Symbol.dispose]();}
});

test('SDK requires exactly one file selector; invented, wrong-kind and cross-session locators stop before native requests',async()=>{
 const a=await connect(),b=await connect();
 try{
  const found=await a.call('files_search',{query:'FIXTURE_REFERENCE'});
  const chosen=found.structuredContent.entries.find(e=>e.fileId==='70001');
  const text=found.structuredContent.entries.find(e=>e.fileId==='70002');
  for(const name of ['mindmap_read','files_stat','files_read_text']){
   const tool=a.session.tools.find(t=>t.name===name);
   assert.throws(()=>tool.checkParameters({}));
   assert.throws(()=>tool.checkParameters({path:chosen.path,fileRef:chosen.fileRef}));
  }
  for(const [owner,name,ref] of [[a,'mindmap_read','invented'],[b,'mindmap_read',chosen.fileRef],[a,'mindmap_read',text.fileRef]]){
   const before=calls(owner.log).length,r=await owner.call(name,{fileRef:ref});
   assert.equal(r.isError,true);assert.equal(r.structuredContent.code,'read_reference_required');assert.equal(calls(owner.log).length,before);
  }
 }finally{a.session[Symbol.dispose]();b.session[Symbol.dispose]();}
});

test('A replacement at the selected path never becomes the selected file or leaks its contents',async()=>{
 const {session,call,log}=await connect('replacement');
 try{
  const found=await call('files_search',{query:'FIXTURE_REFERENCE'});
  const chosen=found.structuredContent.entries.find(e=>e.fileId==='70001');
  const r=await call('mindmap_read',{fileRef:chosen.fileRef});
  assert.equal(r.isError,true);assert.equal(r.structuredContent.code,'file_selection_changed');
  assert.doesNotMatch(JSON.stringify(r),/replacement-secret-content/);assert.equal(r.structuredContent.mindmapRef,undefined);
  assert.equal(calls(log).filter(c=>c.method==='PUT').length,0);
 }finally{session[Symbol.dispose]();}
});

test('All six guarded Mindmap writers select their map only through mindmapRef',async()=>{
 const {session}=await connect();
 try{
  const fields={
   mindmap_add_source_capsule:{...args,sourceRef:'source-reference'},
   mindmap_link_file:{nodeId:args.parentId,sourceRef:'source-reference'},
   mindmap_update_nodes:{operations:[{action:'set_note',nodeId:args.parentId,note:'probe'}]},
   mindmap_link_card:{nodeId:args.parentId,boardId:70,stackId:71,cardId:72},
   mindmap_sync_card:{nodeId:args.parentId,boardId:70,stackId:71,cardId:72,checklistId:'pilot'},
   mindmap_create_work_step:{parentId:args.parentId,nodeId:'test-work',title:'Prüfung',boardId:70,stackId:71,conditions:['bleibt offen']},
  };
  for(const [name,values] of Object.entries(fields)){
   const tool=session.tools.find(t=>t.name===name);assert.ok(tool,name);
   assert.doesNotThrow(()=>tool.checkParameters({...values,mindmapRef:'map-reference'}));
   assert.throws(()=>tool.checkParameters(values),/mindmapRef/);
   assert.throws(()=>tool.checkParameters({...values,mindmapRef:'map-reference',path:mapPath,fileId:'70001',etag:expectedMapEtag}));
  }
 }finally{session[Symbol.dispose]();}
});

test('Single-map edit preserves the exact selected path and work-step still requires native Deck rights',async()=>{
 const {session,call,log}=await connect();
 try{
  const found=await call('files_search',{query:'FIXTURE_REFERENCE'}),chosen=found.structuredContent.entries.find(e=>e.fileId==='70001');
  const map=await call('mindmap_read',{fileRef:chosen.fileRef});
  const edited=await call('mindmap_update_nodes',{mindmapRef:map.structuredContent.mindmapRef,operations:[{action:'set_note',nodeId:args.parentId,note:'Quelle bleibt getrennt.'}]});
  assert.equal(edited.structuredContent.verified,true,JSON.stringify(edited));
  const fresh=await call('mindmap_read',{fileRef:chosen.fileRef});
  assert.equal(fresh.structuredContent.mindmap.root.data.note,'Quelle bleibt getrennt.');
  const denied=await call('mindmap_create_work_step',{mindmapRef:fresh.structuredContent.mindmapRef,parentId:args.parentId,nodeId:'test-work',title:'Prüfung',boardId:70,stackId:71,conditions:['bleibt offen']});
  assert.equal(denied.isError,true);assert.match(JSON.stringify(denied),/deck:write/);
  assert.deepEqual(calls(log).filter(c=>c.method==='PUT').map(c=>c.path),['/remote.php/dav/files/Soul'+mapPath]);
 }finally{session[Symbol.dispose]();}
});

test('Foreign-account, malformed or unverifiable selections never produce a usable locator',()=>{
 const refs=new api.ReadReferences('Soul');
 const entry={path:mapPath,fileId:'70001',type:'file'};
 for(const data of [{account:'other',entries:[entry]},{account:'Soul',entries:[{...entry,path:'/../escape.km'}]},{account:'Soul',entries:[{...entry,fileId:'bad'}]}]){
  const result=refs.observe('files_search',{}, {structuredContent:data,content:[]});
  assert.equal(result.structuredContent.entries[0].fileRef,undefined);
 }
 const found=refs.observe('files_search',{}, {structuredContent:{account:'Soul',entries:[entry]},content:[]});
 const fileRef=found.structuredContent.entries[0].fileRef;
 const result=refs.observe('mindmap_read',{path:mapPath},{structuredContent:null,content:[]},{fileRef});
 assert.equal(result.isError,true);assert.equal(result.structuredContent.code,'file_selection_changed');
});

test('Native stale map/source, missing write scope and PUT conflict remain enforced without retry',async()=>{
 for(const [fault,write,expectedPuts] of [['stale-map',true,0],['stale-source',true,0],['',false,0],['put-conflict',true,1]]){
  const {session,call,log}=await connect(fault,write);
  try{
   const {refs}=await reads(call),r=await call('mindmap_add_source_capsule',{...args,...refs});
   assert.equal(r.isError,true,JSON.stringify(r));assert.equal(calls(log).filter(c=>c.method==='PUT').length,expectedPuts);
   const again=await call('mindmap_add_source_capsule',{...args,...refs});
   assert.equal(again.structuredContent.code,'read_reference_required');assert.equal(calls(log).filter(c=>c.method==='PUT').length,expectedPuts);
  }finally{session[Symbol.dispose]();}
 }
});

test('Unverified readback consumes references and never repeats an accepted PUT',async()=>{
 const {session,call,log}=await connect('readback');
 try{
  const {refs}=await reads(call),r=await call('mindmap_add_source_capsule',{...args,...refs});
  assert.equal(r.structuredContent.writeAccepted,true);assert.equal(r.structuredContent.verified,false);
  const repeat=await call('mindmap_add_source_capsule',{...args,...refs});
  assert.equal(repeat.structuredContent.code,'read_reference_required');assert.equal(calls(log).filter(c=>c.method==='PUT').length,1);
 }finally{session[Symbol.dispose]();}
});

test('Only verified same-account reads issue refs; failed refresh, eviction and clear invalidate prior references',()=>{
 const r=new api.ReadReferences('Soul');
 const good={account:'Soul',path:mapPath,fileId:'70001',etag:expectedMapEtag,type:'file',versionVerified:true,format:'kityminder-json'};
 const source={account:'Soul',path:sourcePath,fileId:'70002',etag:expectedSourceEtag,type:'file',exists:true};
 const observe=(name,a,data)=>r.observe(name,a,{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data}).structuredContent;
 for(const change of [{account:'other'},{versionVerified:false},{etag:'unquoted'},{path:'/other.km'},{fileId:'bad'},{format:'unknown'}])assert.equal(observe('mindmap_read',{path:mapPath},{...good,...change}).mindmapRef,undefined);
 let map=observe('mindmap_read',{path:mapPath},good),s=observe('files_stat',{path:sourcePath},source);
 const input=()=>({...args,mindmapRef:map.mindmapRef,sourceRef:s.sourceRef});
 r.observe('mindmap_read',{path:mapPath},{isError:true,content:[]});assert.throws(()=>r.nativeArguments('mindmap_add_source_capsule',input()),api.ReadReferenceError);
 map=observe('mindmap_read',{path:mapPath},good);
 for(let i=0;i<513;i++)observe('files_stat',{path:'/source'+i},{...source,path:'/source'+i,fileId:String(i)});
 assert.throws(()=>r.nativeArguments('mindmap_add_source_capsule',input()),api.ReadReferenceError);
 map=observe('mindmap_read',{path:mapPath},good);s=observe('files_stat',{path:sourcePath},source);
 r.clear();assert.throws(()=>r.nativeArguments('mindmap_add_source_capsule',input()),api.ReadReferenceError);
});
