<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace NovaSpace\SyncInstaller;

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('zend.exception_ignore_args', '1');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
$package = json_decode(base64_decode('__PAYLOAD__', true), true, 64, JSON_THROW_ON_ERROR);
$applied = []; $temps = []; $stage = null; $backup = null; $lock = null; $before = [];
$result = []; $exitCode = 0; $oldUmask = umask(0077);

function fail(string $code): never { throw new \RuntimeException($code); }
function readRegular(string $path): ?string {
    if (is_link($path) || (file_exists($path) && !is_file($path))) { fail('ns_non_regular_target'); }
    if (!file_exists($path)) { return null; }
    $text = file_get_contents($path);
    if (!is_string($text) || strlen($text) > 131072) { fail('ns_file_read_failed'); }
    return $text;
}
function writeProtected(string $path, string $text): void {
    if (file_put_contents($path, $text, LOCK_EX) !== strlen($text) || !chmod($path, 0600)
        || file_get_contents($path) !== $text) { fail('ns_backup_write_failed'); }
}
function replaceFile(string $path, string $text, int $mode): void {
    global $temps;
    $temp = tempnam(dirname($path), '.ns-sync-');
    if (!is_string($temp)) { fail('ns_stage_write_failed'); }
    $temps[] = $temp;
    if (file_put_contents($temp, $text, LOCK_EX) !== strlen($text) || !chmod($temp, $mode)
        || !rename($temp, $path)) { fail('ns_atomic_replace_failed'); }
    if (function_exists('opcache_invalidate')) { @opcache_invalidate($path, true); }
    if (file_get_contents($path) !== $text) { fail('ns_readback_failed'); }
}

