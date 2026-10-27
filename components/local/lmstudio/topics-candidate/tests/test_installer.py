# SPDX-License-Identifier: AGPL-3.0-or-later
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('topics',Path(__file__).resolve().parents[1]/'install_topics.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        (self.root/'start_local.py').write_text('test',encoding='utf-8')
        self.entry={'command':'python.exe','args':['-u',str(self.root/'start_local.py')],'env':{'unchanged':'test'}}
        self.receipt={'version':'1.21.0-local.1','installedEntry':self.entry,'expectedUser':'Soul'}
        self.local={'baseUrl':'https://cloud.example.invalid','expectedUser':'Soul'}
        self.write()
        self.mcp=json.dumps({'mcpServers':{module.SOURCE_ENTRY:self.entry,'other':{'command':'keep'}}}).encode()
    def tearDown(self):
        self.temp.cleanup()
    def write(self):
        for name,value in [('installation.json',self.receipt),('local.json',self.local)]:
            (self.root/name).write_text(json.dumps(value),encoding='utf-8')
    def test_valid_source_read_does_not_mutate_configuration(self):
        self.assertEqual(module.verified_source(self.mcp,'Soul')['version'],'1.21.0-local.1')
        self.assertEqual(json.loads(self.mcp)['mcpServers']['other']['command'],'keep')
    def test_account_cannot_be_substituted(self):
        with self.assertRaises(RuntimeError):module.verified_source(self.mcp,'ExampleUser')
    def test_changed_entry_and_old_version_rejected(self):
        for change in [{'version':'1.7.1-local.1'},{'installedEntry':{}}]:
            old=dict(self.receipt);self.receipt.update(change);self.write()
            with self.assertRaises(RuntimeError):module.verified_source(self.mcp,'Soul')
            self.receipt=old
    def test_foreign_host_rejected(self):
        self.local['baseUrl']='https://example.invalid';self.write()
        with self.assertRaises(RuntimeError):module.verified_source(self.mcp,'Soul')
    def test_package_integrity_and_path_escape(self):
        import hashlib
        (self.root/'file').write_bytes(b'valid')
        (self.root/'SHA256SUMS.json').write_text(json.dumps({'file':hashlib.sha256(b'valid').hexdigest()}))
        module.verify_package(self.root)
        (self.root/'file').write_bytes(b'changed')
        with self.assertRaises(RuntimeError):module.verify_package(self.root)
        (self.root/'SHA256SUMS.json').write_text(json.dumps({'../outside':'x'}))
        with self.assertRaises(RuntimeError):module.verify_package(self.root)
    def test_existing_cli_preferred(self):
        (self.root/'bin').mkdir();(self.root/'bin'/'lms.exe').write_bytes(b'fixture')
        with patch.object(module.shutil,'which',return_value=None):
            self.assertEqual(module.locate_lms(self.root),str(self.root/'bin'/'lms.exe'))
    def test_only_confirmed_previous_plugin_can_be_updated(self):
        target=self.root/'plugin'
        self.assertFalse(module.verified_previous_plugin(target))
        target.mkdir()
        (target/'manifest.json').write_text(json.dumps({'owner':'novaforge','name':'themenauswahl'}))
        (target/'package.json').write_text(json.dumps({'version':'0.1.0'}))
        (target/'plugin.cjs').write_bytes(b'fixture')
        import hashlib
        with patch.object(module,'PREVIOUS_BUNDLE_SHA256',hashlib.sha256(b'fixture').hexdigest()):
            self.assertTrue(module.verified_previous_plugin(target))
            (target/'plugin.cjs').write_bytes(b'changed')
            with self.assertRaises(RuntimeError):module.verified_previous_plugin(target)

    def test_new_core_receipt_keeps_the_same_expected_user(self):
        self.receipt['version']='1.22.0-local.1';self.write()
        self.assertEqual(module.verified_source(self.mcp,'Soul')['version'],'1.22.0-local.1')
        with self.assertRaises(RuntimeError):module.verified_source(self.mcp,'ExampleUser')

    def test_actual_012_bundle_pin_is_supported(self):
        import hashlib
        target=self.root/'plugin';target.mkdir()
        (target/'manifest.json').write_text(json.dumps({'owner':'novaforge','name':'themenauswahl'}))
        (target/'package.json').write_text(json.dumps({'version':'0.1.2'}))
        (target/'plugin.cjs').write_bytes(b'fixture-012')
        with patch.object(module,'PREVIOUS_012_SHA256',hashlib.sha256(b'fixture-012').hexdigest()):
            self.assertTrue(module.verified_previous_plugin(target))
            (target/'package.json').write_text(json.dumps({'version':'0.1.3'}))
            with self.assertRaises(RuntimeError):module.verified_previous_plugin(target)


if __name__=='__main__':unittest.main()
