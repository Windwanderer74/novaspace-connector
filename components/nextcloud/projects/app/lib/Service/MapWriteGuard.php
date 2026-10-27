<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;

/** Conditional check in View's pre-write hook, while its native shared lock is held. */
final class MapWriteGuard {
    private static ?array $active = null;
    private static array $registered = [];
    public static function run(string $path, callable $verify, callable $write, string $channel = 'OC_Filesystem'): void {
        if (self::$active !== null) { throw new \RuntimeException('MAP_CAS_BUSY'); }
        if (!in_array($channel, ['OC_Filesystem', 'NovaSpace_CAS_Test'], true)) { throw new \RuntimeException('MAP_CAS_CHANNEL'); }
        if (!isset(self::$registered[$channel])) {
            \OCP\Util::connectHook($channel, 'write', self::class, 'beforeWrite'); self::$registered[$channel] = true;
        }
        self::$active = ['path'=>$path,'verify'=>$verify,'seen'=>false,'checking'=>false,'error'=>null];
        try {
            try { $write(); }
            catch (\Throwable $error) { throw self::$active['error'] ?? $error; }
            if (self::$active['error'] !== null) { throw self::$active['error']; }
            if (!self::$active['seen']) { throw new \RuntimeException('MAP_CAS_NOT_VERIFIED'); }
        } finally { self::$active = null; }
    }
    public static function beforeWrite(array $params): void {
        if (self::$active === null || ($params['path'] ?? null) !== self::$active['path']) { return; }
        self::$active['seen'] = true;
        try {
            if (self::$active['checking']) { throw new \RuntimeException('MAP_CAS_REENTRANT'); }
            self::$active['checking'] = true;
            (self::$active['verify'])();
        } catch (\Throwable $error) {
            // OC_Hook catches ordinary exceptions. Its referenced run flag must veto the write.
            self::$active['error'] = $error; $params['run'] = false;
        } finally { self::$active['checking'] = false; }
    }
}
