<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
// Exercise Nextcloud's actual hook reference/veto semantics in an isolated test channel.
// No filesystem signal, file, card, permission or database lock is changed.
(static function (): void {
    $check = static function (bool $ok, string $label): void { if (!$ok) { throw new \RuntimeException('CAS_TEST:' . $label); } };
    $run = static function (callable $verify, callable $writer): void {
        \OCA\NovaspaceCapsules\Service\MapWriteGuard::run('/test.km', $verify, $writer, 'NovaSpace_CAS_Test');
    };
    $emit = static function (string $path = '/test.km'): bool {
        $allowed = true; \OC_Hook::emit('NovaSpace_CAS_Test', 'write', ['path'=>$path,'run'=>&$allowed]); return $allowed;
    };
    $content = 'original'; $checked = 0; $shared = false;
    $run(static function () use (&$checked, &$shared): void { if (!$shared) { throw new \RuntimeException('NO_SHARED_LOCK'); } ++$checked; },
        static function () use (&$content, &$shared, $emit): void { $shared = true; if ($emit()) { $content = 'new'; } $shared = false; });
    $check($content === 'new' && $checked === 1, 'native-hook-verified-write');
    $content = 'foreign-change';
    try { $run(static function (): void { throw new \RuntimeException('MAP_CHANGED'); }, static function () use (&$content, $emit): void { if ($emit()) { $content = 'overwritten'; } }); $check(false, 'veto-must-throw'); }
    catch (\RuntimeException $e) { $check($e->getMessage() === 'MAP_CHANGED' && $content === 'foreign-change', 'changed-content-vetoed'); }
    try { $run(static function (): void { throw new \RuntimeException('MAP_IDENTITY'); }, static function () use (&$content, $emit): void { if ($emit()) { $content = 'wrong-file'; } }); $check(false, 'identity-must-throw'); }
    catch (\RuntimeException $e) { $check($e->getMessage() === 'MAP_IDENTITY' && $content === 'foreign-change', 'identity-vetoed'); }
    $checked = 0; $run(static function () use (&$checked): void { ++$checked; }, static function () use ($emit): void { $emit('/other.km'); $emit(); });
    $check($checked === 1, 'unrelated-hooks-ignored');
    try { $run(static function (): void {}, static function (): void { throw new \OCP\Lock\LockedException('/test.km'); }); $check(false, 'foreign-lock-must-throw'); }
    catch (\OCP\Lock\LockedException) { $check($content === 'foreign-change', 'foreign-lock-preserved'); }
    try { $run(static function (): void {}, static function (): void {}); $check(false, 'missing-hook-must-throw'); }
    catch (\RuntimeException $e) { $check($e->getMessage() === 'MAP_CAS_NOT_VERIFIED', 'missing-hook-not-accepted'); }
    $checked = 0; $run(static function () use (&$checked): void { ++$checked; }, static function () use ($emit): void { $emit(); });
    $check($checked === 1, 'failed-context-cleaned-up');
    echo "NovaSpace Map-CAS: 7 Schutzprüfungen bestanden.\n";
})();
