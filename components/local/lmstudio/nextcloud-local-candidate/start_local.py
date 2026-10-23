# SPDX-License-Identifier: AGPL-3.0-or-later
"""Reuse the existing 0.1.13 DPAPI launcher without copying its protected secret."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent
    config = json.loads((root / 'local.json').read_text(encoding='utf-8'))
    launcher = Path(config['legacyLauncher'])
    if hashlib.sha256(launcher.read_bytes()).hexdigest() != config['legacyLauncherSha256']:
        raise RuntimeError('Alter Startweg wurde geändert; vor Fortsetzung prüfen.')
    if os.name != 'nt':
        raise RuntimeError('Der vorhandene DPAPI-Zugang benötigt Windows.')
    check = '--check' in sys.argv
    # These variables must come from the existing protected launcher, never from
    # a model argument or a stale inherited environment.
    for key in ('NC_MCP_URL', 'NC_MCP_USER', 'NC_MCP_APP_PASSWORD'):
        os.environ.pop(key, None)
    from mcp_connector import entry_stdio
    called = False

    def launch_local():
        nonlocal called
        called = True
        env = os.environ.copy()
        for key in list(env):
            if key.startswith('NEXTCLOUD_') or key.startswith('OAUTH_') or key == 'NODE_OPTIONS':
                env.pop(key, None)
        if env.get('NC_MCP_USER') != config['expectedUser']:
            raise RuntimeError('Lokale Kontokennung stimmt nicht überein.')
        args = [config['nodePath'], str(root / 'dist' / 'nextcloud-local.cjs'), str(root / 'local.json')]
        if check:
            args.append('--check')
        # Inherit OS stdin/stdout for MCP, despite redirecting Python diagnostic prints.
        result = subprocess.run(args, env=env, stdin=None, stdout=None, stderr=None, timeout=90 if check else None)
        raise SystemExit(result.returncode)

    entry_stdio.main = launch_local
    sys.argv = [str(launcher)]
    try:
        with contextlib.redirect_stdout(sys.stderr):
            runpy.run_path(str(launcher), run_name='__main__')
    except SystemExit:
        if not called:
            raise RuntimeError('Alter Launcher endete ohne Start der Erweiterung.') from None
        raise
    if not called:
        raise RuntimeError('Vorhandener Launcher hat den erwarteten Einstieg nicht aufgerufen.')


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        print('Start abgebrochen. Laufzeit, ursprünglichen Launcher und eigenen DPAPI-Zugang prüfen. Keine Zugangsdaten ausgeben.', file=sys.stderr)
        raise SystemExit(2) from None
