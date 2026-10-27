<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
use OCA\NovaspaceCapsules\Service\ProjectCreation as FrameworkCreation;
use OCA\NovaspaceCapsules\Service\CapsuleCore as FrameworkCore;
if (!class_exists(FrameworkCreation::class)) { require __DIR__.'/../update-0.2.1/lib/Service/ProjectCreation.php'; }
if (!class_exists(FrameworkCore::class)) { require __DIR__.'/../app/lib/Service/CapsuleCore.php'; }
$checks=0;
$ok=static function(bool $value,string $name)use(&$checks):void{if(!$value)throw new RuntimeException('FRAMEWORK_TEST:'.$name);++$checks;};
$fails=static function(callable $call,string $name)use($ok):void{try{$call();}catch(Throwable){$ok(true,$name);return;}$ok(false,$name);};
$input=FrameworkCreation::request(str_repeat('a',32),'Projekt','','/','DDCB55','Neu');
$state=['input'=>$input,'boardId'=>77,'stackId'=>88,'fileId'=>99,'frameworkVersion'=>1,'stacks'=>[]];
foreach(FrameworkCreation::MATRIX as $order=>$title)$state['stacks'][]=['id'=>88+$order,'title'=>$title,'order'=>$order];
$f=FrameworkCreation::framework($state);$text=FrameworkCreation::map($input,77,88,'https://cloud.example',$f);FrameworkCreation::proveMap($text,$state);
$ok(true,'framework-proof');$map=FrameworkCore::parse($text);
$ok(count($map['root']['children'])===1&&!isset($map['root']['data']['nfDeckSync']),'project-starts-without-card');
$ok(FrameworkCreation::framework(FrameworkCreation::mapping($state))===$f,'registry-preserves-matrix');
$ok($map['root']['data']['nfDeckTarget']->stackId===88,'new-work-targets-neu');
foreach(['duplicate','rename','reorder','missing'] as $case){$bad=$state;if($case==='duplicate')$bad['stacks'][1]['id']=88;if($case==='rename')$bad['stacks'][1]['title']='Andere';if($case==='reorder')$bad['stacks'][1]['order']=3;if($case==='missing')array_pop($bad['stacks']);$fails(fn()=>FrameworkCreation::framework($bad),'matrix-'.$case);}
$legacy=$state;unset($legacy['frameworkVersion'],$legacy['stacks']);$ok(FrameworkCreation::framework($legacy)===[],'legacy-has-no-framework');
$old=FrameworkCreation::map($input,77,88,'https://cloud.example');$fails(fn()=>FrameworkCreation::proveMap($old,$state),'missing-map-framework-refused');
FrameworkCreation::proveMap($old,$legacy);$ok(true,'legacy-map-proof-preserved');
echo 'NovaSpace Vierer-Matrix: '.$checks." Prüfungen bestanden.\n";
