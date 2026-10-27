// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createMcpHandler} from '@modelcontextprotocol/server';
await mkdir('.sites-runtime/test',{recursive:true});
await build({stdin:{contents:`export * from './src/local'; export { ALL_SCOPES } from './src/local'; export { createDeckMcpServer } from './lib/mcp'; export {setDeckRuntimeConfig} from './lib/runtime-config';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/local.mjs'});
const api=await import('../.sites-runtime/test/local.mjs');
const nativeFetch=globalThis.fetch;
after(()=>{globalThis.fetch=nativeFetch});
const config=()=>api.validateConfig({baseUrl:'https://cloud.example.invalid',expectedUser:'Soul',scopes:[...api.ALL_SCOPES]});
async function rpc(factory,method,params){
 const h=createMcpHandler(factory,{legacy:'stateless',responseMode:'json'});
 const r=await h.fetch(new Request('https://test.invalid/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json,text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
 const body=await r.text();const envelope=r.headers.get('content-type')?.includes('text/event-stream')?body.split('\n').filter(s=>s.startsWith('data:')).map(s=>JSON.parse(s.slice(5))).find(s=>s.id===1):JSON.parse(body);return envelope.result;
}
test('Shared 1.35.0 tools retain exact schemas; hosted transfer routes excluded',async()=>{
 const ref=await rpc(()=>api.createDeckMcpServer(),'tools/list',{});
 const local=await rpc(()=>api.localServer([...api.ALL_SCOPES]),'tools/list',{});
 assert.equal(local.tools.length,ref.tools.length-api.HOSTED_ONLY.size-api.ACCOUNT_BOUND.size+1);
 const core=t=>({name:t.name,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations});
 assert.deepEqual(local.tools.filter(t=>t.name!=='novaspace_connector_help').map(core),ref.tools.filter(t=>!api.HOSTED_ONLY.has(t.name)&&!api.ACCOUNT_BOUND.has(t.name)).map(core));
 for(const t of local.tools){assert.equal(t._meta?.securitySchemes,undefined);assert.ok(t._meta['novaforge/localScopes'].length);}
 await writeFile('TOOL-MANIFEST.json',JSON.stringify(local.tools,null,2));
});
test('Local configuration rejects foreign hosts, missing identities and unknown scopes',()=>{
 for(const patch of [{baseUrl:'https://evil.test'},{expectedUser:''},{scopes:['*']},{scopes:[]}]) assert.throws(()=>api.validateConfig({...config(),...patch}));
 assert.throws(()=>api.configureCredentials(config(),{NC_MCP_URL:'https://cloud.example.invalid',NC_MCP_USER:'ExampleUser',NC_MCP_APP_PASSWORD:'test'}));
});
test('Read-only local grants reject all write families before network access',async()=>{
 let count=0;globalThis.fetch=async()=>{count++;throw Error('Unexpected network')};
 for(const [name,args] of [['create_card',{boardId:5,stackId:19,title:'test'}],['update_card',{boardId:5,stackId:19,cardId:1,archived:true}],['move_card',{boardId:5,sourceStackId:19,targetStackId:20,cardId:1}],['files_copy',{path:'/test.md',destination:'/copy.md',fileId:'1',etag:'"v1"'}],['files_create_text',{path:'/test.md',text:'test'}],['files_create_folder',{path:'/test'}],['files_update_text',{path:'/test.md',etag:'"v1"',text:'test'}],['calendar_delete_event',{calendarPath:'/remote.php/dav/calendars/Soul/personal/',eventPath:'/remote.php/dav/calendars/Soul/personal/test.ics',etag:'"v1"'}]]) {
 const r=await rpc(()=>api.localServer(api.READ_SCOPES),'tools/call',{name,arguments:args});assert.equal(r.isError,true,name);
 }
 assert.equal(count,0);
});
test('Explicit local Deck grant reaches update and verified readback without HTTP OAuth',async()=>{
 api.configureCredentials(config(),{NC_MCP_URL:config().baseUrl,NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'test'});
 let count=0;let card={id:1,stackId:19,title:'Keep',description:'History',owner:'Soul',type:'plain',order:7,done:null,archived:false,duedate:null};
 globalThis.fetch=async(url,init)=>{count++;if(init.method==='PUT')card={...card,...JSON.parse(init.body)};return Response.json(card)};
 const r=await rpc(()=>api.localServer([...api.ALL_SCOPES]),'tools/call',{name:'update_card',arguments:{boardId:5,stackId:19,cardId:1,archived:true}});
 assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.card.archived,true);assert.equal(r.structuredContent.card.description,'History');assert.equal(count,4);
});
test('Returned DAV identity must match selected user; Soul cannot be silently replaced by Basti or ChatGPT',async()=>{
 for(const uid of ['Soul','ExampleUser','ChatGPT']){
 globalThis.fetch=async()=>new Response(`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/${uid}/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,{status:207});
 if(uid==='Soul')assert.equal((await api.verifyIdentity('Soul')).uid,'Soul');else await assert.rejects(api.verifyIdentity('Soul'));
 }
});
test('Network guard blocks cross-origin destinations and redirects, with explicit timeout',async()=>{
 let count=0;const f=api.guardedFetch(async(url,init)=>{count++;assert.equal(init.redirect,'manual');assert.ok(init.signal);return new Response('',{status:302,headers:{location:'https://evil.test'}})},config().baseUrl);
 await assert.rejects(f('https://evil.test'));assert.equal(count,0);
 await assert.rejects(f(config().baseUrl+'/index.php/apps/deck/api/v1.0/boards'));assert.equal(count,1);
});
test('Bundled artifact starts over real stdio and serves initialize, tools/list and denied writes',async()=>{
 // Mock only fetch in this subprocess; use the actual release bundle and protocol transport.
 await writeFile('.sites-runtime/test/config.json',JSON.stringify({...config(),scopes:api.READ_SCOPES}));
 await writeFile('.sites-runtime/test/mock.cjs',`globalThis.fetch=async()=>new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/Soul/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});`);
 const child=spawn(process.execPath,['--require','./.sites-runtime/test/mock.cjs','dist/nextcloud-local.cjs','.sites-runtime/test/config.json'],{env:{...process.env,NC_MCP_URL:config().baseUrl,NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'test-only'}});
 let buf='',err='';const pending=new Map();let timer;
 const done=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('stdio timeout: '+err)),10000);child.on('error',reject);child.on('exit',code=>{if(code!==0)reject(Error('stdio exited '+code+': '+err))});child.stderr.on('data',d=>err+=d);child.stdout.on('data',d=>{buf+=d;for(let end;(end=buf.indexOf('\n'))>=0;){let line=buf.slice(0,end);buf=buf.slice(end+1);try{const message=JSON.parse(line);pending.get(message.id)?.(message);}catch(e){reject(e)}}});resolve();});
 const call=(id,method,params)=>new Promise(resolve=>{pending.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});
 try{
 await done;
 const init=await call(1,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(init.result.serverInfo.version,api.VERSION);
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const list=await call(2,'tools/list',{});assert.equal(list.result.tools.length,172);
 const denied=await call(3,'tools/call',{name:'create_card',arguments:{boardId:5,stackId:19,title:'x'}});assert.equal(denied.result.isError,true);
 }finally{clearTimeout(timer);child.kill();}
});


