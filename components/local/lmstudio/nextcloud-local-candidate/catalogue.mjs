// SPDX-License-Identifier: AGPL-3.0-or-later
// Generate protocol metadata in process; do not configure a real account.
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {createMcpHandler} from '@modelcontextprotocol/server';
await mkdir('.sites-runtime',{recursive:true});
await build({entryPoints:['src/local.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.sites-runtime/catalogue.mjs'});
const {localServer,READ_SCOPES}=await import('./.sites-runtime/catalogue.mjs');
const handler=createMcpHandler(()=>localServer(READ_SCOPES),{legacy:'stateless',responseMode:'json'});
const response=await handler.fetch(new Request('https://metadata.example.invalid/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}));
const text=await response.text();
const result=response.headers.get('content-type')?.includes('text/event-stream')?text.split('\n').filter(x=>x.startsWith('data:')).map(x=>JSON.parse(x.slice(5))).find(x=>x.id===1):JSON.parse(text);
if(response.status!==200||result.result?.tools?.length!==172)throw Error('Unexpected local catalogue');
await writeFile('TOOL-MANIFEST.json',JSON.stringify(result.result.tools,null,2)+'\n');
