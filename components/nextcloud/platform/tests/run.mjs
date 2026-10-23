// SPDX-License-Identifier: AGPL-3.0-or-later
import {mkdtempSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const php=process.env.NF_PHP_BINARY || 'php';
const temporary=mkdtempSync(join(tmpdir(),'novaspace-platform-test-'));
const tests=['platform-native-controller.php','platform-access-native.php','platform-inventory-native.php','github-bridge-core.php','github-bridge-signature.php','publication-boundaries.php'];
function run(args,env={}) {
  const result=spawnSync(php,args,{cwd:root,env:{...process.env,...env},encoding:'utf8'});
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.error)throw new Error('PHP could not be started: '+result.error.message);
  if(result.status!==0)throw new Error('PHP check failed: '+args.join(' '));
}
function lint(directory){for(const entry of readdirSync(join(root,directory),{withFileTypes:true})){const relative=join(directory,entry.name);if(entry.isDirectory())lint(relative);else if(entry.isFile()&&entry.name.endsWith('.php'))run(['-l',relative]);}}
try {
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const keyPath=join(temporary,'ephemeral-test-key.pem');
  writeFileSync(keyPath,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  lint('app');lint('tests');
  for(const name of tests)run(['tests/'+name,...(name==='github-bridge-signature.php'?[keyPath]:[])],{NF_REGISTRY_TEST_KEY:keyPath});
} finally {rmSync(temporary,{recursive:true,force:true});}
