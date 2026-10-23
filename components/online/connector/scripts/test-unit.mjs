// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('.sites-runtime/test', {recursive:true});
const files=readdirSync('tests').filter(x=>x.endsWith('.test.mjs') && !['rendered-html.test.mjs','intake-downloads.test.mjs'].includes(x)).sort().map(x=>'tests/'+x);
const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
process.exit(r.status??1);
