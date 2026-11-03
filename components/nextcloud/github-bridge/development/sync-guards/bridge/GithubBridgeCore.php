<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;

/** Bounded presentation and existing-mapping operations; no credential output. */
final class GithubBridgeCore {
    public function __construct(private \Closure $request, private \Closure $mappings, private \Closure $sync) {}
    public static function canonical(mixed $v): string {
        if (is_array($v)) {
            if (!array_is_list($v)) { ksort($v, SORT_STRING); }
            $parts = [];
            foreach ($v as $k => $x) { $parts[] = (array_is_list($v) ? '' : json_encode((string)$k, JSON_THROW_ON_ERROR) . ':') . self::canonical($x); }
            return (array_is_list($v) ? '[' : '{') . implode(',', $parts) . (array_is_list($v) ? ']' : '}');
        }
        return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR);
    }
    private static function text(mixed $v, int $limit): bool {
        return is_string($v) && strlen($v) <= $limit && !str_contains($v, "\0") && preg_match('//u', $v) === 1;
    }
    public static function shape(array $c): void {
        $shapes = ['status' => [], 'repositories' => ['page'], 'presentation_read' => ['repository'],
            'presentation_write' => ['repository', 'expectedAccount', 'expectedGithubLogin', 'expectedSha', 'expectedRepositoryId', 'expectedRepositoryAbsent', 'acknowledgePublic', 'readme', 'description'],
            'sync_status' => [], 'sync_run' => ['mappingId', 'boardId', 'expectedVersion', 'expectedAccount', 'expectedGithubLogin', 'acknowledgeSync']];
        $op = $c['operation'] ?? '';
        if (!is_string($op) || !isset($shapes[$op])) { throw new \InvalidArgumentException('invalid_operation'); }
        $actual = array_keys($c); sort($actual); $expected = array_merge(['operation'], $shapes[$op]); sort($expected);
        if ($actual !== $expected) { throw new \InvalidArgumentException('invalid_fields'); }
        if (isset($c['repository']) && (!is_string($c['repository']) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/D', $c['repository']) || str_ends_with(strtolower($c['repository']), '.git'))) { throw new \InvalidArgumentException('invalid_repository'); }
        if ($op === 'repositories' && (!is_int($c['page']) || $c['page'] < 1 || $c['page'] > 100)) { throw new \InvalidArgumentException('invalid_page'); }
        if (in_array($op, ['presentation_write', 'sync_run'], true)) {
            if (!self::text($c['expectedAccount'], 255) || $c['expectedAccount'] === '' || !is_string($c['expectedGithubLogin']) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/D', $c['expectedGithubLogin'])) { throw new \InvalidArgumentException('invalid_identity'); }
        }
        if ($op === 'presentation_write' && (!self::text($c['readme'], 65536) || trim($c['readme']) === '' || !self::text($c['description'], 350)
            || !($c['expectedRepositoryId'] === null || (is_int($c['expectedRepositoryId']) && $c['expectedRepositoryId'] > 0))
            || !is_bool($c['expectedRepositoryAbsent']) || $c['acknowledgePublic'] !== true
            || !($c['expectedSha'] === null || (is_string($c['expectedSha']) && preg_match('/^[0-9a-f]{40,64}$/D', $c['expectedSha']))))) { throw new \InvalidArgumentException('invalid_presentation'); }
        if ($op === 'sync_run' && (!is_int($c['mappingId']) || $c['mappingId'] < 1 || !is_int($c['boardId']) || $c['boardId'] < 1
            || !is_string($c['expectedVersion']) || !preg_match('/^[0-9a-f]{64}$/D', $c['expectedVersion']) || $c['acknowledgeSync'] !== true)) { throw new \InvalidArgumentException('invalid_mapping'); }
    }
    private function call(string $method, string $path, array $payload = []): array {
        $r = ($this->request)($method, $path, $payload);
        if (!is_array($r) || !is_int($r['status'] ?? null) || !is_array($r['data'] ?? null)) { throw new \RuntimeException('unconfirmed_remote_response'); }
        return $r;
    }
    private function ok(string $path): array {
        $r = $this->call('GET', $path);
        if ($r['status'] !== 200) { throw new \RuntimeException('remote_read_denied'); }
        return $r['data'];
    }
    private function readme(string $root): ?array {
        $r = $this->call('GET', $root . '/contents/README.md');
        if ($r['status'] === 404) { return null; }
        $d = $r['data'];
        if ($r['status'] !== 200 || ($d['type'] ?? null) !== 'file' || ($d['encoding'] ?? null) !== 'base64'
            || !is_string($d['content'] ?? null) || !is_string($d['sha'] ?? null) || ($d['size'] ?? 999999) > 131072) { throw new \RuntimeException('readme_unconfirmed'); }
        $text = base64_decode(str_replace(["\n", "\r"], '', $d['content']), true);
        if (!self::text($text, 131072)) { throw new \RuntimeException('readme_not_utf8'); }
        return ['sha' => $d['sha'], 'text' => $text];
    }
    /** Return bounded counters only; native text may contain private provider details. */
    private static function syncSummary(mixed $r): ?array {
        if (!is_array($r) || !is_int($r['deck_to_github'] ?? null) || !is_int($r['github_to_deck'] ?? null)
            || $r['deck_to_github'] < 0 || $r['github_to_deck'] < 0
            || !is_array($r['errors'] ?? null) || !is_array($r['warnings'] ?? null)) { return null; }
        if (isset($r['retryAt']) && (!is_int($r['retryAt']) || $r['retryAt'] < 0)) { return null; }
        return ['deckToGithub' => $r['deck_to_github'], 'githubToDeck' => $r['github_to_deck'],
            'errorCount' => count($r['errors']), 'warningCount' => count($r['warnings']),
            'retryAt' => $r['retryAt'] ?? null];
    }
    public function execute(string $account, array $c): array {
        self::shape($c);
        $op = $c['operation']; $write = in_array($op, ['presentation_write', 'sync_run'], true);
        if ($write && $c['expectedAccount'] !== $account) { return ['outcome' => 'account_conflict', 'committed' => false]; }
        $identity = $this->call('GET', '/user');
        if (in_array($identity['status'], [401, 403], true)) { return ['outcome' => 'github_access_denied', 'connected' => false, 'committed' => false]; }
        if ($identity['status'] !== 200) { throw new \RuntimeException('github_identity_unconfirmed'); }
        $user = $identity['data']; $login = $user['login'] ?? null;
        if (!is_string($login) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/D', $login)) { throw new \RuntimeException('github_identity_unconfirmed'); }
        $base = ['githubLogin' => $login, 'committed' => false];
        if ($write && strcasecmp($login, $c['expectedGithubLogin']) !== 0) { return $base + ['outcome' => 'github_account_conflict']; }
        if ($op === 'status') { return $base + ['outcome' => 'connected', 'connected' => true, 'bridgeVersion' => '0.1.1', 'githubScopes' => $identity['scopes'] ?? []]; }
        if ($op === 'repositories') {
            $repos = $this->ok('/user/repos?affiliation=owner&per_page=50&page=' . $c['page']); $out = [];
            foreach ($repos as $r) {
                if (!is_array($r) || strcasecmp((string)($r['owner']['login'] ?? ''), $login) !== 0) { throw new \RuntimeException('repository_owner_unconfirmed'); }
                $out[] = ['name' => $r['name'], 'private' => $r['private'], 'archived' => $r['archived'], 'defaultBranch' => $r['default_branch']];
            }
            return $base + ['outcome' => 'read', 'repositories' => $out, 'page' => $c['page'], 'hasMorePossible' => count($out) === 50];
        }
        if (in_array($op, ['sync_status', 'sync_run'], true)) {
            $maps = ($this->mappings)();
            if (!is_array($maps) || count($maps) > 100) { throw new \RuntimeException('mapping_list_unconfirmed'); }
            foreach ($maps as &$m) {
                $settings = $m; unset($settings['lastSync'], $settings['version']);
                $m['version'] = hash('sha256', self::canonical($settings));
            }
            unset($m);
            if ($op === 'sync_status') { return $base + ['outcome' => 'read', 'mappings' => $maps]; }
            $selected = null;
            foreach ($maps as $m) { if ($m['id'] === $c['mappingId']) { $selected = $m; } }
            if ($selected === null || $selected['boardId'] !== $c['boardId']) { return $base + ['outcome' => 'mapping_conflict']; }
            if ($selected['version'] !== $c['expectedVersion']) { return $base + ['outcome' => 'version_conflict']; }
            try {
                $r = ($this->sync)($selected['id']);
                $busy = is_array($r) && ($r['busy'] ?? false) === true;
                $summary = $busy ? null : self::syncSummary($r);
                if (!$busy && $summary === null) {
                    return $base + ['outcome' => 'unknown', 'mayHaveCommitted' => true,
                        'mappingId' => $selected['id'], 'boardId' => $selected['boardId']];
                }
                return $base + ['outcome' => $busy ? 'busy' : ($summary['errorCount'] > 0 ? 'sync_reported_errors' : 'sync_executed'),
                    'mappingId' => $selected['id'], 'boardId' => $selected['boardId'],
                    'mayHaveCommitted' => !$busy, 'readbackVerified' => false, 'nativeStats' => $summary,
                    'note' => 'Native Laufzähler, keine Einzelobjekt-Abnahme. Ziele vollständig zurücklesen; bei Fehlern oder unklarem Ergebnis nicht automatisch wiederholen.'];
            } catch (\Throwable) { return $base + ['outcome' => 'unknown', 'mayHaveCommitted' => true, 'mappingId' => $selected['id']]; }
        }
        $root = '/repos/' . rawurlencode($login) . '/' . rawurlencode($c['repository']);
        $repo = $this->call('GET', $root);
        if (!in_array($repo['status'], [200, 404], true)) { throw new \RuntimeException('repository_unconfirmed'); }
        $exists = $repo['status'] === 200;
        if ($exists && (strcasecmp((string)($repo['data']['owner']['login'] ?? ''), $login) !== 0 || strcasecmp((string)($repo['data']['name'] ?? ''), $c['repository']) !== 0)) { throw new \RuntimeException('repository_target_unconfirmed'); }
        $readme = $exists ? $this->readme($root) : null;
        if ($op === 'presentation_read') { return $base + ['outcome' => 'read', 'repository' => $c['repository'], 'exists' => $exists,
            'private' => $exists ? $repo['data']['private'] : null, 'repositoryId' => $exists ? $repo['data']['id'] : null, 'readme' => $readme]; }
        if ($exists === $c['expectedRepositoryAbsent']) { return $base + ['outcome' => 'repository_state_conflict']; }
        if (($exists ? ($repo['data']['id'] ?? null) : null) !== $c['expectedRepositoryId']) { return $base + ['outcome' => 'repository_identity_conflict']; }
        if ($exists && (($repo['data']['private'] ?? true) !== false || ($repo['data']['archived'] ?? true) !== false)) { return $base + ['outcome' => 'repository_not_public_and_writable']; }
        if (($readme['sha'] ?? null) !== $c['expectedSha']) { return $base + ['outcome' => 'version_conflict']; }
        $created = false;
        try {
            if (!$exists) {
                $r = $this->call('POST', '/user/repos', ['name' => $c['repository'], 'description' => $c['description'], 'private' => false, 'auto_init' => false, 'has_issues' => true]);
                if (in_array($r['status'], [401, 403], true)) { return $base + ['outcome' => 'github_operation_denied', 'requiredCapability' => 'public_repository_create', 'mayHaveCommitted' => false]; }
                if ($r['status'] !== 201 || ($r['data']['private'] ?? true) !== false || strcasecmp((string)($r['data']['full_name'] ?? ''), $login . '/' . $c['repository']) !== 0) { return $base + ['outcome' => 'repository_create_unconfirmed', 'mayHaveCommitted' => true]; }
                $created = true;
            }
            $payload = ['message' => 'Present NovaSpace Connector', 'content' => base64_encode($c['readme'])];
            if ($c['expectedSha'] !== null) { $payload['sha'] = $c['expectedSha']; }
            $r = $this->call('PUT', $root . '/contents/README.md', $payload);
            if (in_array($r['status'], [401, 403, 409], true)) { return $base + ['outcome' => $r['status'] === 409 ? 'version_conflict' : 'github_operation_denied', 'repositoryCreated' => $created, 'requiredCapability' => 'repository_content_write', 'mayHaveCommitted' => $created]; }
            if (!in_array($r['status'], [200, 201], true)) { return $base + ['outcome' => $created ? 'repository_created_readme_unconfirmed' : 'readme_write_unconfirmed', 'mayHaveCommitted' => true, 'repositoryCreated' => $created]; }
            $after = $this->readme($root);
            if ($after === null || $after['text'] !== $c['readme']) { throw new \RuntimeException('readback_unconfirmed'); }
            return ['githubLogin' => $login, 'outcome' => 'presentation_written', 'committed' => true, 'repositoryCreated' => $created,
                'repository' => $c['repository'], 'readmeSha' => $after['sha'], 'path' => 'README.md',
                'note' => 'Nur README.md geschrieben. Keine weiteren Dateien und keine Softwarelizenz angelegt.'];
        } catch (\Throwable) { return $base + ['outcome' => 'unknown', 'mayHaveCommitted' => true, 'repositoryCreated' => $created, 'repository' => $c['repository']]; }
    }
}
