// SPDX-License-Identifier: AGPL-3.0-or-later
import {build} from 'esbuild';
import {copyFile,mkdir,writeFile,readFile} from 'node:fs/promises';
// LM Studio's bootstrap and our schema must use ONE SDK module instance.
// Embedding another SDK copy makes KVConfigSchematics fail instanceof checks.
await build({entryPoints:['source/index.ts'],outfile:'plugin.cjs',bundle:true,external:['@lmstudio/sdk'],platform:'node',format:'cjs',target:'node22',legalComments:'linked'});
await mkdir('src',{recursive:true});
await writeFile('src/index.ts','// LM Studio compiles this entry and the vendored SDK in ONE module graph.\nexport {main} from "../plugin.cjs";\n');
const tools=JSON.parse(await readFile('../nextcloud-local-candidate/TOOL-MANIFEST.json','utf8'));
await writeFile('TOOL-MANIFEST.json',JSON.stringify(tools.filter(t=>t.name!=='inventory_create_item'),null,2));

// Exercise the current core in the real child-process regression.
await mkdir('tests/fixtures',{recursive:true});
await copyFile('../nextcloud-local-candidate/dist/nextcloud-local.cjs','tests/fixtures/nextcloud-local.cjs');