try {
    if (PHP_VERSION_ID < 80300 || !is_file(getcwd().'/occ') || !is_file(getcwd().'/lib/base.php')) { fail('ns_nextcloud_cli_root_required'); }
    if (!defined('OC_CONSOLE')) { define('OC_CONSOLE', true); }
    require_once getcwd().'/lib/base.php';
    $manager = \OCP\Server::get(\OCP\App\IAppManager::class);
    $app = realpath($manager->getAppPath('novaspace_platform', true));
    if (!is_string($app) || !is_dir($app.'/lib/Service') || is_link($app.'/lib/Service')) { fail('ns_platform_path_unconfirmed'); }
    if (file_exists($app.'/appinfo/signature.json') || is_link($app.'/appinfo/signature.json')) { fail('ns_signed_platform_requires_signed_release'); }
    $data = realpath((string)\OCP\Server::get(\OCP\IConfig::class)->getSystemValue('datadirectory'));
    if (!is_string($data) || !is_dir($data) || !is_writable($data)) { fail('ns_protected_backup_unavailable'); }
    $backupRoot = $data.'/novaspace_connector_backups';
    if (is_link($backupRoot) || (!is_dir($backupRoot) && !mkdir($backupRoot, 0700))) { fail('ns_protected_backup_unavailable'); }
    $lock = fopen($backupRoot.'/sync-guard-install.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) { fail('ns_installer_busy'); }
    $files = $package['files'];
    if (array_keys($files) !== ['GithubSyncProjectAdapter.php','GithubBridgeCore.php','GithubBridgeService.php']) { fail('ns_package_shape_invalid'); }
    $targets = [];
    foreach ($files as $name => $entry) {
        $path = $app.'/lib/Service/'.$name;
        if (!is_writable(dirname($path)) || (file_exists($path) && !is_writable($path))) { fail('ns_target_not_writable'); }
        if (!is_string($entry['text']) || hash('sha256', $entry['text']) !== $entry['afterSha256']) { fail('ns_payload_hash_invalid'); }
        token_get_all($entry['text'], TOKEN_PARSE);
        $targets[$name] = $path;
        $before[$name] = readRegular($path);
    }
    $rollbackId = getenv('NOVASPACE_SYNC_ROLLBACK');
    if (is_string($rollbackId) && $rollbackId !== '') {
        if (!preg_match('/^sync-guard-v011-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$/D', $rollbackId)) { fail('ns_rollback_id_invalid'); }
        $backup = $backupRoot.'/'.$rollbackId;
        if (is_link($backup) || !is_dir($backup)) { fail('ns_rollback_backup_invalid'); }
        $manifest = json_decode((string)readRegular($backup.'/manifest.json'), true, 32, JSON_THROW_ON_ERROR);
        if (($manifest['kind'] ?? '') !== 'novaspace-sync-bridge-0.1.1' || array_keys($manifest['files']) !== array_keys($files)) { fail('ns_rollback_manifest_invalid'); }
        $restores = [];
        foreach ($files as $name => $entry) {
            $item = $manifest['files'][$name];
            if (($item['beforeSha256'] ?? null) !== $entry['beforeSha256'] || ($item['afterSha256'] ?? '') !== $entry['afterSha256']) { fail('ns_rollback_manifest_invalid'); }
            $saved = $entry['beforeSha256'] === null ? null : readRegular($backup.'/'.$name);
            if ($saved !== null && hash('sha256', $saved) !== $entry['beforeSha256']) { fail('ns_rollback_backup_hash_invalid'); }
            if ($saved === null && $entry['beforeSha256'] !== null) { fail('ns_rollback_backup_missing'); }
            $currentHash = $before[$name] === null ? null : hash('sha256', $before[$name]);
            if (!in_array($currentHash, [$entry['beforeSha256'], $entry['afterSha256']], true)) { fail('ns_rollback_target_changed'); }
            $restores[$name] = $saved;
        }
        foreach (array_reverse(array_keys($files)) as $name) {
            if (readRegular($targets[$name]) !== $before[$name]) { fail('ns_target_changed_during_run'); }
            $saved = $restores[$name];
            if ($saved === $before[$name]) { continue; }
            $applied[] = $name;
            if ($saved === null) { if (!unlink($targets[$name])) { fail('ns_rollback_remove_failed'); } }
            else { replaceFile($targets[$name], $saved, (int)$manifest['files'][$name]['mode']); }
        }
        foreach ($files as $name => $_) { if (readRegular($targets[$name]) !== $restores[$name]) { fail('ns_rollback_readback_failed'); } }
        $result = ['status'=>'rolled_back','backupId'=>$rollbackId,'filesVerified'=>3,'upstreamFilesChanged'=>0];
    } else {
        $upstream = realpath($manager->getAppPath('deckgithubsync', true));
        if (!is_string($upstream)) { fail('ns_upstream_path_unconfirmed'); }
        foreach ($package['upstreamSha256'] as $name => $hash) {
            $text = readRegular($upstream.'/lib/Service/'.$name);
            if ($text === null || hash('sha256', $text) !== $hash) { fail('ns_upstream_source_changed'); }
        }
        $oldCount = 0; $newCount = 0;
        foreach ($files as $name => $entry) {
            $hash = $before[$name] === null ? null : hash('sha256', $before[$name]);
            if ($hash === $entry['afterSha256']) { ++$newCount; }
            elseif ($hash === $entry['beforeSha256']) { ++$oldCount; }
            else { fail('ns_platform_source_changed'); }
        }
        if ($newCount === 3) {
            $result = ['status'=>'already_current','bridgeVersion'=>'0.1.1','changedFiles'=>0,'filesVerified'=>3,'upstreamFilesChanged'=>0];
        } else {
            if ($oldCount !== 3) { fail('ns_mixed_installation_requires_rollback'); }
            if (class_exists('OCA\\NovaspacePlatform\\Service\\GithubBridgeCore', false)) { fail('ns_fresh_cli_process_required'); }
            $stage = sys_get_temp_dir().'/ns-sync-check-'.bin2hex(random_bytes(8));
            if (!mkdir($stage.'/bridge',0700,true) || !mkdir($stage.'/tests',0700)) { fail('ns_test_stage_failed'); }
            writeProtected($stage.'/bridge/GithubBridgeCore.php', $files['GithubBridgeCore.php']['text']);
            foreach ($package['tests'] as $name => $text) {
                if (!in_array($name,['legacy-bridge-core.php','bridge-results.php'],true)) { fail('ns_test_shape_invalid'); }
                writeProtected($stage.'/tests/'.$name, $text);
                (static function(string $file): void { global $passed, $checks; require $file; })($stage.'/tests/'.$name);
            }
            $backupId = 'sync-guard-v011-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4));
            $backup = $backupRoot.'/'.$backupId;
            if (!mkdir($backup,0700)) { fail('ns_backup_create_failed'); }
            $manifest = ['kind'=>'novaspace-sync-bridge-0.1.1','files'=>[]];
            foreach ($files as $name => $entry) {
                $mode = $before[$name] === null ? 0640 : fileperms($targets[$name]) & 0777;
                if ($before[$name] !== null) { writeProtected($backup.'/'.$name, $before[$name]); }
                $manifest['files'][$name] = ['beforeSha256'=>$entry['beforeSha256'],'afterSha256'=>$entry['afterSha256'],'mode'=>$mode];
            }
            writeProtected($backup.'/manifest.json',json_encode($manifest,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
            foreach ($files as $name => $entry) {
                if (readRegular($targets[$name]) !== $before[$name]) { fail('ns_target_changed_during_run'); }
                $applied[] = $name;
                replaceFile($targets[$name],$entry['text'],(int)$manifest['files'][$name]['mode']);
            }
            $result = ['status'=>'installed','bridgeVersion'=>'0.1.1','changedFiles'=>3,'filesVerified'=>3,'backupId'=>$backupId,'upstreamFilesChanged'=>0,'mappingSettingsChanged'=>false];
        }
    }
} catch (\Throwable $error) {
    $restored = true;
    // If install failed, restore only files still containing this package's exact text.
    if (!(is_string($rollbackId ?? null) && $rollbackId !== '')) {
        foreach (array_reverse($applied) as $name) {
            try {
                $current = readRegular($targets[$name]);
                if ($current === $before[$name]) { continue; }
                if ($current !== $files[$name]['text']) { $restored=false; continue; }
                if ($before[$name] === null) { if (!unlink($targets[$name])) { $restored=false; } }
                else { replaceFile($targets[$name],$before[$name],(int)$manifest['files'][$name]['mode']); }
                if (readRegular($targets[$name]) !== $before[$name]) { $restored=false; }
            } catch (\Throwable) { $restored=false; }
        }
    } elseif ($applied !== []) { $restored=false; }
    $code = str_starts_with($error->getMessage(),'ns_') ? $error->getMessage() : 'ns_install_check_failed';
    $result = ['status'=>'stopped','code'=>$code,'recoveryVerified'=>$restored,'attemptedFilesBeforeStop'=>count($applied),'backupId'=>$backup===null?null:basename($backup)];
    $exitCode = 1;
} finally {
    foreach ($temps as $temp) { if (is_file($temp)) { @unlink($temp); } }
    if ($stage !== null) {
        foreach (['tests/legacy-bridge-core.php','tests/bridge-results.php','bridge/GithubBridgeCore.php'] as $file) { @unlink($stage.'/'.$file); }
        @rmdir($stage.'/tests'); @rmdir($stage.'/bridge'); @rmdir($stage);
    }
    if (is_resource($lock)) { flock($lock,LOCK_UN); fclose($lock); }
    umask($oldUmask);
}
echo 'NS_SYNC_BRIDGE_RESULT='.json_encode($result,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
exit($exitCode);
