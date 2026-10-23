<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/Service/GithubBridgeCore.php';
use OCA\NovaspacePlatform\Service\GithubBridgeCore;

$passed = 0;
function nfGithubCheck(bool $v, string $message): void { global $passed; if (!$v) { throw new RuntimeException($message); } ++$passed; }
function nfGithubFixture(array $state = []): array {
    $state += ['exists' => true, 'private' => false, 'sha' => str_repeat('a', 40), 'text' => 'old', 'login' => 'ExampleOwner', 'losePut' => false, 'createDeny' => false, 'putConflict' => false];
    $calls = (object)['calls' => []]; $maps = [['id' => 7, 'boardId' => 99, 'direction' => 'deck_to_github', 'repository' => '', 'lastSync' => 1]];
    $request = function ($method, $path, $payload) use (&$state, &$calls): array {
        $calls->calls[] = [$method, $path, $payload];
        if ($path === '/user') { return ['status' => 200, 'data' => ['login' => $state['login'], 'PRIVATE_FIELD' => 'must not leak']]; }
        if ($path === '/user/repos' && $method === 'POST') { if ($state['createDeny']) { return ['status' => 403, 'data' => []]; } $state['exists'] = true; return ['status' => 201, 'data' => ['private' => false, 'full_name' => $state['login'] . '/showcase']]; }
        if (str_ends_with($path, '/contents/README.md')) {
            if ($method === 'PUT') {
                if ($state['putConflict']) { return ['status' => 409, 'data' => []]; }
                if (($payload['sha'] ?? null) !== $state['sha']) { return ['status' => 409, 'data' => []]; }
                $state['text'] = base64_decode($payload['content']); $state['sha'] = str_repeat('b', 40);
                if ($state['losePut']) { throw new RuntimeException('SECRET_PROVIDER_MESSAGE'); }
                return ['status' => 201, 'data' => []];
            }
            return $state['sha'] === null ? ['status' => 404, 'data' => []] : ['status' => 200, 'data' => ['type' => 'file', 'encoding' => 'base64', 'content' => base64_encode($state['text']), 'sha' => $state['sha'], 'size' => strlen($state['text'])]];
        }
        return $state['exists'] ? ['status' => 200, 'data' => ['owner' => ['login' => $state['login']], 'name' => 'showcase', 'id' => 123, 'private' => $state['private'], 'archived' => false]] : ['status' => 404, 'data' => []];
    };
    $core = new GithubBridgeCore($request, fn() => $maps, function ($id) use (&$calls) { $calls->calls[] = ['SYNC', $id]; return []; });
    return [$core, $calls];
}
$write = ['operation' => 'presentation_write', 'repository' => 'showcase', 'expectedAccount' => 'Owner', 'expectedGithubLogin' => 'ExampleOwner',
    'expectedRepositoryId' => 123, 'expectedSha' => str_repeat('a', 40), 'expectedRepositoryAbsent' => false, 'acknowledgePublic' => true, 'readme' => 'new description', 'description' => 'Showcase'];
[$core, $calls] = nfGithubFixture();
$r = $core->execute('Owner', ['operation' => 'status']); nfGithubCheck($r['outcome'] === 'connected', 'status'); nfGithubCheck(!str_contains(json_encode($r), 'PRIVATE_FIELD'), 'private user fields');
[$core, $calls] = nfGithubFixture(); $r = $core->execute('Owner', $write); nfGithubCheck($r['committed'] === true && $r['readmeSha'] === str_repeat('b', 40), 'write and exact readback');
foreach ([['expectedAccount' => 'Other'], ['expectedRepositoryId' => 124], ['expectedGithubLogin' => 'Other'], ['expectedSha' => str_repeat('c', 40)], ['expectedRepositoryAbsent' => true]] as $patch) {
    [$core, $calls] = nfGithubFixture(); $r = $core->execute('Owner', array_replace($write, $patch)); nfGithubCheck($r['committed'] === false, 'conflict prevents commit');
    nfGithubCheck(count(array_filter($calls->calls, fn($x) => $x[0] !== 'GET')) === 0, 'conflict makes no mutation request');
}
[$core, $calls] = nfGithubFixture(['private' => true]); $r = $core->execute('Owner', $write); nfGithubCheck($r['outcome'] === 'repository_not_public_and_writable', 'private visibility preserved');
[$core, $calls] = nfGithubFixture(['losePut' => true]); $r = $core->execute('Owner', $write); nfGithubCheck($r['outcome'] === 'unknown' && $r['mayHaveCommitted'], 'lost write response'); nfGithubCheck(!str_contains(json_encode($r), 'SECRET'), 'exception sanitization');
[$core, $calls] = nfGithubFixture(['exists' => false, 'sha' => null]); $r = $core->execute('Owner', array_replace($write, ['expectedRepositoryId' => null, 'expectedSha' => null, 'expectedRepositoryAbsent' => true])); nfGithubCheck($r['committed'] && $r['repositoryCreated'], 'bounded creation and README');
foreach (['../other', 'owner/repo', 'x?token=secret', 'x.git', '', str_repeat('x', 101)] as $name) {
    try { GithubBridgeCore::shape(array_replace($write, ['repository' => $name])); nfGithubCheck(false, 'unsafe target accepted'); } catch (InvalidArgumentException) { nfGithubCheck(true, 'unsafe target rejected'); }
}
foreach ([['acknowledgePublic' => false], ['readme' => "x\0y"], ['readme' => str_repeat('x', 65537)], ['extra' => 'field']] as $patch) {
    try { GithubBridgeCore::shape(array_replace($write, $patch)); nfGithubCheck(false, 'invalid command accepted'); } catch (InvalidArgumentException) { nfGithubCheck(true, 'invalid command rejected'); }
}
[$core, $calls] = nfGithubFixture(); $status = $core->execute('Owner', ['operation' => 'sync_status']);
$run = ['operation' => 'sync_run', 'mappingId' => 7, 'boardId' => 99, 'expectedVersion' => $status['mappings'][0]['version'], 'expectedAccount' => 'Owner', 'expectedGithubLogin' => 'ExampleOwner', 'acknowledgeSync' => true];
$r = $core->execute('Owner', $run); nfGithubCheck($r['outcome'] === 'sync_executed' && !$r['committed'], 'sync is not a per-item commit claim');
foreach ([['boardId' => 100], ['mappingId' => 8], ['expectedVersion' => str_repeat('0', 64)] ] as $patch) {
    [$core, $calls] = nfGithubFixture(); $r = $core->execute('Owner', array_replace($run, $patch)); nfGithubCheck(in_array($r['outcome'], ['mapping_conflict', 'version_conflict']), 'mapping binding');
}
nfGithubCheck(GithubBridgeCore::canonical(['z' => 'ä/x', 'a' => ['b' => true]]) === '{"a":{"b":true},"z":"ä/x"}', 'cross-runtime canonical body');
[$core, $calls] = nfGithubFixture(['exists' => false, 'sha' => null, 'createDeny' => true]);
$r = $core->execute('Owner', array_replace($write, ['expectedRepositoryId' => null, 'expectedSha' => null, 'expectedRepositoryAbsent' => true]));
nfGithubCheck($r['outcome'] === 'github_operation_denied' && !$r['mayHaveCommitted'], 'denied creation is not presented as an uncertain success');
[$core, $calls] = nfGithubFixture(['putConflict' => true]); $r = $core->execute('Owner', $write);
nfGithubCheck($r['outcome'] === 'version_conflict' && !$r['committed'], 'GitHub SHA conflict is preserved');
echo "GitHub bridge core: $passed checks passed\n";
