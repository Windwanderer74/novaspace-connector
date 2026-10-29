# SPDX-License-Identifier: AGPL-3.0-or-later
from pathlib import Path
import base64, fcntl, hashlib, json, os, re, shutil, subprocess, tempfile, unittest

SOURCE = Path(__file__).resolve().parents[1]
BUNDLE = SOURCE / 'NovaSpace_GitHub_Sync_Bridge_0_1_1_Installer.php.txt'
PACKAGE = json.loads(base64.b64decode(re.search(r"base64_decode\('([^']+)'", BUNDLE.read_text()).group(1)))
PHP = [os.environ.get('NS_TEST_PHP', 'php')]
if os.environ.get('NS_TEST_PHP_INI'):
    PHP += ['-c', os.environ['NS_TEST_PHP_INI']]
PHP += ['-d', 'display_errors=1']

BOOTSTRAP = r'''<?php
namespace OCP {
 class Server {public static function get(string $id): object {return new class {
  public function getAppPath(string $app,bool $enabled=true): string {return getcwd().($app==='novaspace_platform'?'/platform':'/upstream');}
  public function getSystemValue(string $key): string {return getcwd().'/data';}
 };}}
}
namespace NovaSpace\SyncInstaller {
 function rename(string $from,string $to): bool {
  $marker=getcwd().'/fail-third';
  if(is_file($marker)&&str_ends_with($to,'GithubBridgeService.php')){\unlink($marker);return false;}
  $marker=getcwd().'/concurrent-core';
  if(is_file($marker)&&str_ends_with($to,'GithubSyncProjectAdapter.php')){\unlink($marker);\file_put_contents(getcwd().'/platform/lib/Service/GithubBridgeCore.php','<?php // concurrent editor');}
  return \rename($from,$to);
 }
 function file_get_contents(string $path): string|false {
  $text=\file_get_contents($path);$marker=getcwd().'/fail-readback';
  if(is_file($marker)&&str_ends_with($path,'/platform/lib/Service/GithubBridgeService.php')&&str_contains((string)$text,'GithubSyncProjectAdapter::forMapping')){\unlink($marker);return 'incorrect readback';}
  return $text;
 }
 function file_put_contents(string $path,mixed $text,int $flags=0): int|false {
  if(is_file(getcwd().'/fail-backup')&&str_ends_with($path,'/manifest.json')){return false;}
  return \file_put_contents($path,$text,$flags);
 }
}
'''

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ns-sync-installer-')
        self.root = Path(self.temp.name)
        for directory in ['platform/lib/Service','platform/appinfo','upstream/lib/Service','upstream/appinfo','data','lib']:
            (self.root/directory).mkdir(parents=True, exist_ok=True)
        (self.root/'occ').write_text('<?php')
        (self.root/'lib/base.php').write_text(BOOTSTRAP)
        (self.root/'installer.php').write_text(BUNDLE.read_text())
        self.original = {}
        for name, entry in PACKAGE['files'].items():
            if entry['beforeSha256'] is None:
                continue
            text = (SOURCE.parents[1]/'src/Service'/name).read_text().replace('// SPDX-License-Identifier: AGPL-3.0-or-later\n','',1)
            self.assertEqual(hashlib.sha256(text.encode()).hexdigest(),entry['beforeSha256'])
            path=self.root/'platform/lib/Service'/name
            path.write_text(text);path.chmod(0o640);self.original[name]=text
        for name, digest in PACKAGE['upstreamSha256'].items():
            shutil.copyfile(SOURCE/'upstream/lib/Service'/name,self.root/'upstream/lib/Service'/name)
        (self.root/'upstream/appinfo/signature.json').write_text('fixture-signature-preserved')
        (self.root/'data/pilot-settings.json').write_text('{"direction":"deck_to_github","private":true}')
        self.upstream = {p.relative_to(self.root/'upstream').as_posix():p.read_bytes() for p in (self.root/'upstream').rglob('*') if p.is_file()}

    def tearDown(self):
        self.temp.cleanup()

    def run_bundle(self, rollback=None):
        env=os.environ.copy();env.pop('NOVASPACE_SYNC_ROLLBACK',None)
        if rollback is not None:env['NOVASPACE_SYNC_ROLLBACK']=rollback
        result=subprocess.run(PHP+[str(self.root/'installer.php')],cwd=self.root,env=env,capture_output=True,text=True,timeout=30)
        match=re.search(r'^NS_SYNC_BRIDGE_RESULT=(.*)$',result.stdout,re.M)
        self.assertIsNotNone(match,result.stdout+result.stderr)
        return json.loads(match.group(1)),result

    def assert_before(self):
        for name,text in self.original.items():self.assertEqual((self.root/'platform/lib/Service'/name).read_text(),text)
        self.assertFalse((self.root/'platform/lib/Service/GithubSyncProjectAdapter.php').exists())

    def assert_after(self):
        for name,entry in PACKAGE['files'].items():self.assertEqual((self.root/'platform/lib/Service'/name).read_text(),entry['text'])

    def assert_upstream_unchanged(self):
        actual={p.relative_to(self.root/'upstream').as_posix():p.read_bytes() for p in (self.root/'upstream').rglob('*') if p.is_file()}
        self.assertEqual(actual,self.upstream)
        self.assertEqual((self.root/'data/pilot-settings.json').read_text(),'{"direction":"deck_to_github","private":true}')

    def test_installs_only_three_own_files_and_preserves_signed_upstream(self):
        data,result=self.run_bundle()
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(data['status'],'installed')
        self.assertIn('34 checks passed',result.stdout);self.assertIn('24 checks passed',result.stdout)
        self.assert_after();self.assert_upstream_unchanged()
        backup=self.root/'data/novaspace_connector_backups'/data['backupId']
        manifest=json.loads((backup/'manifest.json').read_text())
        self.assertEqual(len(manifest['files']),3)
        for name,text in self.original.items():
            self.assertEqual((backup/name).read_text(),text)
            self.assertEqual((backup/name).stat().st_mode&0o777,0o600)

    def test_repeat_is_noop(self):
        first,_=self.run_bundle();second,result=self.run_bundle()
        self.assertEqual(result.returncode,0);self.assertEqual(second['status'],'already_current');self.assertEqual(second['changedFiles'],0)
        self.assertEqual(len(list((self.root/'data/novaspace_connector_backups').glob('sync-guard-v011-*'))),1)
        self.assert_after();self.assert_upstream_unchanged()

    def test_explicit_rollback_and_repeat_restore_exact_originals(self):
        first,_=self.run_bundle();rolled,result=self.run_bundle(first['backupId'])
        self.assertEqual(result.returncode,0);self.assertEqual(rolled['status'],'rolled_back');self.assert_before();self.assert_upstream_unchanged()
        again,result=self.run_bundle(first['backupId']);self.assertEqual(result.returncode,0);self.assertEqual(again['status'],'rolled_back')

    def test_unknown_own_source_stops_without_overwrite(self):
        path=self.root/'platform/lib/Service/GithubBridgeCore.php';path.write_text('<?php // custom')
        data,result=self.run_bundle();self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_platform_source_changed')
        self.assertEqual(path.read_text(),'<?php // custom');self.assertFalse((path.parent/'GithubSyncProjectAdapter.php').exists())

    def test_changed_upstream_stops_without_own_file_changes(self):
        (self.root/'upstream/lib/Service/SyncService.php').write_text('<?php // future release')
        data,result=self.run_bundle();self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_upstream_source_changed');self.assert_before()

    def test_signed_own_platform_requires_signed_release(self):
        (self.root/'platform/appinfo/signature.json').write_text('signed-platform')
        data,result=self.run_bundle();self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_signed_platform_requires_signed_release');self.assert_before()

    def test_mixed_installation_is_not_overwritten(self):
        (self.root/'platform/lib/Service/GithubBridgeCore.php').write_text(PACKAGE['files']['GithubBridgeCore.php']['text'])
        data,result=self.run_bundle();self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_mixed_installation_requires_rollback')
        self.assertFalse((self.root/'platform/lib/Service/GithubSyncProjectAdapter.php').exists())

    def test_symlink_is_rejected(self):
        outside=self.root/'outside';outside.write_text('do not change')
        (self.root/'platform/lib/Service/GithubSyncProjectAdapter.php').symlink_to(outside)
        data,result=self.run_bundle();self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_non_regular_target');self.assertEqual(outside.read_text(),'do not change')

    def test_failed_third_write_rolls_back_first_two(self):
        (self.root/'fail-third').touch();data,result=self.run_bundle()
        self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_atomic_replace_failed');self.assertTrue(data['recoveryVerified'])
        self.assert_before();self.assert_upstream_unchanged()

    def test_failed_post_rename_readback_rolls_back_all_files(self):
        (self.root/'fail-readback').touch();data,result=self.run_bundle()
        self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_readback_failed');self.assertTrue(data['recoveryVerified'])
        self.assert_before();self.assert_upstream_unchanged()

    def test_backup_failure_prevents_app_changes(self):
        (self.root/'fail-backup').touch();data,result=self.run_bundle()
        self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_backup_write_failed');self.assert_before()

    def test_concurrent_editor_is_preserved(self):
        (self.root/'concurrent-core').touch();data,result=self.run_bundle()
        self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_target_changed_during_run');self.assertTrue(data['recoveryVerified'])
        self.assertEqual((self.root/'platform/lib/Service/GithubBridgeCore.php').read_text(),'<?php // concurrent editor')
        self.assertFalse((self.root/'platform/lib/Service/GithubSyncProjectAdapter.php').exists())
        self.assertEqual((self.root/'platform/lib/Service/GithubBridgeService.php').read_text(),self.original['GithubBridgeService.php'])

    def test_changed_backup_prevents_rollback(self):
        first,_=self.run_bundle();backup=self.root/'data/novaspace_connector_backups'/first['backupId']
        (backup/'GithubBridgeCore.php').write_text('corrupt backup')
        data,result=self.run_bundle(first['backupId']);self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_rollback_backup_hash_invalid');self.assert_after()

    def test_later_user_edit_prevents_rollback(self):
        first,_=self.run_bundle();path=self.root/'platform/lib/Service/GithubBridgeCore.php';path.write_text('<?php // later user edit')
        data,result=self.run_bundle(first['backupId']);self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_rollback_target_changed');self.assertEqual(path.read_text(),'<?php // later user edit')

    def test_rollback_path_traversal_is_rejected(self):
        data,result=self.run_bundle('../other');self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_rollback_id_invalid');self.assert_before()

    def test_installer_lock_prevents_parallel_run(self):
        backup=self.root/'data/novaspace_connector_backups';backup.mkdir()
        with (backup/'sync-guard-install.lock').open('w') as handle:
            fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
            data,result=self.run_bundle();self.assertNotEqual(result.returncode,0);self.assertEqual(data['code'],'ns_installer_busy')
        self.assert_before()

if __name__=='__main__':unittest.main(verbosity=2)
