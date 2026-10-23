// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { registryConfig, registryResponse, testPrincipal } from './platform-registry-fixture.mjs';
await mkdir('.sites-runtime/test', {recursive:true});
await build({stdin:{contents:`export * from './lib/github-bridge';export * from './lib/mcp-github';export * from './lib/platform-registry';export * from './lib/runtime-config';export * from './lib/connection-policy';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/github-bridge.mjs'});
const api = await import('../.sites-runtime/test/github-bridge.mjs');
api.setDeckRuntimeConfig({...registryConfig,NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'service',NEXTCLOUD_APP_PASSWORD:'test-only',OAUTH_SIGNING_SECRET:'test-only-signing-secret-1234567890',CONNECTOR_ALLOWED_EMAIL:'owner@example.test',CONNECTOR_PUBLIC_ORIGIN:'https://connector.example.test'});
const saved = globalThis.fetch;
after(()=>{globalThis.fetch=saved;});
const principal={...testPrincipal,scopes:['github:read','github:write','deck:read','deck:write']};
let calls, reply, registry;
function reset(){calls=[];registry='active';reply={account:'Soul',actorUid:'ChatGPT',connectionId:'11111111-1111-4111-8111-111111111111',outcome:'connected'};
 globalThis.fetch=async(url,options)=>{calls.push({url,options}); if(url.includes('/registry/status'))return registryResponse(registry);const r=await registryResponse('active').json();reply.connectionId=r.ocs.data.connection.connection.connectionId;return Response.json({ocs:{meta:{status:'ok',statuscode:200},data:reply}});};}
const run=(command,p=principal)=>api.withGatewayPrincipal(p,()=>api.githubBridge(command));
test('canonical command signing is deterministic and Unicode preserving',()=>{assert.equal(JSON.stringify(api.canonicalGithubCommand({z:'ä/x',a:{b:true}})),'{"a":{"b":true},"z":"ä/x"}');});
test('missing GitHub scope makes no native request',async()=>{reset();await assert.rejects(()=>run({operation:'status'},{...principal,scopes:['deck:read']}));assert.equal(calls.length,0);});
test('revoked connection prevents bridge access',async()=>{reset();registry='revoked';await assert.rejects(()=>run({operation:'status'}));assert.equal(calls.length,1);});
test('wrong logical owner prevents writes before native command endpoint',async()=>{reset();await assert.rejects(()=>run({operation:'presentation_write',expectedAccount:'Other'}));assert.equal(calls.length,1);});
test('valid read binds to the registered owner and uses fixed native URL',async()=>{reset();const r=await run({operation:'status'});assert.equal(r.account,'Soul');assert.equal(calls.length,2);assert.match(calls[1].url,/\/registry\/github\?format=json$/);const claims=JSON.parse(Buffer.from(calls[1].options.headers['X-NovaSpace-Client'].split('.')[1],'base64url'));assert.equal(claims.purpose,'github');assert.match(claims.bodyHash,/^[0-9a-f]{64}$/);assert.doesNotMatch(JSON.stringify(claims),/test-only/);});
test('foreign account in the native result is never accepted',async()=>{reset();reply.account='Other';const r=await run({operation:'status'});assert.equal(r.outcome,'unknown');assert.equal(r.mayHaveCommitted,false);assert.equal(r.account,'Soul');});
test('transport failure is not retried and marks uncertain write outcome',async()=>{reset();const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(url.includes('/registry/status'))return original(url,options);calls.push({url,options});throw new Error('PRIVATE_TOKEN');};const r=await run({operation:'presentation_write',expectedAccount:'Soul'});assert.equal(r.outcome,'unknown');assert.equal(r.mayHaveCommitted,true);assert.equal(calls.length,2);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_TOKEN/);});
test('six tools expose explicit scope requirements; publication acknowledgement is mandatory',()=>{const tools=new Map();api.registerGithubTools({registerTool(n,c,cb){tools.set(n,{...c,callback:cb});}});assert.equal(tools.size,6);const schema=tools.get('github_write_presentation').inputSchema;assert.equal(schema.safeParse({repository:'x'}).success,false);assert.equal(api.appForTool('github_deck_sync_run'),'deck');assert.equal(api.appForScope('github:write'),'deck');});
