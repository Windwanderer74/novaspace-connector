# SPDX-License-Identifier: AGPL-3.0-or-later
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cleanup_installer', Path(__file__).resolve().parents[1] / 'install_topics.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
digest = lambda value: hashlib.sha256(value).hexdigest()


class CleanupIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / 'package'
        self.home = self.root / 'home'
        self.core = self.root / 'core'
        self.target = self.home / '.lmstudio/extensions/plugins/novaforge/themenauswahl'
        for p in [self.package, self.target, self.core / 'dist', self.home / '.lmstudio/bin']:
            p.mkdir(parents=True)
        self.entry = {'command': 'python.exe', 'args': ['-u', str(self.core / 'start_local.py')], 'env': {'KEEP': 'fixture'}}
        self.receipt = {'version': api.CURRENT_CORE, 'expectedUser': 'Soul', 'installedEntry': self.entry}
        self.local = {'baseUrl': 'https://cloud.example.invalid', 'expectedUser': 'Soul', 'scopes': ['calendar:read', 'calendar:write', 'calendar:organize']}
        self.old = b'previous plugin fixture'
        self.new = b'new plugin fixture'
        self.mcp = self.home / '.lmstudio/mcp.json'
        self.mcp.write_text(json.dumps({'mcpServers': {api.SOURCE_ENTRY: self.entry, 'other': {'command': 'keep'}}}))
        self.before = self.mcp.read_bytes()
        self.pins = {}
        for name in api.CORE_PINS:
            contents = ('fixture ' + name).encode()
            (self.core / name).write_bytes(contents)
            self.pins[name] = digest(contents)
        self.write_core()
        self.write_plugin(self.target, '0.1.14', 14, self.old)
        self.write_plugin(self.package, api.VERSION, api.REVISION, self.new)
        (self.package / 'SHA256SUMS.json').write_text(json.dumps({p.name: digest(p.read_bytes()) for p in self.package.iterdir()}))
        (self.home / '.lmstudio/bin/lms.exe').write_bytes(b'CLI fixture')
        self.commands = []

    def write_core(self):
        (self.core / 'installation.json').write_text(json.dumps(self.receipt))
        (self.core / 'local.json').write_text(json.dumps(self.local))

    @staticmethod
    def write_plugin(root, version, revision, bundle):
        (root / 'package.json').write_text(json.dumps({'version': version}))
        (root / 'manifest.json').write_text(json.dumps({'type': 'plugin', 'runner': 'node', 'owner': 'novaforge', 'name': 'themenauswahl', 'revision': revision}))
        (root / 'plugin.cjs').write_bytes(bundle)

    def invoke(self, *options, mutate_mcp=False):
        def cli(command, **kwargs):
            self.commands.append(command)
            for name in ['package.json', 'manifest.json', 'plugin.cjs']:
                shutil.copyfile(self.package / name, self.target / name)
            if mutate_mcp:
                self.mcp.write_bytes(b'parallel fixture change')
        output = io.StringIO()
        with patch.object(api, '__file__', str(self.package / 'install_topics.py')), \
             patch.object(api.Path, 'home', return_value=self.home), \
             patch.object(api, 'os', SimpleNamespace(name='nt', environ={'LOCALAPPDATA': str(self.root / 'appdata')})), \
             patch.object(api, 'CORE_PINS', self.pins), \
             patch.object(api, 'PREVIOUS_0114_SHA256', digest(self.old)), \
             patch.object(api.sys, 'argv', ['install_topics.py', *options]), \
             patch.object(api.subprocess, 'run', side_effect=cli), contextlib.redirect_stdout(output):
            api.main()
        return output.getvalue()

    def test_check_is_read_only_and_reports_actual_core(self):
        text = self.invoke('--check')
        self.assertIn(api.CURRENT_CORE, text)
        self.assertIn('calendar_read_scheduling', text)
        self.assertEqual(self.commands, [])
        self.assertEqual((self.target / 'plugin.cjs').read_bytes(), self.old)
        self.assertEqual(self.mcp.read_bytes(), self.before)
        self.assertFalse((self.root / 'appdata').exists())

    def test_install_backs_up_and_preserves_core_grants_and_all_mcp_entries(self):
        before_core = {p.name: p.read_bytes() for p in self.core.iterdir() if p.is_file()}
        self.invoke()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual(self.commands[0][1:], ['dev', '--install', '--yes'])
        self.assertEqual((self.target / 'plugin.cjs').read_bytes(), self.new)
        backups = list((self.root / 'appdata/NOVAFORGE/Sicherungen').glob('themenauswahl-vor-0117-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'plugin.cjs').read_bytes(), self.old)
        self.assertEqual(self.mcp.read_bytes(), self.before)
        self.assertEqual({p.name: p.read_bytes() for p in self.core.iterdir() if p.is_file()}, before_core)

    def test_identical_repeat_never_installs_again(self):
        self.invoke()
        self.assertIn('bereits paketgleich', self.invoke())
        self.assertEqual(len(self.commands), 1)

    def test_confirmed_0115_upgrades_with_backup_and_existing_organizer_grant(self):
        self.write_plugin(self.target, '0.1.15', 15, self.old)
        before = (self.core / 'local.json').read_bytes()
        with patch.object(api, 'PREVIOUS_0115_SHA256', digest(self.old)):
            self.invoke()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual((self.core / 'local.json').read_bytes(), before)
        backups = list((self.root / 'appdata/NOVAFORGE/Sicherungen').glob('themenauswahl-vor-0117-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'plugin.cjs').read_bytes(), self.old)

    def test_changed_0115_stops_before_backup_and_cli(self):
        self.write_plugin(self.target, '0.1.15', 15, b'unknown changed bundle')
        with self.assertRaisesRegex(RuntimeError, 'keinem geprüften Vorgänger'):
            self.invoke()
        self.assertEqual(self.commands, [])
        self.assertFalse((self.root / 'appdata').exists())

    def test_confirmed_0116_upgrades_and_keeps_organizer_grant(self):
        self.write_plugin(self.target, '0.1.16', 16, self.old)
        before = (self.core / 'local.json').read_bytes()
        with patch.object(api, 'PREVIOUS_0116_SHA256', digest(self.old)):
            self.invoke()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual((self.core / 'local.json').read_bytes(), before)
        backups = list((self.root / 'appdata/NOVAFORGE/Sicherungen').glob('themenauswahl-vor-0117-*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / 'plugin.cjs').read_bytes(), self.old)

    def test_changed_0116_stops_before_backup_and_cli(self):
        self.write_plugin(self.target, '0.1.16', 16, b'unknown changed 0116 bundle')
        with self.assertRaisesRegex(RuntimeError, 'keinem geprüften Vorgänger'):
            self.invoke()
        self.assertEqual(self.commands, [])
        self.assertFalse((self.root / 'appdata').exists())

    def test_old_core_stops_before_backup_or_cli(self):
        self.receipt['version'] = '1.35.1-local.1'
        self.write_core()
        with self.assertRaisesRegex(RuntimeError, 'Gefundener Kern'):
            self.invoke()
        self.assertEqual(self.commands, [])
        self.assertFalse((self.root / 'appdata').exists())

    def test_changed_core_stops_before_backup_or_cli(self):
        (self.core / 'dist/nextcloud-local.cjs').write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'weicht von der geprüften'):
            self.invoke()
        self.assertEqual(self.commands, [])
        self.assertEqual(self.mcp.read_bytes(), self.before)

    def test_changed_same_version_is_never_overwritten(self):
        self.write_plugin(self.target, api.VERSION, api.REVISION, b'unknown')
        with self.assertRaisesRegex(RuntimeError, 'Gleich bezeichnete'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_parallel_configuration_change_is_reported_after_one_cli_call(self):
        with self.assertRaisesRegex(RuntimeError, 'parallel verändert'):
            self.invoke(mutate_mcp=True)
        self.assertEqual(len(self.commands), 1)


if __name__ == '__main__':
    unittest.main()
