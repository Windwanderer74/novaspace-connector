// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve('.'),temp=resolve('.sites-runtime/test');
await mkdir(temp,{recursive:true});
const quote=value=>"'"+value.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
async function php(name,source){
 const file=resolve(temp,`project-entry-${name}.php`);await writeFile(file,source);
 const wasm=process.env.NF_PHP_WASM_CLI;
 const result=spawnSync(wasm?process.execPath:(process.env.NF_PHP_BIN??'php'),wasm?[wasm,file]:[file],{encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.doesNotMatch(result.stdout,/Fatal error|Parse error|Warning:/,result.stdout);
 return result.stdout;
}
test('Actual candidate controller preserves browser routes and gates API identity, reads and one native create',async()=>{
 const out=await php('controller',`<?php require ${quote(root+'/tests/project-connector-entry.php')};`);
 assert.match(out,/25 Prüfungen bestanden/);
});
test('Unchanged native creation, matrix, storage and ready-workplan protocols remain valid together',async()=>{
 const bootstrap=['app/lib/Service/CapsuleCore.php','update-0.2.8/lib/Service/ProjectFolders.php','update-0.2.9/lib/Service/ProjectCreation.php'];
 const suites=['project-create.php','project-framework.php','project-theme.php','project-storage.php','project-ready-workplan.php'];
 const out=await php('protocols','<?php '+[...bootstrap.map(p=>root+'/'+p),...suites.map(p=>root+'/tests/'+p)].map(p=>`require ${quote(p)};`).join('\n'));
 assert.deepEqual([...out.matchAll(/: (\d+) Prüfung(?:en)? bestanden/g)].map(match=>Number(match[1])),[35,11,1,11,6]);
});
test('Actual candidate service retains existing adapter checks and authenticates account context without writes',async()=>{
 const original=await readFile(root+'/tests/project-ready-workplan-service.php','utf8');
 const candidate=original.replace("__DIR__.'/../update-0.2.9/lib/Service/ProjectCreationService.php'",quote(root+'/update-0.2.12/lib/Service/ProjectCreationService.php'))
   .replaceAll('__DIR__',quote(root+'/tests'))
   .replace('public function getName(): string{return $this->name;}', "public function getPath(): string{foreach(Fixture::$files as $key=>$file)if($file===$this)return '/Soul/files/'.$key;throw new \\RuntimeException('MISSING_PATH');} public function getName(): string{return $this->name;}");
 assert.notEqual(candidate,original);
 const extra=String.raw`
namespace {
$apiChecks=0;$apiOk=static function(bool $pass,string $name)use(&$apiChecks):void{if(!$pass)throw new \RuntimeException('API_CONTEXT:'.$name);++$apiChecks;};
$apiFails=static function(callable $work,string $name)use($apiOk):void{try{$work();}catch(\Throwable){$apiOk(true,$name);return;}$apiOk(false,$name);};
$s=Fixture::reset();$before=serialize([Fixture::$db,Fixture::$files]);$apiOk($s->apiContext()===['account'=>'Soul'],'native-session-account');
$apiOk($before===serialize([Fixture::$db,Fixture::$files])&&Fixture::$fileWrites===0,'context-does-not-create-or-store');
$s=Fixture::reset();Fixture::$uid='ChatGPT';$apiFails(fn()=>$s->apiContext(),'technical-context-needs-proof');
$s=Fixture::reset();Fixture::$headers['Authorization']='Basic fixture';$apiFails(fn()=>$s->apiContext(),'api-context-needs-proof-for-any-user');
$s=Fixture::reset();Fixture::$uid='ChatGPT';Fixture::$headers=['Authorization'=>'Basic fixture','X-NovaSpace-Project-Access'=>'files-read-write-v1'];$apiOk($s->apiContext()===['account'=>'ChatGPT'],'technical-owner-context');
$apiFails(fn()=>$s->create(str_repeat('c',32),'Projekt','','/','343434','Neu','Soul'),'technical-context-cannot-create-as-soul');
$apiOk(Fixture::$db['boards']===[]&&Fixture::$fileWrites===0,'account-mismatch-preserves-resources');
Fixture::$headers['X-NovaSpace-Project-Access']='files-read-v1';$apiFails(fn()=>$s->apiContext(),'read-only-proof-not-misrepresented-as-write');
$s=Fixture::reset();$out=$s->create(str_repeat('e',32),'Pfadprojekt','','/','343434','Neu','Soul');$apiOk($out['mindmapPath']==='/Pfadprojekt.km','native-confirmed-file-path');
Fixture::$files['Moved/Pfadprojekt.km']=Fixture::$files['Pfadprojekt.km'];unset(Fixture::$files['Pfadprojekt.km']);$apiOk($s->status(str_repeat('e',32))['mindmapPath']==='/Moved/Pfadprojekt.km','known-file-id-survives-path-change');
echo 'NovaSpace tatsächlicher API-Kontokontext: '.$apiChecks." Prüfungen bestanden.\n";
}
`;
 const out=await php('service',candidate+extra);assert.match(out,/60 Prüfungen bestanden/);assert.match(out,/10 Prüfungen bestanden/);
});
test('Candidate keeps the prior version metadata except the intended native version bump',async()=>{
 const oldXml=await readFile(root+'/update-0.2.11/appinfo/info.xml','utf8');
 assert.equal(await readFile(root+'/update-0.2.12/appinfo/info.xml','utf8'),oldXml.replace('<version>0.2.11</version>','<version>0.2.12</version>'));
});
