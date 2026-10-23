# SPDX-License-Identifier: AGPL-3.0-or-later
"""Install the independent selection plugin through LM Studio's own CLI."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

PLUGIN_ID = 'novaforge/themenauswahl'
SOURCE_ENTRY = 'nextcloud-pilot-next2'
PREVIOUS_BUNDLE_SHA256 = '4aaf93a7354e0f255f8e000385f91fe22e1548f866b0e74a6a1243a1e4e8f4f7'
PREVIOUS_012_SHA256 = '2aea3686e32840c757ef7dbe8ee6bf23d9b87087a81abadc076788caaa84b267'
PREVIOUS_019_SHA256 = '067d14c46b3d581ddb0ad98366b260c0dfa5c5f3fa49411decbf522ac67aa48f'
PREVIOUS_018_SHA256 = '4a96922f754b14a2f4790740ffbd6230b401dc6a9f3ed394fa221d0ac37927ae'
PREVIOUS_017_SHA256 = '328fce457a48c681369d66f0c1999668ffae001c4a93d415ccc10b8661f44d95'
PREVIOUS_016_SHA256 = '8571d4c90384815da32219e665272aea8bcf68c8ca3954febf17d165a66e1284'
PREVIOUS_015_SHA256 = 'a560c1c35d0458d9c3b95d74a455830b4e75de9375cf5c22717056f5202489a0'
PREVIOUS_014_SHA256 = '46e9c57ed36eaedef25b4274dec2fde3a8375b197ae9e902e7da52ef67fedefe'
PREVIOUS_013_SHA256 = '294136a4f5341fdc568797ec1c430b358c63b4637c185ecc1c1838ef363fee4a'
PREVIOUS_011_SHA256 = 'bde6f07691e7c33833baca72223a53b80eeead9e895a7807151bd3e23f38b5dd'


def verified_previous_plugin(target):
    if not target.exists() and not target.is_symlink():
        return False
    if target.is_symlink():
        raise RuntimeError('Plugin-Ziel ist ein Verweis. Nicht automatisch geändert.')
    manifest = json.loads((target / 'manifest.json').read_text(encoding='utf-8'))
    package = json.loads((target / 'package.json').read_text(encoding='utf-8'))
    bundle = target / 'plugin.cjs'
    previous_hash={'0.1.0':PREVIOUS_BUNDLE_SHA256,'0.1.1':PREVIOUS_011_SHA256,'0.1.2':PREVIOUS_012_SHA256,'0.1.3':PREVIOUS_013_SHA256,'0.1.4':PREVIOUS_014_SHA256,'0.1.5':PREVIOUS_015_SHA256,'0.1.6':PREVIOUS_016_SHA256,'0.1.7':PREVIOUS_017_SHA256,'0.1.8':PREVIOUS_018_SHA256,'0.1.9':PREVIOUS_019_SHA256}.get(package.get('version'))
    if manifest.get('owner') != 'novaforge' or manifest.get('name') != 'themenauswahl' or not previous_hash or hashlib.sha256(bundle.read_bytes()).hexdigest() != previous_hash:
        raise RuntimeError('Vorhandenes Plugin weicht vom bestätigten Pilot 0.1.0/0.1.1/0.1.2/0.1.3/0.1.4 ab. Nicht überschrieben.')
    return True


def verified_source(mcp_bytes, expected_user):
    config = json.loads(mcp_bytes.decode('utf-8-sig'))
    entry = config.get('mcpServers', {}).get(SOURCE_ENTRY)
    if not isinstance(entry, dict):
        raise RuntimeError('Vorhandener Nextcloud-Anschluss fehlt.')
    scripts = [Path(p) for p in entry.get('args', []) if isinstance(p, str) and p.endswith('start_local.py')]
    if len(scripts) != 1 or not scripts[0].is_file():
        raise RuntimeError('Aktiver lokaler Startweg muss zuerst geprüft werden.')
    receipt = json.loads((scripts[0].parent / 'installation.json').read_text(encoding='utf-8'))
    local = json.loads((scripts[0].parent / 'local.json').read_text(encoding='utf-8'))
    if receipt.get('version') not in {'1.21.0-local.1','1.22.0-local.1','1.25.2-local.1','1.26.0-local.1','1.27.0-local.1','1.28.0-local.1','1.29.0-local.1','1.30.0-local.1','1.31.0-local.1'} or receipt.get('installedEntry') != entry:
        raise RuntimeError('Dieser Pilot setzt den bestätigten Anschluss 1.21.0/1.22.0/1.25.2-local.1 voraus.')
    if local.get('expectedUser') != expected_user or receipt.get('expectedUser') != expected_user:
        raise RuntimeError('Kontozuordnung weicht vom gewählten Konto ab.')
    if local.get('baseUrl') != 'https://cloud.example.invalid':
        raise RuntimeError('Vorhandenes Ziel weicht vom bestätigten Bestand ab.')
    return receipt


def verify_package(root):
    manifest = json.loads((root / 'SHA256SUMS.json').read_text(encoding='utf-8'))
    for relative, digest in manifest.items():
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Paket-Prüfsumme stimmt nicht. Nichts installiert.')


def locate_lms(home):
    for name in ('lms.exe', 'lms.cmd', 'lms'):
        candidate = home / 'bin' / name
        if candidate.is_file():
            return str(candidate)
    found = shutil.which('lms')
    if found:
        return found
    raise RuntimeError('LM-Studio-CLI lms fehlt. In LM Studio die CLI aktivieren; kein Fremdprogramm wurde installiert.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-user', default='Soul', choices=['Soul','OtherUser'])
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if os.name != 'nt':
        raise RuntimeError('Dieses Installationsskript ist für die vorhandene Windows-Installation.')
    root = Path(__file__).resolve().parent
    verify_package(root)
    home = Path.home() / '.lmstudio'
    mcp_path = home / 'mcp.json'
    before = mcp_path.read_bytes()
    verified_source(before, args.expected_user)
    cli = locate_lms(home)
    target = home / 'extensions' / 'plugins' / 'novaforge' / 'themenauswahl'
    updating = verified_previous_plugin(target)
    print('OK: Paket und bestehender Anschluss 1.30.0/1.31.0-local.1 für', args.expected_user, 'geprüft.')
    if args.check:
        print('OK: Installationsweg vorhanden. Nur Bestand geprüft; nichts installiert.')
        return
    if mcp_path.read_bytes() != before:
        raise RuntimeError('MCP-Konfiguration wurde parallel geändert. Nichts installiert.')
    if updating:
        backup = Path(os.environ['LOCALAPPDATA']) / 'NOVAFORGE' / 'Sicherungen' / ('themenauswahl-vor-0110-' + datetime.now().strftime('%Y%m%d_%H%M%S_%f'))
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(target, backup, symlinks=True)
        if (backup / 'plugin.cjs').read_bytes() != (target / 'plugin.cjs').read_bytes():
            raise RuntimeError('Plugin-Sicherung nicht bestätigt; Update nicht gestartet.')
        if not verified_previous_plugin(target) or mcp_path.read_bytes() != before:
            raise RuntimeError('Plugin oder MCP-Konfiguration parallel verändert. Update nicht gestartet.')
        print('OK: bestätigter vorheriger Pilot gesichert:', backup)
    # This is a local install, never lms push or a Hub publication. The official
    # SDK and its dependencies are vendored, but remain separate modules so the
    # bootstrap and configuration share a single SDK class instance.
    subprocess.run([cli, 'dev', '--install', '--yes'], cwd=root, check=True, timeout=180)
    if mcp_path.read_bytes() != before:
        raise RuntimeError('CLI beendet, aber MCP-Konfiguration wurde parallel verändert. Bestand zuerst prüfen; Installation nicht wiederholen.')
    if not (target / 'manifest.json').is_file():
        raise RuntimeError('CLI beendet, aber Plugin-Ziel nicht bestätigt. Plugin-Liste prüfen; Installation nicht wiederholen.')
    installed = json.loads((target / 'manifest.json').read_text(encoding='utf-8'))
    bundle = target / 'plugin.cjs'
    package = json.loads((target / 'package.json').read_text(encoding='utf-8'))
    if package.get('version') != '0.1.10' or installed.get('revision') != 10 or installed.get('owner') != 'novaforge' or installed.get('name') != 'themenauswahl' or not bundle.is_file() or bundle.read_bytes() != (root / 'plugin.cjs').read_bytes():
        raise RuntimeError('Installiertes Plugin nicht bestätigt. Bestand prüfen; Installation nicht wiederholen.')
    print('OK: Themenauswahl 0.1.10 lokal installiert; vorhandene MCP-Einträge unverändert.')
    print('LM Studio: im neuen Chat novaforge/themenauswahl aktivieren und Themen kombinieren.')
    print('Den alten Anschluss als Einrichtung behalten, im Chat aber nicht zusätzlich auswählen.')
    print('Offen: sichtbare Schalter, kombinierter Werkzeugaufruf, Bilddarstellung und tatsächliche Prompt-Laufzeit prüfen.')


if __name__ == '__main__':
    if os.environ.get('NOVASPACE_ENABLE_HISTORICAL_INSTALLERS') != 'I_REVIEWED_THE_SOURCE':
        print('STOP: Historical update only. Read BUILD.md; no installation started.', file=sys.stderr)
        raise SystemExit(78)
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('ABBRUCH:', message, file=sys.stderr)
        raise SystemExit(2) from None
