<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
require_once __DIR__ . '/../bridge/GithubBridgeCore.php';
use OCA\NovaspacePlatform\Service\GithubBridgeCore;

$checks=0;
function checkResult(bool $v, string $message): void { global $checks; if (!$v) { throw new RuntimeException($message); } ++$checks; }
function fixtureResult(mixed $native, bool $throws=false): array {
    $calls=(object)['requests'=>0,'syncs'=>0,'maps'=>0];
    $mapping=['id'=>13,'boardId'=>11,'githubOwner'=>'ExampleOwner','githubNumber'=>2,
        'repository'=>'','direction'=>'github_to_deck','fieldConfig'=>'fixture','lastSync'=>1];
    $core=new GithubBridgeCore(
        function(string $method,string $path,array $payload) use($calls): array {
            ++$calls->requests;
            if ($method!=='GET'||$path!=='/user') { throw new RuntimeException('Unexpected HTTP operation'); }
            return ['status'=>200,'data'=>['login'=>'ExampleOwner','PRIVATE_USER_DATA'=>'must not leak']];
        },
        function() use($mapping,$calls): array { ++$calls->maps; return [$mapping]; },
        function(int $id) use($native,$throws,$calls): mixed {
            ++$calls->syncs;
            if ($id!==13) { throw new RuntimeException('Wrong map'); }
            if ($throws) { throw new RuntimeException('SECRET_PROVIDER_EXCEPTION'); }
            return $native;
        }
    );
    $settings=$mapping; unset($settings['lastSync']);
    $command=['operation'=>'sync_run','mappingId'=>13,'boardId'=>11,
        'expectedVersion'=>hash('sha256',GithubBridgeCore::canonical($settings)),
        'expectedAccount'=>'FixtureOwner','expectedGithubLogin'=>'ExampleOwner','acknowledgeSync'=>true];
    return [$core,$calls,$command];
}
$native=['deck_to_github'=>2,'github_to_deck'=>1,'errors'=>[],'warnings'=>[],'SECRET_TOKEN'=>'must not leak'];
[$core,$calls,$command]=fixtureResult($native);
$r=$core->execute('FixtureOwner',$command);
checkResult($r['outcome']==='sync_executed' && $r['nativeStats']===['deckToGithub'=>2,'githubToDeck'=>1,'errorCount'=>0,'warningCount'=>0,'retryAt'=>null], 'Preserve native counters');
checkResult($r['committed']===false && $r['mayHaveCommitted']===true && $r['readbackVerified']===false, 'Counters must not claim per-item readback or commit');
checkResult($calls->syncs===1 && $calls->requests===1, 'Exactly one selected run, no hidden retry');
checkResult(!str_contains(json_encode($r),'SECRET') && !str_contains(json_encode($r),'PRIVATE_USER_DATA'), 'Private fields excluded');

[$core,$calls,$command]=fixtureResult(array_replace($native,['errors'=>['SECRET_NATIVE_ERROR'],'warnings'=>['SECRET_NATIVE_WARNING','another']]));
$r=$core->execute('FixtureOwner',$command);
checkResult($r['outcome']==='sync_reported_errors' && $r['nativeStats']['errorCount']===1 && $r['nativeStats']['warningCount']===2, 'Native errors must remain visible as counts and outcome');
checkResult(!str_contains(json_encode($r),'SECRET') && $r['mayHaveCommitted'] && !$r['readbackVerified'], 'Partial native error is not a no-write or verified result');

[$core,$calls,$command]=fixtureResult(array_replace($native,['deck_to_github'=>0,'github_to_deck'=>0,'warnings'=>['private warning']]));
$r=$core->execute('FixtureOwner',$command);
checkResult($r['nativeStats']['deckToGithub']===0 && $r['nativeStats']['githubToDeck']===0 && $r['nativeStats']['warningCount']===1, 'Zero result and warning are not discarded');

[$core,$calls,$command]=fixtureResult(array_replace($native,['errors'=>['rate limit'],'retryAt'=>1800000000]));
$r=$core->execute('FixtureOwner',$command);
checkResult($r['outcome']==='sync_reported_errors' && $r['nativeStats']['retryAt']===1800000000 && $calls->syncs===1, 'Rate-limit timestamp preserved without retry');
[$core,$calls,$command]=fixtureResult(['busy'=>true,'SECRET'=>'ignored']);
$r=$core->execute('FixtureOwner',$command);
checkResult($r['outcome']==='busy' && $r['mayHaveCommitted']===false && $r['nativeStats']===null && $calls->syncs===1, 'Explicit busy result is not executed');

foreach ([null,[],['busy'=>false],array_replace($native,['deck_to_github'=>-1]),
    array_replace($native,['github_to_deck'=>'1']),array_replace($native,['errors'=>null]),
    array_replace($native,['warnings'=>'not-an-array']),array_replace($native,['retryAt'=>'later'])] as $invalid) {
    [$core,$calls,$command]=fixtureResult($invalid); $r=$core->execute('FixtureOwner',$command);
    checkResult($r['outcome']==='unknown' && $r['mayHaveCommitted']===true && $calls->syncs===1, 'Malformed native result is unknown and never repeated');
}
[$core,$calls,$command]=fixtureResult($native,true); $r=$core->execute('FixtureOwner',$command);
checkResult($r['outcome']==='unknown' && $r['mayHaveCommitted']===true && $calls->syncs===1 && !str_contains(json_encode($r),'SECRET'), 'Exception remains uncertain and private');

foreach ([['mappingId'=>14],['boardId'=>12],['expectedVersion'=>str_repeat('0',64)],['expectedGithubLogin'=>'AnotherOwner'],['expectedAccount'=>'AnotherAccount']] as $change) {
    [$core,$calls,$command]=fixtureResult($native); $r=$core->execute('FixtureOwner',array_replace($command,$change));
    checkResult($r['committed']===false && $calls->syncs===0, 'Existing target and identity guards must still prevent execution');
}
[$core,$calls,$command]=fixtureResult($native);
$r=$core->execute('FixtureOwner',['operation'=>'status']);
checkResult($r['bridgeVersion']==='0.1.1', 'Diagnostic bridge version');
echo "Bridge result regression: $checks checks passed\n";
