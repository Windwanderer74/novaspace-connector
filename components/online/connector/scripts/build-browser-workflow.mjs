import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
await (await import('node:fs/promises')).mkdir('.sites-runtime', {recursive:true});
const before=await readFile('snapshots/jsloader-before-mindmap-workflow.js','utf8');
const result=await build({stdin:{contents:`import './browser/mindmap-editor-ui';import './browser/deck-mindmap-ui';import './browser/source-capsule-ui';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'iife',target:['es2022'],minify:true,write:false,metafile:true});
// JSLoader renders its textarea without escaping HTML entities. Preserve literal
// entity strings across a later edit/readback by escaping their ampersand in JS.
const snippet=result.outputFiles[0].text.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, entity=>'\\x26'+entity.slice(1));
await writeFile('browser/jsloader-mindmap-v1.js', '/* SPDX-License-Identifier: AGPL-3.0-or-later; see THIRD_PARTY_NOTICES.md */\n'+before.trimEnd()+'\n\n/* NOVAFORGE Mindmap / Deck browser workflow 1.6.1. Remove this final block to roll back. */\n'+snippet);

await writeFile('.sites-runtime/browser-build-inputs.json', JSON.stringify(result.metafile,null,2)+'\n');
