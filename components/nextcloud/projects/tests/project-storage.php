<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
use OCA\NovaspaceCapsules\Service\ProjectCreation as StorageCreation;
use OCA\NovaspaceCapsules\Service\ProjectFolders as StorageFolders;
$checks=0;
$ok=static function(bool $pass,string $name)use(&$checks):void{if(!$pass)throw new RuntimeException('STORAGE_TEST:'.$name);++$checks;};
$fails=static function(callable $f,string $name)use($ok):void{try{$f();}catch(Throwable){$ok(true,$name);return;}$ok(false,$name);};
$id=str_repeat('c',32);
$legacy=['id'=>$id,'title'=>'Projekt','description'=>'','folder'=>'/Bisher','color'=>'DDCB55','stack'=>'Neu'];
$old=StorageCreation::request($id,'Projekt','','/Bisher/','ddcb55','Neu');
$ok($old===$legacy&&StorageCreation::fingerprint($old)===hash('sha256',json_encode($legacy,JSON_THROW_ON_ERROR)),'legacy-normalization-and-fingerprint');
$ok(StorageCreation::request($id,'Projekt','','/Bisher','DDCB55','Neu','custom')===$legacy,'explicit-custom-preserves-legacy');
$auto=StorageCreation::request($id,' Sommerfest ','Planung','/ignored','DDCB55','Neu','auto');
$ok($auto['folder']==='/Projekte/Sommerfest'&&$auto['folderMode']==='auto'&&$auto['title']==='Sommerfest','canonical-default-per-project');
$ok(StorageCreation::fingerprint($auto)!==StorageCreation::fingerprint(StorageCreation::request($id,'Sommerfest','Planung','/Projekte/Sommerfest','DDCB55','Neu','custom')),'default-mode-in-fingerprint');
$fails(fn()=>StorageCreation::request($id,'Projekt','','/','DDCB55','Neu','unknown'),'unknown-mode');
foreach(['/a//b','/a/../b','relative',"/a\nb",str_repeat('/a',1025)]as $bad)$fails(fn()=>StorageFolders::path($bad),'unsafe-folder');
$ok(StorageFolders::path('/Ablage/Planung/')==='/Ablage/Planung'&&StorageFolders::path('/')==='/','normal-paths');
echo 'NovaSpace Standardablage-Protokoll: '.$checks." Prüfungen bestanden.\n";