test('Selectable groups retain identity but exclude unrelated tools',async()=>{
 const r=await rpc(()=>api.localServer([...api.ALL_SCOPES],['tables']),'tools/list',{});
 assert.ok(r.tools.some(t=>t.name==='tables_read'));
 assert.ok(r.tools.some(t=>t.name==='nextcloud_account'));
 assert.ok(r.tools.every(t=>/^(tables_|documents_|nextcloud_|novaspace_connector_help$)/.test(t.name)));
});
test('All scopes in compound permissions are enforced before network access',async()=>{
 let count=0;globalThis.fetch=async()=>{count++;throw Error('Unexpected network')};
 const link=await rpc(()=>api.localServer(['calendar:read','deck:write','files:write']),'tools/call',{name:'mindmap_link_card',arguments:{path:'/map.km',fileId:'1',etag:'"v1"',nodeId:'node',boardId:5,stackId:19,cardId:1}});
 assert.equal(link.isError,true);assert.match(JSON.stringify(link),/files:read|deck:read/);assert.equal(count,0);
});

test('Personal Inventory reads bind both Soul and Basti to their own native identity', async()=>{
 for(const uid of ['Soul','ExampleUser']){
  const selected=api.validateConfig({...config(),expectedUser:uid,groups:['inventory'],scopes:['calendar:read','inventory:read']});
  api.configureCredentials(selected,{NC_MCP_URL:selected.baseUrl,NC_MCP_USER:uid,NC_MCP_APP_PASSWORD:'fixture'});
  const seen=[];
  globalThis.fetch=async(url,init)=>{
   seen.push({url,init});
   if(String(url).endsWith('/api/v1/items'))return Response.json([]);
   return new Response(`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/${uid}/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,{status:207});
  };
  const r=await rpc(()=>api.localServer(selected.scopes,selected.groups),'tools/call',{name:'inventory_status',arguments:{}});
  assert.equal(r.isError,undefined,JSON.stringify(r));assert.equal(r.structuredContent.account,uid);assert.equal(r.structuredContent.itemCount,0);
  assert.deepEqual(seen.map(x=>x.init.method),['PROPFIND','GET']);
  assert.equal(new Headers(seen[1].init.headers).get('authorization'),'Basic '+Buffer.from(uid+':fixture').toString('base64'));
 }
});

test('Inventory read-only selection rejects creation before accessing Nextcloud',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected network')};
 const r=await rpc(()=>api.localServer(['calendar:read','inventory:read'],['inventory']),'tools/call',{name:'inventory_create_item',arguments:{expectedAccount:'Soul',reference:'SN-G001',name:'Knusperkiste'}});
 assert.equal(r.isError,true);assert.match(JSON.stringify(r),/inventory:write/);assert.equal(calls,0);
 const list=await rpc(()=>api.localServer(['calendar:read','inventory:read'],['inventory']),'tools/list',{});
 assert.ok(list.tools.every(t=>t.name.startsWith('inventory_')||t.name.startsWith('nextcloud_')||t.name==='novaspace_connector_help'));
});


test('Local guide is always available and capabilities do not claim cloud delegation',async()=>{
 const help=await rpc(()=>api.localServer(['calendar:read'],[]),'tools/call',{name:'novaspace_connector_help',arguments:{}});
 assert.equal(help.structuredContent.version,'1.35.0-local.1');
 assert.ok(help.structuredContent.limits.some(v=>v.includes('Inventory')));
 api.configureCredentials(config(),{NC_MCP_URL:config().baseUrl,NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'fixture'});
 globalThis.fetch=async(url)=>String(url).includes('/cloud/capabilities')?Response.json({ocs:{meta:{status:'ok',statuscode:100},data:{version:{string:'test'},capabilities:{}}}}):String(url).includes('/novaspace_platform/')?new Response('',{status:404}):new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/Soul/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});
 const r=await rpc(()=>api.localServer([...api.ALL_SCOPES]),'tools/call',{name:'nextcloud_capabilities',arguments:{}});
 assert.equal(r.isError,undefined,JSON.stringify(r));
 assert.equal(r.structuredContent.local.centralAppSwitchesEnforced,false);
 assert.equal(r.structuredContent.inventory.personalDelegationImplemented,false);
 assert.equal(r.structuredContent.inventory.updateImplemented,false);
 assert.equal(r.structuredContent.inventory.journalReadImplemented,false);
});
