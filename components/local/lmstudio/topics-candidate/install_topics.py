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
VERSION = '0.1.19'
REVISION = 19
CURRENT_CORE = '1.36.0-local.1'
CORE_PINS = {
    'start_local.py': 'cd0c5200270820cd5424017cb5625ff9d4f3755a447d05f0ca5ab495e1434d75',
    'dist/nextcloud-local.cjs': 'bb8ad0642eb4b3815c13a9f001f79a298281be8799041c031382f701d940970e',
}
PREVIOUS_0118_SHA256 = '2edb2f3659619cdef67ed4afd14ff87d04d1e710b1bbc291036f8239dde90d42'
PREVIOUS_0117_SHA256 = 'c47c9ef82df96a3ff3f3b078d32a67bec2cbef41cba40c7e1ef763d48e307d7a'
PREVIOUS_0116_SHA256 = '33559054dcd515b43d45ca3b277eac7a8afd20f556256e3f29a5552731a238e3'
PREVIOUS_0115_SHA256 = '83e26908496309bd74ce2f8c287fe500ea1e881170ad5978a57e9a09b2761af9'
PREVIOUS_0114_SHA256 = 'b879201bdaf854a0a3a623cd49b38ae2007b1954c521992bba9a22375b29307b'
PREVIOUS_BUNDLE_SHA256 = '4aaf93a7354e0f255f8e000385f91fe22e1548f866b0e74a6a1243a1e4e8f4f7'
PREVIOUS_012_SHA256 = '2aea3686e32840c757ef7dbe8ee6bf23d9b87087a81abadc076788caaa84b267'
PREVIOUS_0113_SHA256 = 'dcbeb7f87cf0837c2bfd02d75ffed2141da8802601e7aed223e61748e14797a8'
PREVIOUS_0112_SHA256 = 'ec79d8257e60981aa5632c41aa136743aa7a19c5ac9b24a4fe63549baa0105bd'
PREVIOUS_0111_SHA256 = 'f08566ea19b26801c786d0215b3a849c1fc9bd1fd215562145e37d616f3d8dfe'
PREVIOUS_0110_SHA256 = 'a798c657137931ae6ef685f6e6dad320c1401fee449cb6b73ebe9c604be27e4a'
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
    previous_hash={'0.1.0':PREVIOUS_BUNDLE_SHA256,'0.1.1':PREVIOUS_011_SHA256,'0.1.2':PREVIOUS_012_SHA256,'0.1.3':PREVIOUS_013_SHA256,'0.1.4':PREVIOUS_014_SHA256,'0.1.5':PREVIOUS_015_SHA256,'0.1.6':PREVIOUS_016_SHA256,'0.1.7':PREVIOUS_017_SHA256,'0.1.8':PREVIOUS_018_SHA256,'0.1.9':PREVIOUS_019_SHA256,'0.1.10':PREVIOUS_0110_SHA256,'0.1.11':PREVIOUS_0111_SHA256,'0.1.12':PREVIOUS_0112_SHA256,'0.1.13':PREVIOUS_0113_SHA256,'0.1.14':PREVIOUS_0114_SHA256,'0.1.15':PREVIOUS_0115_SHA256,'0.1.16':PREVIOUS_0116_SHA256,'0.1.17':PREVIOUS_0117_SHA256,'0.1.18':PREVIOUS_0118_SHA256}.get(package.get('version'))
    if manifest.get('owner') != 'novaforge' or manifest.get('name') != 'themenauswahl' or not previous_hash or hashlib.sha256(bundle.read_bytes()).hexdigest() != previous_hash:
        raise RuntimeError('Vorhandene Themenauswahl entspricht keinem geprüften Vorgänger bis 0.1.18. Nicht überschrieben.')
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
    if receipt.get('version') not in {'1.21.0-local.1','1.22.0-local.1','1.25.2-local.1','1.26.0-local.1','1.27.0-local.1','1.28.0-local.1','1.29.0-local.1','1.30.0-local.1','1.31.0-local.1','1.32.0-local.1','1.35.0-local.1','1.35.1-local.1','1.36.0-local.1'} or receipt.get('installedEntry') != entry:
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


