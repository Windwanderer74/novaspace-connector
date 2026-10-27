# SPDX-License-Identifier: AGPL-3.0-or-later
"""Install only the local successor entry; preserve all unrelated MCP entries."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

VERSION = '1.35.0-local.1'
ENTRY = 'nextcloud-pilot-next2'
ALL_SCOPES = ['deck:write','calendar:write','files:write','files:organize','files:pdfread','files:download','tables:read','tables:write','inventory:write','files:share','deck:share','deck:trash','calendar:schedule','files:trash','notes:write','tasks:write','contacts:write','contacts:share','contacts:manage']
GROUPS = ['deck','files','calendar','tables','mindmap','communication','inventory','notes','tasks','contacts']
READ_SCOPES = ['deck:read','calendar:read','files:read','nextcloud:read','talk:read','mail:read','announcements:read','inventory:read','notes:read','tasks:read','contacts:read']

def is_windows():
    return os.name == 'nt'


def previous_local_config(old, expected_user):
    args = old.get('args', [])
    scripts = [Path(p) for p in args if isinstance(p, str) and p.endswith('start_local.py')]
    if len(scripts) != 1 or not scripts[0].is_file():
        raise RuntimeError('Dieses Update benötigt den belegten bisherigen lokalen Anschluss 1.32.0-local.1.')
    previous = scripts[0].resolve().parent
    receipt = json.loads((previous / 'installation.json').read_text(encoding='utf-8'))
    config = json.loads((previous / 'local.json').read_text(encoding='utf-8'))
    if receipt.get('version') not in {'1.32.0-local.1'} or receipt.get('installedEntry') != old:
        raise RuntimeError('Aktiver Eintrag weicht vom bestätigten Vorzustand ab. Nichts umgestellt.')
    if config.get('expectedUser') != expected_user or receipt.get('expectedUser') != expected_user or config.get('baseUrl') != 'https://cloud.example.invalid':
        raise RuntimeError('Vorhandener Anschluss gehört nicht zum erwarteten Konto/Ziel.')
    pins = {'start_local.py': 'cd0c5200270820cd5424017cb5625ff9d4f3755a447d05f0ca5ab495e1434d75', 'dist/nextcloud-local.cjs': 'a34fde297a36262091a8d6c6cec7e331eabab1141b36bd7b9d5284c32b3096b7'}
    if any(hashlib.sha256((previous/name).read_bytes()).hexdigest() != digest for name,digest in pins.items()):
        raise RuntimeError('Aktiver 1.32-Programmstand wurde verändert. Nichts umgestellt.')
    scopes = config.get('scopes')
    if not isinstance(scopes, list) or not set(READ_SCOPES + ALL_SCOPES).issuperset(scopes) or not {'calendar:read', 'files:read'}.issubset(scopes):
        raise RuntimeError('Vorhandene lokale Freigaben zuerst prüfen; nicht erweitert.')
    launcher = Path(config['legacyLauncher'])
    if hashlib.sha256(launcher.read_bytes()).hexdigest() != config['legacyLauncherSha256']:
        raise RuntimeError('Ursprünglicher DPAPI-Launcher wurde verändert.')
    return config


def upgraded_scopes(previous, additions, predecessor_version):
    result = list(previous)
    return list(dict.fromkeys(result + additions))


def atomic_write(path, data):
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def updated_config(original, replacement):
    result = json.loads(original.decode('utf-8-sig'))
    if ENTRY not in result.get('mcpServers', {}):
        raise ValueError('Erwartete bestehende Verbindung fehlt.')
    result['mcpServers'][ENTRY] = replacement
    return json.dumps(result, ensure_ascii=False, indent=2).encode('utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-user', required=True, choices=['Soul','ExampleUser'])
    parser.add_argument('--restore', action='store_true')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--enable-scope', action='append', choices=[s for s in READ_SCOPES + ALL_SCOPES if s != 'tables:write'], default=[])
    parser.add_argument('--groups', nargs='+', choices=GROUPS)
    args = parser.parse_args()
    if not is_windows():
        raise RuntimeError('Dieses Paket ist für die vorhandene Windows-Installation.')
    root = Path(__file__).resolve().parent
    config_path = Path.home() / '.lmstudio' / 'mcp.json'
    target = Path(os.environ['LOCALAPPDATA']) / 'NOVAFORGE' / 'Programme' / ('nextcloud-local-' + VERSION)
    original = config_path.read_bytes()
    config = json.loads(original.decode('utf-8-sig'))
    old = config.get('mcpServers', {}).get(ENTRY)
    if not isinstance(old, dict):
        raise RuntimeError('Bestehender nextcloud-pilot-next2-Eintrag fehlt.')
    if args.restore:
        receipt = json.loads((target / 'installation.json').read_text(encoding='utf-8'))
        if old != receipt['installedEntry']:
            raise RuntimeError('Eintrag inzwischen verändert; keine automatische Rücksetzung.')
        restored = updated_config(original, receipt['previousEntry'])
        if config_path.read_bytes() != original:
            raise RuntimeError('Konfiguration parallel geändert.')
        atomic_write(config_path, restored)
        if config_path.read_bytes() != restored:
            raise RuntimeError('Rücklesen der Rücksetzung fehlgeschlagen.')
        print('OK: vorheriger Connector-Eintrag wiederhergestellt. Andere Einträge erhalten.')
        return

    if target.exists():
        raise RuntimeError('Ziel existiert bereits. Bestehenden Stand prüfen; nicht überschrieben.')
    manifest = json.loads((root / 'SHA256SUMS.json').read_text(encoding='utf-8'))
    for relative, digest in manifest.items():
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Paketprüfung fehlgeschlagen.')
    python = Path(old.get('command',''))
    previous = previous_local_config(old, args.expected_user)
    if not python.is_file():
        raise RuntimeError('Bestehender Startweg weicht vom dokumentierten Bestand ab. Zuerst prüfen.')
    launcher = Path(previous['legacyLauncher']).resolve()
    code = 'import importlib.metadata; print(importlib.metadata.version("nextcloud-mcp-connector"))'
    version = subprocess.run([str(python),'-c',code],capture_output=True,text=True,check=True).stdout.strip()
    if version != '0.1.13':
        raise RuntimeError('Bestehende Paketversion ist nicht 0.1.13. Zuerst abgleichen.')
    node = shutil.which('node')
    if not node:
        fallback = Path(os.environ.get('ProgramFiles',r'C:\Program Files')) / 'nodejs' / 'node.exe'
        node = str(fallback) if fallback.is_file() else None
    if not node:
        raise RuntimeError('Node.js nicht gefunden. Keine automatische Neuinstallation.')
    node_version = subprocess.run([node,'--version'],capture_output=True,text=True,check=True).stdout.strip()
    if int(node_version.lstrip('v').split('.')[0]) < 22:
        raise RuntimeError('Node.js 22 oder neuer erforderlich; vorhandene Version zu alt.')
    # Existing grants preserved; only explicitly requested additions.
    previous_script = next(Path(p) for p in old['args'] if isinstance(p,str) and p.endswith('start_local.py'))
    predecessor_version = json.loads((previous_script.parent / 'installation.json').read_text(encoding='utf-8'))['version']
    scopes = upgraded_scopes(previous['scopes'], args.enable_scope, predecessor_version)
    groups = args.groups if args.groups is not None else previous.get('groups', GROUPS)
    if any(s.startswith('inventory:') for s in args.enable_scope) and args.groups is None:
        groups = list(dict.fromkeys(groups + ['inventory']))
    if args.check:
        print('OK: Paket, bisheriger eigener Anschluss, Freigaben, Python und Node geprueft. Nichts installiert.')
        return
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copytree(root,target,ignore=shutil.ignore_patterns('node_modules','.git','.sites-runtime','__pycache__'))
    if args.groups is None:
        for area in ['notes','tasks','contacts']:
            if any(x.startswith(area+':') for x in args.enable_scope): groups = list(dict.fromkeys(groups + [area]))
    local_config = {'baseUrl':'https://cloud.example.invalid','expectedUser':args.expected_user,'scopes':scopes,'groups':groups,'legacyLauncher':str(launcher),'legacyLauncherSha256':hashlib.sha256(launcher.read_bytes()).hexdigest(),'nodePath':str(Path(node).resolve())}
    atomic_write(target / 'local.json',json.dumps(local_config,ensure_ascii=False,indent=2).encode('utf-8'))
    # Read-only authentication check BEFORE changing mcp.json. Failed check leaves
    # a diagnostic package directory but the active old connector untouched.
    subprocess.run([str(python),str(target / 'start_local.py'),'--check'],check=True,timeout=100)
    replacement = dict(old)
    replacement['command'] = str(python)
    replacement['args'] = ['-u',str(target / 'start_local.py')]
    replacement['env'] = dict(old.get('env',{}))
    replacement['env']['NC_MCP_TALK_SEND'] = 'false'
    replacement['env']['PYTHONUTF8'] = '1'
    updated = updated_config(original,replacement)
    backup_dir = target.parent.parent / 'Sicherungen'
    backup_dir.mkdir(exist_ok=True)
    backup = backup_dir / ('mcp-vor-local-1320-' + datetime.now().strftime('%Y%m%d_%H%M%S_%f') + '.json')
    with backup.open('xb') as out:
        out.write(original)
    receipt = {'version':VERSION,'previousEntry':old,'installedEntry':replacement,'backupPath':str(backup),'expectedUser':args.expected_user}
    atomic_write(target / 'installation.json',json.dumps(receipt,ensure_ascii=False,indent=2).encode('utf-8'))
    if config_path.read_bytes() != original:
        raise RuntimeError('Konfiguration parallel geändert. Sicherung vorhanden, aktive Datei unverändert.')
    atomic_write(config_path,updated)
    if config_path.read_bytes() != updated:
        raise RuntimeError('Konfiguration nicht bestätigt. Sicherung prüfen.')
    print('OK: lokales Update eingetragen; übrige MCP-Verbindungen erhalten. LM Studio neu laden.')
    print('Konto:',args.expected_user,'; Funktionsstand:',VERSION,'; Sicherung:',backup)


if __name__ == '__main__':
    if __import__('os').environ.get('NOVASPACE_ENABLE_HISTORICAL_INSTALLERS') != 'I_REVIEWED_THE_SOURCE':
        raise SystemExit('STOP: Historical installer disabled. Read BUILD.md; no configuration accessed.')
    try:
        main()
    except Exception as exc:
        # Do not print subprocess output or JSON/credential values.
        print('ABBRUCH:',str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__,file=sys.stderr)
        raise SystemExit(2) from None
