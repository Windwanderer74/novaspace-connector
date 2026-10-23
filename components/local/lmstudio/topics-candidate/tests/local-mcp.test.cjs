// SPDX-License-Identifier: AGPL-3.0-or-later
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {tmpdir}=require('node:os');
const {createHash}=require('node:crypto');
const api=require('../plugin.cjs');
const root=mkdtempSync(join(tmpdir(),'nf-local-mcp-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');

test('Local source loader binds receipt/account/code and excludes tokens and plugin credentials',()=>{
 const home=join(root,'home'),installed=join(root,'installed');mkdirSync(join(home,'.lmstudio'),{recursive:true});mkdirSync(join(installed,'dist'),{recursive:true});
 const script=join(installed,'start_local.py');writeFileSync(script,'fixture');writeFileSync(join(installed,'dist/nextcloud-local.cjs'),'fixture');
 const entry={command:'python.exe',args:['-u',script],env:{NC_MCP_APP_PASSWORD:'secret',LMSTUDIO_CLIENT_PASSKEY:'secret'}};
 writeFileSync(join(home,'.lmstudio/mcp.json'),JSON.stringify({mcpServers:{'nextcloud-pilot-next2':entry}}));
 const local={baseUrl:'https://cloud.example.invalid',expectedUser:'Soul'};
 writeFileSync(join(installed,'local.json'),JSON.stringify(local));
 writeFileSync(join(installed,'installation.json'),JSON.stringify({version:'1.31.0-local.1',expectedUser:'Soul',installedEntry:entry}));
 writeFileSync(join(installed,'SHA256SUMS.json'),JSON.stringify({'start_local.py':hash(script),'dist/nextcloud-local.cjs':hash(join(installed,'dist/nextcloud-local.cjs'))}));
 const source=api.loadSourceSettings(home,'win32');assert.equal(source.expectedUser,'Soul');assert.equal(source.parameters.command,'python.exe');
 assert.deepEqual(source.parameters.env,{PYTHONUTF8:'1',NC_MCP_TALK_SEND:'false'});
 writeFileSync(script,'changed');assert.throws(()=>api.loadSourceSettings(home,'win32'));
 assert.throws(()=>api.loadSourceSettings(home,'linux'));
});

function source(expectedUser='Soul',inventory=false){
 const config=join(root,'config.json'),mock=join(root,'mock.cjs');
 writeFileSync(config,JSON.stringify({baseUrl:'https://cloud.example.invalid',expectedUser:'Soul',scopes:['calendar:read','deck:read','files:read','nextcloud:read',...(inventory?['inventory:read']:[])],groups:['deck','files','calendar','mindmap',...(inventory?['inventory']:[])]}));
 writeFileSync(mock,`globalThis.fetch=async()=>new Response('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/Soul/</d:href></d:current-user-principal><c:calendar-home-set><d:href>/remote.php/dav/calendars/Soul/</d:href></c:calendar-home-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});`);
 if(inventory){const oldMock=readFileSync(mock,'utf8');writeFileSync(mock,oldMock+'\nconst oldFetch=globalThis.fetch;globalThis.fetch=async(url,...rest)=>String(url).endsWith("/api/v1/items")?Response.json([]):oldFetch(url,...rest);');}
 return {expectedUser,parameters:{command:process.execPath,args:['--require',mock,join(__dirname,'fixtures/nextcloud-local.cjs'),config],env:{NC_MCP_URL:'https://cloud.example.invalid',NC_MCP_USER:'Soul',NC_MCP_APP_PASSWORD:'fixture'},stderr:'ignore'}};
}
test('Real child process serves combined tools and account; MCP scope guard still rejects writes',async()=>{
 const abort=new AbortController();const session=await api.connectLocalMcp(source(),{topics:['files','deck','mindmap']},abort.signal);
 try{
  assert.equal(session.tools.length,56);assert.equal(new Set(session.tools.map(t=>t.name)).size,56);
  const ctx={signal:abort.signal,status(){},warn(){},callId:1};
  const account=await session.tools.find(t=>t.name==='nextcloud_account').implementation({},ctx);
  assert.equal(account.structuredContent.uid,'Soul');
  const write=session.tools.find(t=>t.name==='create_card');const args={boardId:5,stackId:20,title:'test'};write.checkParameters(args);
  const denied=await write.implementation(args,ctx);assert.equal(denied.isError,true);assert.match(JSON.stringify(denied),/deck:write/);
  session[Symbol.dispose]();await assert.rejects(write.implementation(args,ctx));
 }finally{session[Symbol.dispose]();}
});
test('Live stdio account mismatch closes the source and rejects loading',async()=>{
 const abort=new AbortController();await assert.rejects(api.connectLocalMcp(source('OtherUser'),{topics:['deck']},abort.signal));
});
test('Already aborted local session never starts',async()=>{
 const a=new AbortController();a.abort();await assert.rejects(api.connectLocalMcp(source(),{topics:['deck']},a.signal));
});

test('Inventory selection calls the real updated child bundle with own-account read-only tools',async()=>{
 const abort=new AbortController();const session=await api.connectLocalMcp(source('Soul',true),{topics:['inventory']},abort.signal);
 try{
  assert.equal(session.tools.length,6);assert.ok(!session.tools.some(t=>t.name==='inventory_create_item'));
  const ctx={signal:abort.signal,status(){},warn(){},callId:1};
  const result=await session.tools.find(t=>t.name==='inventory_status').implementation({},ctx);
  assert.equal(result.isError,undefined,JSON.stringify(result));assert.equal(result.structuredContent.account,'Soul');assert.equal(result.structuredContent.itemCount,0);
 }finally{session[Symbol.dispose]();}
});
