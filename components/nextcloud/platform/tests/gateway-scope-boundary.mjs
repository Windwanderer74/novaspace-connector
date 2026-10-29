// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {generateKeyPairSync, sign} from 'node:crypto';
const runtime=process.env.NF_PHP_WASM_ROOT; if(!runtime)throw Error('NF_PHP_WASM_ROOT required');
const require=createRequire(runtime+'/package.json');
const {PHP,loadPHPRuntime}=await import(pathToFileURL(require.resolve('@php-wasm/universal')));
const {getPHPLoaderModule}=await import(pathToFileURL(require.resolve('@php-wasm/node-8-3')));
const php=new PHP(await loadPHPRuntime(await getPHPLoaderModule()));
const repo=process.cwd();
const source=fs.readFileSync(repo+'/tests/fixtures/gateway-before-scope.php','utf8');
if((source.match(/count\(\$c\['scope'\]\) > 32/g)||[]).length!==1)throw Error('Unexpected original verifier');
const fixed=fs.readFileSync(repo+'/app/lib/Service/GatewayVerifier.php','utf8');
if(fixed.replace("count($c['scope']) > 64","count($c['scope']) > 32")!==source)throw Error('Change exceeds one expression');
const candidate=fixed.replace('final class PlatformDenied extends \\RuntimeException {}','').replace('final class GatewayVerifier {','final class GatewayVerifierScopeFix {');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const trust={kid:'a'.repeat(64),issuer:'https://connector.example.test',audienceBase:'https://native.example.test/ocs/v2.php/apps/novaspace_platform/api/v1/registry',publicKey:publicKey.export({type:'spki',format:'pem'})};
const scopes=[...fs.readFileSync(repo+'/../../online/connector/lib/oauth.ts','utf8').matchAll(/export const [A-Z_]+_SCOPE = "([^"]+)"/g)].map(x=>x[1]);
if(scopes.length!==35)throw Error('Expected 35 actual OAuth scopes');
const token=(scope,patch={})=>{const now=Math.floor(Date.now()/1000);const h={alg:'RS256',kid:trust.kid,typ:'novaspace-client+jwt'};const c={iss:trust.issuer,aud:trust.audienceBase+'/status',sub:'b'.repeat(64),client:'c'.repeat(64),scope,purpose:'status',iat:now,exp:now+30,nonce:'11111111-1111-4111-8111-111111111111',...patch};const data=Buffer.from(JSON.stringify(h)).toString('base64url')+'.'+Buffer.from(JSON.stringify(c)).toString('base64url');return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');};
const many=n=>Array.from({length:n},(_,i)=>'bounded-test:'+i);
const tests=[
 {name:'32 scopes',proof:token(scopes.slice(0,32)),original:true,candidate:true},
 {name:'35 actual OAuth scopes',proof:token(scopes),original:false,candidate:true},
 {name:'64 scope bound',proof:token(many(64)),original:false,candidate:true},
 {name:'65 scopes rejected',proof:token(many(65)),original:false,candidate:false},
 {name:'non-string scope rejected',proof:token([1]),original:false,candidate:false},
 {name:'wrong issuer rejected',proof:token(scopes.slice(0,32),{iss:'https://foreign.example.test'}),original:false,candidate:false},
 {name:'expired proof rejected',proof:token(scopes.slice(0,32),{iat:1,exp:31}),original:false,candidate:false},
 {name:'wrong audience rejected',proof:token(scopes.slice(0,32),{aud:trust.audienceBase+'/setup'}),original:false,candidate:false},
 {name:'wrong signature rejected',proof:token(scopes.slice(0,32)).replace(/\.[^.]+$/,'.'+Buffer.alloc(256).toString('base64url')),original:false,candidate:false}
];
try{
 php.writeFile('/original.php',source);php.writeFile('/candidate.php',candidate);php.writeFile('/tests.json',JSON.stringify({trust,tests}));
 const r=await php.run({code:String.raw`<?php
require '/original.php'; require '/candidate.php';
$d=json_decode(file_get_contents('/tests.json'),true,32,JSON_THROW_ON_ERROR);
$checks=0;
$verifiers=['original'=>new \OCA\NovaspacePlatform\Service\GatewayVerifier($d['trust']), 'candidate'=>new \OCA\NovaspacePlatform\Service\GatewayVerifierScopeFix($d['trust'])];
foreach($verifiers as $label=>$verifier){
 foreach($d['tests'] as $test){
  $accepted=false;
  try{$verifier->verify($test['proof'],'status');$accepted=true;}
  catch(\OCA\NovaspacePlatform\Service\PlatformDenied $e){}
  if($accepted!==$test[$label])throw new \RuntimeException('Unexpected result '.$label.' '.$test['name']);
  echo $label.' | '.$test['name'].' | '.($accepted?'ACCEPTED':'REJECTED')."\n"; ++$checks;
 }
}
echo 'PASS: '.$checks.' verifier boundary/signature checks; isolated fixtures only.'."\n";
`});
 process.stdout.write(r.text);process.stderr.write(r.errors);process.exitCode=r.exitCode===0&&!r.errors&&r.text.includes('PASS: 18')?0:1;
}finally{php.exit();}
