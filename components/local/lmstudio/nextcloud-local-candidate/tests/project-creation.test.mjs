// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
await build({stdin:{contents:`export * from './lib/project-creation';export {createDeckMcpServer} from './lib/mcp';export {setDeckRuntimeConfig} from './lib/runtime-config';export * from './lib/connection-policy';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/project-creation.mjs'});
const a=await import('../.sites-runtime/test/project-creation.mjs');
const {createMcpHandler}=await import('@modelcontextprotocol/server');
a.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service',NEXTCLOUD_APP_PASSWORD:'fixture-only'});
const handler=createMcpHandler(()=>a.createDeckMcpServer(),{legacy:'stateless',responseMode:'json'});
const scope=['deck:read','deck:write','files:read','files:write'],id='b'.repeat(32),ref={creationId:id,expectedAccount:'ChatGPT'};
const rootId='ns_project_'+id,api='/index.php/apps/novaspace_capsules/api';
const stacks=a.PROJECT_MATRIX.map((title,order)=>({id:10+order,boardId:77,title,order}));
let state,original,map,path,requests,fault,posts,statusReads,infoReads;
function reset(phase='not-found'){
 state=phase;original={title:'Projekt',description:'Original',folder:'/Projekte/Projekt',folderMode:'auto',color:'DDCB55',stackName:'Neu'};
 path='/Projekte/Projekt/Projekt.km';requests=[];fault='';posts=[];statusReads=0;infoReads=0;
 map={root:{data:{id:rootId,text:'Projekt',note:'Planning remains independent',nfProjectCapsule:{version:1,creationId:id,boardId:77,frameworkVersion:1,stacks:stacks.map(({boardId,...s})=>s)},nfDeckTarget:{version:1,boardId:77,stackId:10}},children:[{data:{id:rootId+':board',text:'Deck',hyperlink:'https://cloud.example.test/index.php/apps/deck/#/board/77'},children:[]}]},theme:'classic-compact'};
}
function status(){
 const common={projectCreationApiVersion:1,account:'ChatGPT',creationId:id};
 if(state==='not-found')return {...common,state};
 if(state==='partial')return {...common,state,phase:fault==='bad-phase'?'other':'map-creating',boardId:77,fileId:null,input:original};
 return {...common,state:'complete',verified:true,boardId:77,stackId:10,fileId:fault==='status-race'&&statusReads>1?100:99,mindmapPath:path,rootId,framework:{frameworkVersion:1,stacks:stacks.map(({boardId,...s})=>s)},boardUrl:'https://cloud.example.test/index.php/apps/deck/#/board/77',mindmapUrl:fault==='evil-link'?'https://evil.example/secret':'https://cloud.example.test/index.php/f/99'};
}
const savedFetch=globalThis.fetch;
globalThis.fetch=async(raw,options)=>{
 const url=new URL(raw),method=options.method??'GET';assert.equal(url.origin,'https://cloud.example.test');assert.equal(options.redirect,'manual');requests.push({path:url.pathname+url.search,method});
 assert.match(new Headers(options.headers).get('Authorization'),/^Basic /);
 if(url.pathname===api+'/project-creation'){
  assert.equal(new Headers(options.headers).get('X-NovaSpace-Project-Access'),'files-read-write-v1');infoReads++;
  if(fault==='old-api')return new Response(null,{status:404});
  return Response.json({projectCreationApiVersion:1,account:fault==='wrong-account'?'Soul':'ChatGPT',matrix:a.PROJECT_MATRIX,folderModes:['auto','custom'],readOnly:true});
 }
 if(url.pathname===api+'/project-folders'){
  const folder=url.searchParams.get('path');return Response.json({projectCreationApiVersion:1,account:'ChatGPT',path:folder,parent:folder==='/'?null:folder.slice(0,folder.lastIndexOf('/'))||'/',creatable:true,folders:[{name:'Sub',path:(folder==='/'?'':folder)+'/Sub'}]});
 }
 if(url.pathname.startsWith(api+'/creations/')){assert.equal(method,'GET');assert.ok(url.pathname.endsWith(id));statusReads++;return Response.json(status());}
 if(url.pathname===api+'/projects'){
  assert.equal(method,'POST');const body=JSON.parse(options.body);posts.push(body);assert.equal(body.creationId,id);assert.equal(body.expectedAccount,'ChatGPT');
  for(const key of ['acknowledgeCreate','acknowledgeResume','expectedStatusVersion'])assert.equal(body[key],undefined);
  if(fault==='unrecorded')throw Error('fixture-secret');
  original={title:body.title,description:body.description,folder:body.folderMode==='auto'?'/Projekte/'+body.title:body.folder,folderMode:body.folderMode,color:body.color,stackName:body.stackName};
  path=original.folder+'/'+body.title+'.km';map.root.data.text=body.title;
  state=fault==='partial'?'partial':'complete';
  if(fault==='lost')throw Error('fixture-secret');
  if(fault==='partial')return Response.json({projectCreationApiVersion:1,state:'unconfirmed',code:'PROJECT_MAP_OUTCOME_UNKNOWN'},{status:409});
  return Response.json(status());
 }
 if(url.pathname==='/index.php/apps/deck/api/v1.0/boards/77')return Response.json({id:77,title:'Projekt',color:'DDCB55',archived:false,deletedAt:0,owner:fault==='foreign-owner'?'Soul':'ChatGPT',permissions:{PERMISSION_READ:true,PERMISSION_EDIT:true},labels:[],users:[],acl:[]});
 if(url.pathname==='/index.php/apps/deck/api/v1.0/boards/77/stacks')return Response.json(fault==='wrong-stack'?stacks.map(s=>({...s,title:'Changed'})):stacks);
 if(url.pathname==='/remote.php/dav/')return new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});
 const actual='/remote.php/dav/files/ChatGPT'+path;
 assert.equal(decodeURIComponent(url.pathname),actual);
 if(method==='PROPFIND')return new Response(`<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:href>${url.pathname}</d:href><d:propstat><d:prop><d:resourcetype/><d:getetag>"v1"</d:getetag><oc:fileid>${fault==='wrong-file'?100:99}</oc:fileid><oc:permissions>${fault==='readonly-map'?'G':'GW'}</oc:permissions></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,{status:207});
 assert.equal(method,'GET');return new Response(JSON.stringify(map),{headers:{etag:'"v1"'}});
};
process.on('exit',()=>{globalThis.fetch=savedFetch;});
async function call(name,args,scopes=scope){
 const r=await handler.fetch(new Request('https://connector.example.test/deck-mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{authInfo:{token:'fixture',clientId:'fixture',scopes,resource:new URL('https://connector.example.test/deck-mcp')}});
 const body=await r.text(),value=r.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).find(v=>v.id===1):JSON.parse(body);assert.ok(value?.result,body);return value.result;
}
test('new project uses auto storage, exactly one native POST and independently proves both resource identities',async()=>{
 reset();const r=await call('mindmap_create_project',{...ref,title:'Projekt',description:'Description',acknowledgeCreate:true});
 assert.equal(r.isError,undefined,JSON.stringify(r));const d=r.structuredContent;assert.equal(d.state,'complete');assert.equal(d.verified,true);assert.equal(d.fileId,99);assert.equal(d.mindmapEtag,'"v1"');assert.equal(d.rootId,rootId);assert.equal(d.atomicAcrossResources,false);assert.equal(posts.length,1);assert.equal(posts[0].folderMode,'auto');assert.equal(posts[0].stackName,'Neu');assert.equal(posts[0].description,'Description');assert.equal(map.root.data.note,'Planning remains independent');
});
test('selected existing custom folder is used without creating a second directory or another board',async()=>{
 reset();const d=await a.createProject({...ref,title:'Projekt',folder:'/Existing'});assert.equal(d.verified,true);assert.equal(posts.length,1);assert.equal(posts[0].folderMode,'custom');assert.equal(posts[0].folder,'/Existing');assert.equal(d.mindmapPath,'/Existing/Projekt.km');
});
test('lost successful POST response is recovered only by known status and independent readback',async()=>{
 reset();fault='lost';const d=await a.createProject({...ref,title:'Projekt'});assert.equal(d.verified,true);assert.equal(d.writeAccepted,null);assert.equal(posts.length,1);assert.doesNotMatch(JSON.stringify(d),/fixture-secret/);
});
test('partial and unrecorded write outcomes retain the same attempt and never automatically POST twice',async()=>{
 for(const mode of ['partial','unrecorded']){reset();fault=mode;const d=await a.createProject({...ref,title:'Projekt'});assert.equal(d.creationId,id);assert.equal(d.state,mode==='partial'?'partial':'unknown');assert.equal(d.writeAccepted,null);assert.equal(posts.length,1);assert.doesNotMatch(JSON.stringify(d),/fixture-secret/);}
});
test('existing attempt always rejects new creation, while a versioned explicit resume uses only original inputs',async()=>{
 reset('partial');const d=await a.readProjectStatus(ref);await assert.rejects(a.createProject({...ref,title:'Different'}),/existiert bereits/);assert.equal(posts.length,0);
 const r=await call('mindmap_resume_project',{...ref,expectedStatusVersion:d.statusVersion,acknowledgeResume:true});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.verified,true);assert.equal(posts.length,1);assert.equal(posts[0].title,'Projekt');assert.equal(posts[0].description,'Original');assert.equal(posts[0].folder,'/Projekte/Projekt');
});
test('stale, absent or already complete resume never creates an additional resource',async()=>{
 reset('partial');await assert.rejects(a.resumeProject({...ref,expectedStatusVersion:'0'.repeat(64)}),/veraltet/);assert.equal(posts.length,0);
 reset();let d=await a.readProjectStatus(ref);await assert.rejects(a.resumeProject({...ref,expectedStatusVersion:d.statusVersion}),/Kein gespeicherter/);assert.equal(posts.length,0);
 reset('complete');d=await a.readProjectStatus(ref);const out=await a.resumeProject({...ref,expectedStatusVersion:d.statusVersion});assert.equal(out.verified,true);assert.equal(out.writeAccepted,false);assert.equal(posts.length,0);
});
test('wrong API/account and invalid request fields stop before any POST',async()=>{
 for(const mode of ['old-api','wrong-account']){reset();fault=mode;await assert.rejects(a.createProject({...ref,title:'Projekt'}));assert.equal(posts.length,0);}
 for(const patch of [{creationId:'../bad'},{title:'../bad'},{description:'ä'.repeat(9000)},{folder:'/../bad'},{color:'red'}]){reset();await assert.rejects(a.createProject({...ref,title:'Projekt',...patch}));assert.equal(requests.length,0);}
 reset();await assert.rejects(a.createProject({...ref,expectedAccount:'Soul',title:'Projekt'}),/Konto/);assert.equal(posts.length,0);
});
test('complete state does not pass foreign links, wrong board/stack/file, read-only map or final identity race',async()=>{
 for(const mode of ['evil-link','foreign-owner','wrong-stack','wrong-file','readonly-map','status-race']){reset('complete');fault=mode;await assert.rejects(a.readProjectStatus(ref));assert.equal(posts.length,0,mode);}
 reset('complete');map.root.data.nfProjectCapsule.creationId='c'.repeat(32);await assert.rejects(a.readProjectStatus(ref));assert.equal(posts.length,0);
});
test('folder browsing is bounded, read-only and escapes paths without changing their meaning',async()=>{
 reset();const r=await call('mindmap_project_folders',{expectedAccount:'ChatGPT',path:'/A..B & Ü'});assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.path,'/A..B & Ü');assert.equal(r.structuredContent.folders[0].path,'/A..B & Ü/Sub');assert.equal(posts.length,0);assert.ok(requests.every(r=>['GET','PROPFIND'].includes(r.method)));
});
test('all four real schemas deny each missing scope and disabled/read-only cross-app policy before network',async()=>{
 const cases=[['mindmap_project_folders',{expectedAccount:'ChatGPT'}],['mindmap_project_status',ref],['mindmap_create_project',{...ref,title:'Projekt',acknowledgeCreate:true}],['mindmap_resume_project',{...ref,expectedStatusVersion:'0'.repeat(64),acknowledgeResume:true}]];
 for(const [name,args]of cases)for(const missing of scope){reset();const r=await call(name,args,scope.filter(s=>s!==missing));assert.equal(r.isError,true);assert.equal(requests.length,0,name+missing);}
 for(const [name,args]of cases)for(const [app,mode]of [['files','off'],['files','read'],['deck','read'],['mindmap','off'],['mindmap','read']]){reset();const policy=a.inheritedPolicy();policy.apps[app]=mode;const r=await a.withConnectionPolicy(policy,()=>call(name,args));assert.equal(r.isError,true);assert.equal(requests.length,0,name+app+mode);}
});
test('registered write schemas require explicit create/resume and reject traversal/nonces before data access',async()=>{
 for(const [name,args]of [['mindmap_create_project',{...ref,title:'Projekt'}],['mindmap_resume_project',{...ref,expectedStatusVersion:'0'.repeat(64)}],['mindmap_project_status',{...ref,creationId:'bad'}]]){reset();const r=await call(name,args);assert.equal(r.isError,true);assert.equal(requests.length,0);}
});