def checked_current_source(mcp_bytes, expected_user):
    receipt = verified_source(mcp_bytes, expected_user)
    if receipt.get('version') != CURRENT_CORE:
        raise RuntimeError('Gefundener Kern ' + str(receipt.get('version')) + '; benötigt wird ' + CURRENT_CORE + '. Nichts installiert. Ausgabe zuerst zurückgeben.')
    entry = json.loads(mcp_bytes.decode('utf-8-sig'))['mcpServers'][SOURCE_ENTRY]
    root = next(Path(p).parent for p in entry['args'] if p.endswith('start_local.py'))
    for name, digest in CORE_PINS.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Persönlicher Kern weicht von der geprüften 1.36.0-Lieferung ab. Nichts installiert.')
    return receipt


def already_current(target, root):
    if not target.exists() and not target.is_symlink():
        return False
    if target.is_symlink():
        raise RuntimeError('Plugin-Ziel ist ein Verweis. Nicht automatisch geändert.')
    package = json.loads((target / 'package.json').read_text(encoding='utf-8'))
    if package.get('version') != VERSION:
        return False
    manifest = json.loads((target / 'manifest.json').read_text(encoding='utf-8'))
    expected_manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if any(manifest.get(key) != value for key, value in expected_manifest.items()) or (target / 'plugin.cjs').read_bytes() != (root / 'plugin.cjs').read_bytes():
        raise RuntimeError('Gleich bezeichnete Themenauswahl weicht vom Paket ab. Nicht überschrieben.')
    return True


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
    parser.add_argument('--expected-user', default='Soul', choices=['Soul','ExampleUser'])
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if os.name != 'nt':
        raise RuntimeError('Dieses Installationsskript ist für die vorhandene Windows-Installation.')
    root = Path(__file__).resolve().parent
    verify_package(root)
    home = Path.home() / '.lmstudio'
    mcp_path = home / 'mcp.json'
    before = mcp_path.read_bytes()
    source = checked_current_source(before, args.expected_user)
    target = home / 'extensions' / 'plugins' / 'novaforge' / 'themenauswahl'
    print('OK: Tatsächlicher persönlicher Kern', source['version'], 'für', args.expected_user, 'an geprüfter Programmdatei bestätigt.')
    print('OK: calendar_read_scheduling ist im bestätigten Kern enthalten; in der Themenauswahl Kalender einschalten.')
    if already_current(target, root):
        print('OK: Themenauswahl 0.1.19 bereits paketgleich vorhanden. Nichts installiert.')
        return
    cli = locate_lms(home)
    updating = verified_previous_plugin(target)
    print('OK: Paket 0.1.19 und bestehende Themenauswahl geprüft.')
    if args.check:
        print('OK: Installationsweg vorhanden. Nur Bestand geprüft; nichts installiert.')
        return
    if mcp_path.read_bytes() != before:
        raise RuntimeError('MCP-Konfiguration wurde parallel geändert. Nichts installiert.')
    if updating:
        backup = Path(os.environ['LOCALAPPDATA']) / 'NOVAFORGE' / 'Sicherungen' / ('themenauswahl-vor-0119-' + datetime.now().strftime('%Y%m%d_%H%M%S_%f'))
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
    if package.get('version') != VERSION or installed.get('revision') != REVISION or installed.get('owner') != 'novaforge' or installed.get('name') != 'themenauswahl' or not bundle.is_file() or bundle.read_bytes() != (root / 'plugin.cjs').read_bytes():
        raise RuntimeError('Installiertes Plugin nicht bestätigt. Bestand prüfen; Installation nicht wiederholen.')
    print('OK: Themenauswahl 0.1.19 lokal installiert; Dateiauswahl per Referenz und Mindmap-Bindungen eingerichtet. Persönlicher Kern, Rechte und MCP-Einträge unverändert.')
    print('LM Studio: im neuen Chat novaforge/themenauswahl aktivieren und Themen kombinieren.')
    print('Den alten Anschluss als Einrichtung behalten, im Chat aber nicht zusätzlich auswählen.')
    print('Offen: sichtbare Schalter, kombinierter Werkzeugaufruf, Bilddarstellung und tatsächliche Prompt-Laufzeit prüfen.')


if __name__ == '__main__':
    if __import__('os').environ.get('NOVASPACE_ENABLE_HISTORICAL_INSTALLERS') != 'I_REVIEWED_THE_SOURCE':
        raise SystemExit('STOP: Historical installer disabled. Read BUILD.md; no configuration accessed.')
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('ABBRUCH:', message, file=sys.stderr)
        raise SystemExit(2) from None
