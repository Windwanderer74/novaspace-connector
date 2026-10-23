// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';import {test} from 'node:test';import {readFile} from 'node:fs/promises';
const {default:worker}=await import('../dist/server/index.js');const env={ASSETS:{fetch:async()=>new Response(null,{status:404})}};const ctx={waitUntil(){},passThroughOnException(){}};
test('published installer and renderer downloads are exact reviewed sources and GET-only',async()=>{
 for(const [path,file] of [['/ops/general-tables-install-test-0.3.0.php','ops/general-tables-install-test-0.3.0.php'],['/ops/intake-install-test-0.2.1.php','ops/intake-install-test-0.2.1.php'],['/ops/register-share-soul-0.1.0.php','ops/register-share-soul-0.1.0.php'],['/ops/pdf-workbench-1.0.2.py','scripts/pdf-workbench.py'],['/ops/pdf-assemble-1.0.0.py','scripts/assemble-pdf-chunk.py']]){
  const r=await worker.fetch(new Request('https://connector.test'+path),env,ctx);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^text\/plain/);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(await r.text(),await readFile(file,'utf8'));assert.equal((await worker.fetch(new Request('https://connector.test'+path,{method:'POST'}),env,ctx)).status,405);
 }
 assert.equal((await worker.fetch(new Request('https://connector.test/ops/intake-install-test-0.2.0.php'),env,ctx)).status,410);
});
