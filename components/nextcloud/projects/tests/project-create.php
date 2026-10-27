<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
use OCA\NovaspaceCapsules\Service\ProjectCreation as CreateProject;
use OCA\NovaspaceCapsules\Service\CapsuleCore as ProjectMap;
if (!class_exists(CreateProject::class)) { require __DIR__ . '/../update-0.2.0/lib/Service/ProjectCreation.php'; }
if (!class_exists(ProjectMap::class)) { require __DIR__ . '/../app/lib/Service/CapsuleCore.php'; }
$checks = 0;
$ok = static function (bool $value, string $name) use (&$checks): void { if (!$value) { throw new RuntimeException('CREATION_TEST:' . $name); } ++$checks; };
$fails = static function (callable $work, string $name) use ($ok): void { try { $work(); } catch (Throwable) { $ok(true, $name); return; } $ok(false, $name); };
$input = CreateProject::request(str_repeat('a',32), ' Projekt ä ', 'Eigene Beschreibung', '/Projekte/', 'ddcb55', 'Neu');
$ok($input['title'] === 'Projekt ä' && $input['folder'] === '/Projekte' && $input['color'] === 'DDCB55', 'normalized-input');
foreach ([['id'=>'../x'],['title'=>'../x'],['title'=>"x\ny"],['folder'=>'/a/../b'],['folder'=>'relative'],['color'=>'red'],['stack'=>''],['description'=>str_repeat('x',16001)]] as $patch) {
    $a = array_replace($input,$patch);
    $fails(fn()=>CreateProject::request($a['id'],$a['title'],$a['description'],$a['folder'],$a['color'],$a['stack']), 'invalid-' . array_key_first($patch));
}
$factory = static function (?string $failure = null) use ($input): object {
    $f = (object)['state'=>null,'boards'=>0,'files'=>0,'fileExists'=>false,'commits'=>0,'saves'=>0,'failure'=>$failure];
    $f->io = [
        'load'=>static fn(string $id)=>$f->state,
        'preflight'=>static function(array $i) use ($f): void { if ($f->failure === 'preflight') throw new RuntimeException('FILE_EXISTS'); },
        'reserve'=>static function(array $i) use ($f): array {
            ++$f->boards; $f->state=['version'=>1,'input'=>$i,'fingerprint'=>CreateProject::fingerprint($i),'phase'=>'board-created','boardId'=>77,'stackId'=>88];
            if ($f->failure === 'reserve-response') { $f->failure=null; throw new RuntimeException('LOST_RESPONSE'); }
            return $f->state;
        },
        'save'=>static function(array $s) use ($f): void {
            ++$f->saves;
            if ($f->failure === 'intent-save' && $s['phase'] === 'map-creating') { $f->failure=null; throw new RuntimeException('SAVE_FAILED'); }
            if ($f->failure === 'file-id-save' && $s['phase'] === 'map-created') { $f->failure=null; throw new RuntimeException('SAVE_FAILED'); }
            $f->state=$s;
        },
        'map'=>static function(array $s,bool $mayCreate) use ($f): int {
            if (!$f->fileExists) {
                if (!$mayCreate) throw new RuntimeException('PROJECT_MAP_OUTCOME_UNKNOWN');
                if ($f->failure === 'before-file') { $f->failure=null; throw new RuntimeException('FILE_OUTCOME_UNKNOWN'); }
                ++$f->files; $f->fileExists=true;
                if ($f->failure === 'after-file') { $f->failure=null; throw new RuntimeException('LOST_FILE_RESPONSE'); }
            }
            return 99;
        },
        'commit'=>static function(array $s) use ($f): array {
            if ($f->failure === 'before-commit') { $f->failure=null; throw new RuntimeException('REGISTRY_UNAVAILABLE'); }
            ++$f->commits; $s['phase']='complete'; $f->state=$s;
            if ($f->failure === 'after-commit') { $f->failure=null; throw new RuntimeException('LOST_COMMIT_RESPONSE'); }
            return $s;
        },
        'verify'=>static fn(array $s)=>['state'=>$s['phase'],'boardId'=>$s['boardId'],'fileId'=>$s['fileId']],
    ];
    return $f;
};
$f=$factory();$result=CreateProject::run($input,$f->io);$ok($result['state']==='complete'&&$f->boards===1&&$f->files===1&&$f->commits===1,'one-project');
$writes=[$f->boards,$f->files,$f->commits,$f->saves];$again=CreateProject::run($input,$f->io);$ok($again===$result&&$writes===[$f->boards,$f->files,$f->commits,$f->saves],'repeat-is-read-only');
$fails(fn()=>CreateProject::run(array_replace($input,['title'=>'Anders']),$f->io),'changed-input-refused');
$ok($writes===[$f->boards,$f->files,$f->commits,$f->saves],'conflicting-repeat-writes-nothing');
$f=$factory('preflight');$fails(fn()=>CreateProject::run($input,$f->io),'preflight-stops');$ok($f->boards===0&&$f->files===0,'preflight-creates-nothing');
foreach (['reserve-response','intent-save','after-file','file-id-save','before-commit','after-commit'] as $phase) {
    $f=$factory($phase);$fails(fn()=>CreateProject::run($input,$f->io),'interruption-' . $phase);
    $result=CreateProject::run($input,$f->io);
    $ok($result['state']==='complete'&&$f->boards===1&&$f->files===1,'resume-without-duplicates-' . $phase);
}
$f=$factory('before-file');$fails(fn()=>CreateProject::run($input,$f->io),'unknown-file-outcome');$fails(fn()=>CreateProject::run($input,$f->io),'unknown-file-not-blindly-repeated');$ok($f->boards===1&&$f->files===0,'uncertain-outcome-preserved');
$text=CreateProject::map($input,77,88,'https://cloud.example');$map=ProjectMap::parse($text);
$ok(count($map['root']['children'])===1&&$map['root']['children'][0]['data']['text']==='Deck-Board öffnen'&&$map['root']['data']['progress']===1&&!isset($map['root']['data']['nfDeckSync'])&&!isset($map['root']['data']['hyperlink']),'empty-project-is-unplanned-root-stays-editable');
$state=['input'=>$input,'boardId'=>77,'stackId'=>88,'fileId'=>99];CreateProject::proveMap($text,$state);$ok(true,'project-proof');
$bad=$map;$bad['root']['data']['nfProjectCapsule']=clone $bad['root']['data']['nfProjectCapsule'];$bad['root']['data']['nfProjectCapsule']->boardId=78;$fails(fn()=>CreateProject::proveMap(ProjectMap::encode($bad),$state),'foreign-board-rejected');
$bad=$map;$bad['root']['data']['id']='foreign';$fails(fn()=>CreateProject::proveMap(ProjectMap::encode($bad),$state),'foreign-root-rejected');
$mapping=CreateProject::mapping($state);$ok($mapping===['boardId'=>77,'fileId'=>99,'rootId'=>'ns_project_'.$input['id'],'afterCardId'=>0,'enabled'=>true],'stable-project-mapping');
echo 'NovaSpace gemeinsame Projektanlage: ' . $checks . " Prüfungen bestanden.\n";
