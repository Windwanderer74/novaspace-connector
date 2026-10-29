# SPDX-License-Identifier: AGPL-3.0-or-later
"""Coordinate a checked, account-preserving update of the existing Windows pilot."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

def verify_package(root):
    manifest = json.loads((root / 'SHA256SUMS.json').read_text(encoding='utf-8'))
    for relative, digest in manifest.items():
        path = (root / relative).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Paketpruefung fehlgeschlagen. Nichts installiert.')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-user', required=True, choices=['Soul', 'ExampleUser'])
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--enable-file-sharing', action='store_true', help='Zusaetzlich bewusst Dateifreigaben verwalten erlauben')
    parser.add_argument('--enable-calendar-management', action='store_true', help='Ganze eigene Kalender gezielt verwalten und Originale nativ wiederherstellen erlauben')
    parser.add_argument('--enable-calendar-sharing', action='store_true', help='Direkte eigene lokale Kalenderfreigaben bewusst erlauben')
    parser.add_argument('--enable-calendar-organizer', action='store_true', help='Eigene Einladungen und Organisatoraktionen bewusst erlauben')
    parser.add_argument('--enable-calendar-replies', action='store_true', help='Eigene Kalenderantworten bewusst uebermitteln erlauben')
    parser.add_argument('--enable-contact-sharing', action='store_true', help='Eigene Adressbuchfreigaben bewusst erlauben')
    parser.add_argument('--enable-contact-management', action='store_true', help='Gesamte eigene Adressbuecher dauerhaft entfernen erlauben')
    parser.add_argument('--enable-deck-trash', action='store_true', help='Ausgewaehlte Deckkarten/Listen bewusst im nativen Papierkorb verwalten')
    parser.add_argument('--enable-deck-sharing', action='store_true', help='Boardfreigaben bewusst verwalten erlauben')
    parser.add_argument('--enable-file-trash', action='store_true', help='Zusaetzlich bewusst Papierkorbverwaltung erlauben')
    parser.add_argument('--enable-notes', action='store_true', help='Native Notizen bewusst lesen und bearbeiten erlauben')
    parser.add_argument('--enable-planning', action='store_true', help='Notizen, Aufgaben und Kontakte bewusst lesen und bearbeiten erlauben')
    args = parser.parse_args()
    if os.name != 'nt':
        raise RuntimeError('Dieses Update benoetigt den vorhandenen Windows-Anschluss.')
    root = Path(__file__).resolve().parent
    verify_package(root)
    topics = root / 'topics-candidate' / 'install_topics.py'
    core = root / 'nextcloud-local-candidate' / 'install.py'
    common = ['--expected-user', args.expected_user]
    core_scopes = ['--enable-scope', 'files:share'] if args.enable_file_sharing else []
    if args.enable_calendar_management: core_scopes += ['--enable-scope', 'calendar:manage']
    if args.enable_calendar_sharing: core_scopes += ['--enable-scope', 'calendar:share']
    if args.enable_calendar_organizer: core_scopes += ['--enable-scope', 'calendar:organize']
    if args.enable_calendar_replies: core_scopes += ['--enable-scope', 'calendar:schedule']
    if args.enable_contact_sharing: core_scopes += ['--enable-scope', 'contacts:share']
    if args.enable_contact_management: core_scopes += ['--enable-scope', 'contacts:manage']
    if args.enable_deck_trash: core_scopes += ['--enable-scope', 'deck:trash']
    if args.enable_deck_sharing: core_scopes += ['--enable-scope', 'deck:share']
    if args.enable_file_trash: core_scopes += ['--enable-scope', 'files:trash']
    if args.enable_notes: core_scopes += ['--enable-scope', 'notes:read', '--enable-scope', 'notes:write']
    if args.enable_planning:
        for area in ['notes','tasks','contacts']:
            for mode in ['read','write']:
                if area+':'+mode not in core_scopes: core_scopes += ['--enable-scope',area+':'+mode]
    calls = [
        [sys.executable, str(topics), *common, '--check'],
        [sys.executable, str(core), *common, *core_scopes, '--check'],
    ]
    for command in calls:
        subprocess.run(command, check=True, timeout=120)
    if not args.install:
        print('OK: Beide Vorpruefungen bestanden. Kein Update installiert.')
        return
    # The new selection remains compatible with the old core if the second step fails.
    subprocess.run([sys.executable, str(topics), *common], check=True, timeout=240)
    subprocess.run([sys.executable, str(core), *common, *core_scopes], check=True, timeout=240)
    print('OK: Themenauswahl 0.1.14 und persoenlicher MCP-Kern 1.36.0-local.1 eingetragen.')
    print('Bisherige Freigaben erhalten. Zusaetzlich files:share bewusst freigegeben.' if args.enable_file_sharing else 'Vorhandene Freigaben unveraendert; Dateifreigabeaenderungen nicht neu erlaubt.')
    if args.enable_calendar_management: print('Zusaetzlich calendar:manage bewusst freigegeben; native Inhalts-/Zugriffs-/Rueckweggrenzen gelten.')
    if args.enable_calendar_sharing: print('Zusaetzlich calendar:share bewusst freigegeben; keine Kalenderfreigabe automatisch angelegt.')
    if args.enable_calendar_organizer: print('Zusaetzlich calendar:organize bewusst freigegeben; Kalender-Lese-/Schreibrechte nicht automatisch ergaenzt.')
    if args.enable_calendar_replies: print('Zusaetzlich calendar:schedule bewusst freigegeben.')
    if args.enable_deck_sharing: print('Zusaetzlich deck:share bewusst freigegeben.')
    if args.enable_file_trash: print('Zusaetzlich files:trash bewusst freigegeben.')
    if args.enable_planning: print('Zusaetzlich notes:read/write, tasks:read/write und contacts:read/write bewusst freigegeben.')
    elif args.enable_notes: print('Zusaetzlich notes:read/write bewusst freigegeben.')
    print('Persoenlicher Zugang erhalten; keine Zugangsdaten ausgegeben.')
    print('Naechster Schritt: LM Studio neu starten; neuer Chat mit novaforge/themenauswahl.')
    print('Im neuen Chat nextcloud_account, nextcloud_capabilities und novaspace_connector_help lesen.')
    print('Erwartetes Konto:', args.expected_user)

if __name__ == '__main__':
    if __import__('os').environ.get('NOVASPACE_ENABLE_HISTORICAL_INSTALLERS') != 'I_REVIEWED_THE_SOURCE':
        raise SystemExit('STOP: Historical installer disabled. Read BUILD.md; no configuration accessed.')
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('STOPP:', message, file=sys.stderr)
        print('Nicht blind erneut installieren. Aktiver alter Anschluss bleibt bis zur erfolgreichen Kernpruefung erhalten.', file=sys.stderr)
        raise SystemExit(2) from None
