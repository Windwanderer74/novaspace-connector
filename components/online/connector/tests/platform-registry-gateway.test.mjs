// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { verify } from 'node:crypto';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { registryConfig, registryResponse, testPrincipal, hash, publicKey } from './platform-registry-fixture.mjs';
await mkdir('.sites-runtime/test', {recursive:true});
await build({stdin:{contents:`export * from './lib/platform-registry'; export { setDeckRuntimeConfig } from './lib/runtime-config'; export { createClientId, createAccessToken, signPayload } from './lib/oauth'; export { serveFileDownload } from './lib/files-download'; export { serveFileUpload } from './lib/files-upload'; export { POST, GET, DELETE } from './app/deck-mcp/route';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/platform-registry-gateway.mjs'});
const api = await import('../.sites-runtime/test/platform-registry-gateway.mjs');
const origin='https://connector.example.test', base='https://cloud.example.test';
const config={...registryConfig,NEXTCLOUD_BASE_URL:base,NEXTCLOUD_LOGIN_NAME:'service',NEXTCLOUD_APP_PASSWORD:'test-only',OAUTH_SIGNING_SECRET:'local-test-only-signing-key-1234567890',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:origin};
api.setDeckRuntimeConfig(config);
const clientId=await api.createClientId(['https://chatgpt.com/connector_platform_oauth_redirect']);
const access=()=>api.createAccessToken({sub:'owner@example.test',aud:origin+'/deck-mcp',scope:'nextcloud:read files:read files:write files:download',clientId});
const token=await access(), principal=await api.principalFromAccessToken(token);
const savedFetch=globalThis.fetch; let calls=[], reason='active', override;
function reset(state='active') { calls=[];reason=state;override=undefined;api.setDeckRuntimeConfig(config); }
globalThis.fetch=async(url, options)=>{
  calls.push({url,options});
  assert.equal(options.redirect,'manual');
  if(override) return override(url,options);
  if(url.includes('/registry/status')) return registryResponse(reason);
  throw new Error('Unexpected data access: '+url);
};
after(()=>{globalThis.fetch=savedFetch;});
const rpc=(name,args={})=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
function request(body,method='POST',t=token){return new Request(origin+'/deck-mcp',{method,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json',Accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});}
test('OAuth source is verified and independently registered clients have distinct stable identities',async()=>{
  reset(); const a=await api.createClientId(['https://chatgpt.com/connector_platform_oauth_redirect']);
  const b=await api.createClientId(['https://chatgpt.com/connector_platform_oauth_redirect']);assert.notEqual(a,b);
  assert.equal(principal.clientHash,hash(clientId)); assert.equal(principal.subjectHash,hash('owner@example.test'));
  assert.deepEqual(await api.principalFromAccessToken(await access()),principal);
  await assert.rejects(()=>api.principalFromAccessToken(token+'x'));
  await assert.rejects(async()=>api.principalFromAccessToken(await api.createAccessToken({sub:'other@example.test',aud:origin+'/deck-mcp',scope:'nextcloud:read',clientId})));
  await assert.rejects(async()=>api.principalFromAccessToken(await api.createAccessToken({sub:'owner@example.test',aud:origin+'/deck-mcp',scope:'nextcloud:read',clientId:'unsigned'})));
});
test('Real RS256 assertion binds key, purpose, audience, subject and client without raw identity/token',async()=>{
  reset();for(const purpose of ['status','setup']){
    const t=await api.createGatewayAssertion(principal,purpose),[h,c,s]=t.split('.');
    const header=JSON.parse(Buffer.from(h,'base64url')),claims=JSON.parse(Buffer.from(c,'base64url'));
    assert.equal(verify('RSA-SHA256',Buffer.from(h+'.'+c),publicKey,Buffer.from(s,'base64url')),true);
    assert.equal(header.alg,'RS256');assert.equal(claims.aud,base+'/ocs/v2.php/apps/novaspace_platform/api/v1/registry/'+purpose);
    assert.equal(claims.purpose,purpose);assert.equal(claims.exp-claims.iat,30);assert.equal(claims.client,principal.clientHash);
    assert.equal(claims.sub,principal.subjectHash);assert.doesNotMatch(JSON.stringify(claims),/owner@example|test-only|service/);
  }
});
test('Request contexts remain isolated during interleaved asynchronous work and disappear outside request',async()=>{
  reset(); const other={...testPrincipal,clientHash:'c'.repeat(64)};let release;
  const barrier=new Promise(r=>release=r);
  const a=api.withGatewayPrincipal(principal,async()=>{await barrier;assert.deepEqual(api.currentGatewayPrincipal(),principal);});
  await api.withGatewayPrincipal(other,async()=>{release();await a;assert.deepEqual(api.currentGatewayPrincipal(),other);});
  assert.throws(()=>api.currentGatewayPrincipal());
});
test('Registry is read fresh; revoked/changed credentials reject while explicit unregistered legacy remains bounded',async()=>{
  for(const state of ['active','not_registered','revoked','credential_changed']){
    reset(state);if(['active','not_registered'].includes(state))assert.equal((await api.requireConnection(principal)).reason,state);
    else await assert.rejects(()=>api.requireConnection(principal));
    assert.equal(calls.length,1);assert.match(calls[0].options.headers['X-NovaSpace-Client'],/^[^.]+\.[^.]+\.[^.]+$/);
  }
});
test('Native outages, redirects, old versions and malformed/unsafe replies never open the gate',async()=>{
  for(const response of [()=>new Response('{}',{status:404}),()=>new Response(null,{status:302}),()=>Response.json({ocs:{meta:{status:'ok',statuscode:200},data:{registryVersion:'0.1.0'}}}),()=>Response.json({large:'x'.repeat(33000)}),()=>{throw new Error('SECRET');}]){
    reset();override=response;await assert.rejects(()=>api.requireConnection(principal));
    const r=await api.POST(request(rpc('files_list')));assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/SECRET/);
    assert.equal(calls.every(c=>c.url.includes('/registry/status')),true);
  }
});
test('Revocation gates actual MCP route before data tools, GET, DELETE, batch and oversized requests',async()=>{
  for(const body of [rpc('files_list'),rpc('update_card'),[rpc('nextcloud_capabilities'),rpc('files_list')],{method:'resources/read',params:{uri:'secret'}},'x'.repeat(16385)]){
    reset('revoked');const r=await api.POST(request(body));assert.ok([400,403].includes(r.status));assert.equal(calls.length,1);assert.equal(r.headers.has('www-authenticate'),false);
  }
  for(const method of ['GET','DELETE']){reset('revoked');assert.equal((await api[method](request(undefined,method))).status,403);assert.equal(calls.length,1);}
});
test('Only harmless static handshake/listing reaches MCP after revoke; active tool handling stays available',async()=>{
  for(const method of ['initialize','ping','tools/list','resources/list','resources/templates/list','prompts/list']){
    reset('revoked');const body={jsonrpc:'2.0',id:1,method,...(method==='initialize'?{params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}}:{})};
    const r=await api.POST(request(body));assert.notEqual(r.status,403);assert.equal(calls.length,1);
    if(method==='tools/list')assert.match(await r.text(),/nextcloud_capabilities/);else await r.body?.cancel();
  }
  reset();const r=await api.POST(request(rpc('unknown_tool')));assert.notEqual(r.status,403);assert.equal(calls.length,1);await r.body?.cancel();
});
test('Setup link must point to the expected native approval page and does not itself register',async()=>{
  for(const u of [base+'/index.php/apps/novaspace_platform/connections/new?ticket=sealed','https://foreign.test/?ticket=sealed',base+'/index.php/apps/novaspace_platform/connections/new?ticket=sealed&owner=Soul']){
    reset();override=()=>Response.json({ocs:{meta:{status:'ok',statuscode:200},data:{registryVersion:'0.2.0',requiresWebApproval:true,registeredByThisCall:false,expiresIn:600,clientDisplay:principal.clientHash.slice(0,12),setupUrl:u}}});
    if(u===base+'/index.php/apps/novaspace_platform/connections/new?ticket=sealed')assert.equal((await api.readSetupLink(principal)).registeredByThisCall,false);else await assert.rejects(()=>api.readSetupLink(principal));
  }
  reset();override=()=>Response.json({ocs:{meta:{status:'ok',statuscode:200},data:{registryVersion:'0.2.0',requiresWebApproval:true,registeredByThisCall:false,expiresIn:600,clientDisplay:principal.clientHash.slice(0,12),setupUrl:base+'/apps/novaspace_platform/connections/new?ticket=sealed'}}});
  assert.equal((await api.readSetupLink(principal)).registeredByThisCall,false);
});
test('Revoked client can obtain only the bounded setup metadata through its actual capability tool',async()=>{
  reset('revoked');override=(url)=>{
    if(url.includes('/registry/status'))return registryResponse('revoked');
    if(url.includes('/registry/setup'))return Response.json({ocs:{meta:{status:'ok',statuscode:200},data:{registryVersion:'0.2.0',requiresWebApproval:true,registeredByThisCall:false,expiresIn:600,clientDisplay:principal.clientHash.slice(0,12),setupUrl:base+'/index.php/apps/novaspace_platform/connections/new?ticket=sealed'}}});
    if(url.endsWith('/remote.php/dav/'))return new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/ChatGPT/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',{status:207});
    if(url.endsWith('/cloud/capabilities?format=json'))return Response.json({ocs:{meta:{status:'ok',statuscode:200},data:{version:{string:'34.0.4'},capabilities:{}}}});
    if(url.endsWith('/api/v1/context?format=json'))return Response.json({ocs:{meta:{status:'ok',statuscode:200},data:{appVersion:'0.2.0',nativeUid:'ChatGPT',authentication:'app_password',nativeTokenVerified:true,connectionRegistered:false,connectionId:null,actingForUser:null,writesEnabled:false,journalActive:false}}});
    throw new Error('Unexpected access');
  };
  const NativeRequest=globalThis.Request;
  globalThis.Request=class extends NativeRequest { constructor(input,init) { if(input instanceof NativeRequest&&input.bodyUsed)throw new TypeError('Consumed incoming request');super(input,init); } };
  let r;
  try { r=await api.POST(request(rpc('nextcloud_capabilities'))); }
  finally { globalThis.Request=NativeRequest; }
  assert.equal(r.status,200);const body=await r.text();
  assert.match(body,/ticket=sealed/);assert.match(body,/revoked/);assert.match(body,/ownerDelegationEnabled/);
  assert.equal(calls.every(c=>['GET','PROPFIND'].includes(c.options.method)),true);
});
test('Malformed RPC and processing failures do not trigger new OAuth authentication',async()=>{
  reset('revoked');const bad=await api.POST(request('{broken'));assert.equal(bad.status,400);assert.equal(bad.headers.has('www-authenticate'),false);
  const NativeRequest=globalThis.Request;const incoming=request({jsonrpc:'2.0',id:1,method:'ping'});
  globalThis.Request=class extends NativeRequest { constructor(){throw new Error('SECRET_PROCESSING_ERROR');} };
  let failed;try{failed=await api.POST(incoming);}finally{globalThis.Request=NativeRequest;}
  assert.equal(failed.status,503);assert.equal(failed.headers.has('www-authenticate'),false);assert.doesNotMatch(await failed.text(),/SECRET/);
  reset();const invalid=await api.POST(request(rpc('nextcloud_capabilities'),'POST','invalid-token'));assert.equal(invalid.status,401);assert.equal(invalid.headers.has('www-authenticate'),true);assert.equal(calls.length,0);
});
test('Issued upload/download tickets are denied after revoke before native file operations',async()=>{
  reset('revoked');const exp=Math.floor(Date.now()/1000)+300;
  const download=await api.signPayload({type:'download',exp,uid:'ChatGPT',path:'/file.pdf',fileId:'1',etag:'"v1"',principal});
  assert.equal((await api.serveFileDownload(new Request(origin+'/files-download?token='+download))).status,403);
  const bytes=new TextEncoder().encode('%PDF-test');const upload=await api.signPayload({type:'upload',exp,uid:'ChatGPT',path:'/new.pdf',parentId:'1',size:bytes.length,sha256:hash(bytes),mimeType:'application/pdf',principal});
  assert.equal((await api.serveFileUpload(new Request(origin+'/files-upload',{method:'PUT',headers:{Authorization:'Bearer '+upload,'Content-Type':'application/pdf'},body:bytes}))).status,403);
  assert.equal(calls.length,2);assert.equal(calls.every(c=>c.url.includes('/registry/status')),true);
});
test('Transfer claims without a client or with a foreign owner cannot reach registry or files',async()=>{
  for(const p of [undefined,{...principal,subjectHash:'d'.repeat(64)},{...principal,scopes:['admin']},{...principal,owner:'Soul'}]){
    reset();const t=await api.signPayload({type:'download',exp:Math.floor(Date.now()/1000)+300,uid:'ChatGPT',path:'/file.pdf',fileId:'1',etag:'"v1"',...(p?{principal:p}:{})});
    assert.equal((await api.serveFileDownload(new Request(origin+'/files-download?token='+t))).status,403);assert.equal(calls.length,0);
  }
});
