<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
use OCA\NovaspaceCapsules\Service\ProjectCreation as ReadyCreation;
use OCA\NovaspaceCapsules\Service\CapsuleCore as ReadyCore;
$checks=0;$ok=static function(bool $value,string $name)use(&$checks):void{if(!$value)throw new RuntimeException('READY_TEST:'.$name);++$checks;};
$input=ReadyCreation::request(str_repeat('d',32),'Projekt','Originalbeschreibung','/','DDCB55','Neu');
$map=ReadyCore::parse(ReadyCreation::map($input,77,88,'https://cloud.example'));
$a=(array)$map['root']['data']['nfDeckAggregate'];
$ok($a['version']===1&&$a['scope']==='defined-checklist-tasks','explicit-project-workplan');
$ok($a['total']===0&&$a['completed']===0&&$a['percent']===null&&!$a['allChecked']&&$a['state']==='unplanned','empty-project-not-complete');
$ok($a['icon']===1&&$map['root']['data']['progress']===1,'native-empty-pie-retained');
$ok(count($map['root']['children'])===1&&!isset($map['root']['data']['nfDeckSync'])&&$map['root']['data']['note']==='Originalbeschreibung','no-first-task-or-description-change');
$legacy=ReadyCore::parse(ReadyCreation::map($input,77,88,'https://cloud.example',[],false));$ok(!isset($legacy['root']['data']['nfDeckAggregate']),'legacy-attempt-format-preserved');
$state=['input'=>$input,'boardId'=>77,'stackId'=>88,'fileId'=>99];
unset($map['root']['data']['nfDeckAggregate']);ReadyCreation::proveMap(ReadyCore::encode($map),$state);$ok(true,'legacy-project-proof-remains-valid');
echo 'NovaSpace projektbereiter Arbeitsplan: '.$checks." Prüfungen bestanden.\n";
