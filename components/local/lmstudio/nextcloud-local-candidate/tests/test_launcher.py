# SPDX-License-Identifier: AGPL-3.0-or-later
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launcher', Path(__file__).parents[1] / 'start_local.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def run_fixture(self, text, user='Soul', expected_code=0):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            old = root / 'start_nextcloud.py'
            old.write_text(text, encoding='utf-8')
            config = {'legacyLauncher':str(old),'legacyLauncherSha256':hashlib.sha256(old.read_bytes()).hexdigest(),'expectedUser':user,'nodePath':'node'}
            (root/'local.json').write_text(json.dumps(config),encoding='utf-8')
            package = types.ModuleType('mcp_connector')
            entry = types.ModuleType('mcp_connector.entry_stdio')
            package.entry_stdio=entry
            with patch.object(launcher,'__file__',str(root/'start_local.py')), patch.object(launcher,'os',types.SimpleNamespace(name='nt',environ=os.environ)), patch.dict(sys.modules,{'mcp_connector':package,'mcp_connector.entry_stdio':entry}), patch.dict(os.environ,{'NODE_OPTIONS':'untrusted','NC_MCP_USER':'stale'},clear=True), patch.object(sys,'argv',['start_local.py','--check']), patch.object(launcher.subprocess,'run',return_value=types.SimpleNamespace(returncode=0)) as run:
                if expected_code is None:
                    with self.assertRaises(RuntimeError): launcher.main()
                    run.assert_not_called()
                else:
                    with self.assertRaises(SystemExit) as result: launcher.main()
                    self.assertEqual(result.exception.code,expected_code)
                    self.assertEqual(run.call_args.kwargs['env']['NC_MCP_USER'],'Soul')
                    self.assertNotIn('NODE_OPTIONS',run.call_args.kwargs['env'])
                    self.assertEqual(run.call_args.args[0][-1],'--check')
            self.assertEqual(old.read_text(),text)

    def test_reuses_legacy_launcher_and_transfers_secret_only_in_child_environment(self):
        self.run_fixture('import os\nos.environ.update(NC_MCP_URL="https://cloud.example.invalid",NC_MCP_USER="Soul",NC_MCP_APP_PASSWORD="fixture-only")\nfrom mcp_connector.entry_stdio import main\nmain()\n')

    def test_legacy_exit_without_handoff_is_not_false_success(self):
        self.run_fixture('raise SystemExit(0)\n',expected_code=None)

    def test_wrong_account_stops_before_child_start(self):
        self.run_fixture('import os\nos.environ["NC_MCP_USER"]="ExampleUser"\nfrom mcp_connector.entry_stdio import main\nmain()\n',expected_code=None)


if __name__ == '__main__': unittest.main()
