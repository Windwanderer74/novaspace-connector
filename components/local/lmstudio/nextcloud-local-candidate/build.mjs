// SPDX-License-Identifier: AGPL-3.0-or-later
import {build} from 'esbuild';
await build({entryPoints:['src/stdio.ts'],outfile:'dist/nextcloud-local.cjs',bundle:true,platform:'node',format:'cjs',target:'node22',legalComments:'linked',sourcemap:false});
