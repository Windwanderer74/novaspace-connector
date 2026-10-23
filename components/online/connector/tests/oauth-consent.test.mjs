// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('.sites-runtime/test', { recursive: true });
await build({stdin:{contents:`export { GET as consent, POST as authorize } from './app/oauth/authorize/route'; export { POST as token } from './app/oauth/token/route'; export { createClientId, pkceS256, verifyAccessToken } from './lib/oauth'; export { setDeckRuntimeConfig } from './lib/runtime-config';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/test/consent.mjs'});
const api = await import('../.sites-runtime/test/consent.mjs');
const origin = 'https://connector.example.test';
const email = 'owner@example.test';
const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';
const resource = origin + '/deck-mcp';
api.setDeckRuntimeConfig({NEXTCLOUD_BASE_URL:'https://cloud.example.test',NEXTCLOUD_LOGIN_NAME:'test',NEXTCLOUD_APP_PASSWORD:'test-only',OAUTH_SIGNING_SECRET:'local-test-key-not-a-production-key-123',CONNECTOR_ALLOWED_EMAIL:email,CONNECTOR_PUBLIC_ORIGIN:origin});
const verifier = 'test-verifier-abcdefghijklmnopqrstuvwxyz-0123456789-ABCDE';
const clientId = await api.createClientId([redirectUri]);
const challenge = await api.pkceS256(verifier);

function values(scope = 'deck:read deck:write') {
  return new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,state:'state-test',code_challenge:challenge,code_challenge_method:'S256',resource,scope,decision:'approve'});
}
async function authorize(form, identity = email) {
  return api.authorize(new Request(origin + '/oauth/authorize', {method:'POST',headers:{'oai-authenticated-user-email':identity},body:form}));
}
async function exchange(response, codeVerifier = verifier) {
  assert.equal(response.status,303);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('state'),'state-test');
  return api.token(new Request(origin+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,redirect_uri:redirectUri,resource,code:location.searchParams.get('code'),code_verifier:codeVerifier})}));
}

test('Legacy request offers unchecked additional choices; approving unchanged grants Deck only', async () => {
  const response = await api.consent(new Request(origin+'/oauth/authorize?'+values(),{headers:{'oai-authenticated-user-email':email}}));
  const html = await response.text();
  assert.equal(response.status,200);
  assert.match(html,/name="additional_scope" value="calendar:read"/);
  assert.match(html,/name="additional_scope" value="files:read"/);
  assert.match(html,/name="additional_scope" value="calendar:write"/);
  assert.match(html,/name="additional_scope" value="files:write"/);
  assert.match(html,/name="additional_scope" value="nextcloud:read"/);
  assert.match(html,/name="additional_scope" value="talk:read"/);
  assert.match(html,/name="additional_scope" value="mail:read"/);
  assert.match(html,/name="additional_scope" value="announcements:read"/);
  for (const scope of ['files:trash','files:share','files:organize','files:pdfread','files:download','tables:read','tables:write','inventory:read','inventory:write']) {
    assert.ok(html.includes('name="additional_scope" value="'+scope+'"'));
  }
  assert.doesNotMatch(html,/checked/);
  const issued = await (await exchange(await authorize(values()))).json();
  assert.equal(issued.scope,'deck:read deck:write');
  assert.equal((await api.verifyAccessToken(issued.access_token)).scope,issued.scope);
});

test('Explicit choices survive authorization code and token exchange exactly', async () => {
  for (const selected of [['files:trash'],['files:share'],['inventory:read'],['inventory:write'],['inventory:read','inventory:write'],['tables:write'],['tables:read'],['files:organize'],['files:pdfread'],['files:download'],['files:organize','files:pdfread','files:download'],['announcements:read'],['mail:read'],['nextcloud:read'],['talk:read'],['nextcloud:read','talk:read'],['calendar:read'],['files:read'],['calendar:read','files:read'],['calendar:write'],['files:write'],['calendar:read','files:read','calendar:write','files:write']]) {
    const form = values();
    selected.forEach(scope=>form.append('additional_scope',scope));
    const response = await exchange(await authorize(form));
    assert.equal(response.status,200);
    const issued = await response.json();
    assert.equal(issued.scope,['deck:read','deck:write',...selected].join(' '));
    assert.equal((await api.verifyAccessToken(issued.access_token)).scope,issued.scope);
  }
});

test('Optional choices cannot introduce unadvertised write scopes or unknown scopes', async () => {
  for (const scope of ['deck:write','files:delete','talk:write','mail:write','announcements:write','admin']) {
    const form = values('deck:read');form.append('additional_scope',scope);
    assert.equal((await authorize(form)).status,400);
  }
});

test('Declining or using another identity cannot issue an authorization code', async () => {
  const form = values();form.append('additional_scope','calendar:read');form.set('decision','deny');
  const denied = await authorize(form);
  const location = new URL(denied.headers.get('location'));
  assert.equal(location.searchParams.get('error'),'access_denied');
  assert.equal(location.searchParams.has('code'),false);
  assert.equal((await authorize(values(),'someone@example.test')).status,403);
});

test('Expanded consent still requires the matching PKCE verifier', async () => {
  const form = values();form.append('additional_scope','calendar:read');
  assert.equal((await exchange(await authorize(form),'x'.repeat(50))).status,400);
});
