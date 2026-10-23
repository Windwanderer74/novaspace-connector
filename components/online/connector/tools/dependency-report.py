#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Record locked dependencies and notices for direct/build/browser inputs."""
import hashlib, json, re, shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
lock = json.loads((root / 'package-lock.json').read_text())
package = json.loads((root / 'package.json').read_text())
browser = json.loads((root / '.sites-runtime/browser-build-inputs.json').read_text())
observed = {}
for name in browser['inputs']:
    if not name.startswith('node_modules/'):
        continue
    path = (root / name).parent
    while path != root and not (path / 'package.json').is_file():
        path = path.parent
    if path == root:
        raise SystemExit('No package identity: ' + name)
    observed[str(path.relative_to(root))] = path

roles = {}
for group, label in [('dependencies', 'direct dependency'), ('devDependencies', 'direct build dependency')]:
    for name in package.get(group, {}):
        roles.setdefault('node_modules/' + name, []).append(label)
for path in observed:
    roles.setdefault(path, []).append('observed browser build input')

notices = []
for relative, labels in sorted(roles.items()):
    path = root / relative
    metadata = json.loads((path / 'package.json').read_text())
    destination = 'THIRD_PARTY_LICENSES/' + re.sub(r'[^A-Za-z0-9._-]+', '_', relative.removeprefix('node_modules/'))
    texts = []
    candidates = list(path.iterdir())
    if (path/'dist').is_dir():
        candidates += list((path/'dist').iterdir())
    for source in sorted(candidates):
        if source.is_file() and re.search(r'(?:license|licence|copying|notice|copyright)(?:[. -]|$)', source.name, re.I):
            target = root / destination / source.relative_to(path)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            texts.append({'path': str(target.relative_to(root)), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    notices.append({'package': metadata['name'], 'version': metadata['version'], 'license': metadata.get('license'),
                    'lockPath': relative, 'roles': labels, 'repository': metadata.get('repository'),
                    'sourceTarball': lock['packages'].get(relative, {}).get('resolved'), 'licenseFiles': texts})

inventory = [{'path': k, **{x: v[x] for x in ['version','license','resolved','integrity','dev','optional'] if x in v}}
             for k, v in sorted(lock['packages'].items()) if k]
result = {'schemaVersion': 1, 'date': '2026-10-23', 'scope': 'Lock inventory is not a shipped-module claim. Browser inputs were observed in the actual esbuild metafile. Direct dependencies/build tools are recorded separately; Worker tree-shaking is not exhaustively classified.',
          'packageLockSha256': hashlib.sha256((root/'package-lock.json').read_bytes()).hexdigest(),
          'lockedPackages': inventory, 'noticePackages': notices,
          'browserOwnInputs': sorted(x for x in browser['inputs'] if not x.startswith('node_modules/')),
          'browserMetafileSha256': hashlib.sha256((root/'.sites-runtime/browser-build-inputs.json').read_bytes()).hexdigest()}
(root/'DEPENDENCIES.json').write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n')
rows = '\n'.join('| '+x['package']+' | '+x['version']+' | '+str(x['license'])+' | '+', '.join(x['roles'])+' | '+(', '.join('['+Path(f['path']).name+']('+f['path']+')' for f in x['licenseFiles']) or 'Siehe Paketquelle')+' |' for x in notices)
text = '''# Fremdsoftware und Lizenzhinweise

Die eigenen veröffentlichten Nextcloud-Dateien stehen unter AGPL-3.0-or-later. Fremdsoftware behält die nachstehend erfassten Bedingungen; ihre Texte und Copyright-Hinweise werden nicht durch die eigene Lizenz ersetzt.

Das Quellarchiv enthält keine `node_modules`, keine kompilierten Worker-/Browser-Bündel und keine von Dritten kopierten Bibliotheksquellen. Der Aufbau lädt die integritätsgebundenen Pakete aus dem Lockfile. Die hier mitgelieferten Lizenz-/Notice-Dateien stammen unverändert aus den installierten Paketen. Ein später weitergegebenes Binär-/Browser-Paket muss auch die Hinweise seiner tatsächlich enthaltenen weiteren Module erhalten; die gesamte Lockliste ist kein Beleg, dass jedes Paket ausgeliefert wird.

Die Browser-Paketierung wurde ausgeführt. Sie verwendet `@nextcloud/files` und mehrere weitere (A)GPL-Nextcloud-Bibliotheken. Vierzehn eigene Browser-/gemeinsame Quellen sind in demselben Baugraph enthalten. Die Veröffentlichung dieser eigenen zusammengehörigen Quellen unter AGPL ist die gewählte Projektzuordnung; daraus wird keine pauschale Aussage abgeleitet, dass jede API-Nutzung von Nextcloud rechtlich dieselbe Lizenz erzwingt. In der Online-Anwendung werden einige dieser eigenen Kerne ebenfalls verwendet. Eine separate proprietäre Ausgabe dieses gemeinsamen Codes wird hier nicht zugesagt.

`ical.js` 2.2.1 bleibt MPL-2.0; die unveränderte Bibliothek wird über das gesperrte Paket bezogen. Ihre Quelle ist im verlinkten Upstream-Repository verfügbar. DOMPurify bietet MPL-2.0 **oder** Apache-2.0 an; die Wahlmöglichkeit bleibt erhalten. Die Python-PDF-Hilfe setzt externe PDF-Werkzeuge voraus und bündelt diese nicht. Die historische PDF-Reparatur lädt smalot/pdfparser separat nach; siehe LEGACY_OPS.md.

| Paket | Version | Lizenz laut Paket | Erfasster Einsatz | Unveränderte Hinweise |
|---|---|---|---|---|
'''+rows+'''

Die vollständige, datei-/versionsgebundene Inventarliste mit Paketquellen und Integritätswerten steht in [DEPENDENCIES.json](DEPENDENCIES.json). Sie unterscheidet direkte Werkzeuge und tatsächlich beobachtete Browser-Baueingaben. Die genaue vom Worker nach Tree-Shaking verwendete Fremdmodulliste ist damit nicht vollständig nachgewiesen. `tools/dependency-report.py` erzeugt den Bericht nach `npm ci` und `npm run build:browser` erneut.
'''
(root/'THIRD_PARTY_NOTICES.md').write_text(text)
print(json.dumps({'lockedPackages': len(inventory), 'noticePackages': len(notices), 'noticeFiles': sum(len(x['licenseFiles']) for x in notices), 'browserPackages': len(observed)}))
