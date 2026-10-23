#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
import hashlib,json,re,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
inventories=[]
for folder in ['nextcloud-local-candidate','topics-candidate']:
 p=root/folder;lock=json.loads((p/'package-lock.json').read_text());rows=[]
 for relative,data in lock['packages'].items():
  if not relative:continue
  row={'lockPath':relative,**{k:data[k] for k in ['version','license','resolved','integrity','dev','optional'] if k in data}}
  source=p/relative;notices=[]
  if (source/'package.json').is_file():
   meta=json.loads((source/'package.json').read_text());row.update(name=meta.get('name'),repository=meta.get('repository'),installed=True)
   for f in source.iterdir():
    if f.is_file() and re.match(r'^(license|licence|notice|copying)(?:[. -]|$)',f.name,re.I):
     target=p/'THIRD_PARTY_LICENSES'/re.sub('[^A-Za-z0-9._-]+','_',relative)/f.name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,target)
     notices.append({'path':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
  row['noticeFiles']=notices;rows.append(row)
 inventories.append({'component':folder,'lockSha256':hashlib.sha256((p/'package-lock.json').read_bytes()).hexdigest(),'packages':rows})
(root/'DEPENDENCIES.json').write_text(json.dumps({'schemaVersion':1,'date':'2026-10-23','scope':'Locked source-build dependencies; optional platform packages in a lock are not all installed or shipped. No node_modules or compiled bundles are in the source archive.','inventories':inventories},indent=2)+'\n')
(root/'THIRD_PARTY_NOTICES.md').write_text('''# Fremdsoftware

Die eigenen Nextcloud-Komponenten stehen unter AGPL-3.0-or-later. Übernommene Lizenztexte bleiben unverändert in den jeweiligen THIRD_PARTY_LICENSES-Verzeichnissen. SDK-/Bibliotheksquellen und generierte Bündel sind nicht Bestandteil dieses öffentlichen Quellarchivs; der gesperrte Aufbau bezieht sie separat.

| Bestandteil | Gesperrte Version | Eigene Upstream-Lizenz |
|---|---|---|
| LM Studio SDK | 1.5.0 | Apache-2.0 |
| LM Studio lms-isomorphic | 0.4.6 | Apache-2.0 |
| Model Context Protocol Server | 2.0.0 | MIT |
| Model Context Protocol Client | 2.3.1 | MIT |
| ical.js | 2.2.1 | MPL-2.0 |
| fast-xml-parser | 5.11.1 | MIT |
| zod | 4.2.1 / SDK-intern 3.25.76 | MIT |
| zod-to-json-schema | 3.25.2 | ISC |
| esbuild | Kern 0.28.0 / Themen 0.25.12 | MIT |

Die vollständigen Paketquellen, Integritätswerte, weiteren Abhängigkeiten und Hinweise stehen in [DEPENDENCIES.json](DEPENDENCIES.json). Die ursprünglichen Fremdhinweise aus dem erhaltenen ZIP sind zusätzlich erhalten. Upstream-Quellen: [LM Studio](https://github.com/lmstudio-ai/lmstudio.js), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [ical.js](https://github.com/kewisch/ical.js). Die reine Nennung eines gesperrten Pakets beweist nicht seine Aufnahme in ein erzeugtes Bündel.

Der ältere Python-DPAPI-Startweg `nextcloud-mcp-connector` 0.1.13 ist eine externe historische Voraussetzung. Sein konkretes Quellpaket, seine vollständigen Abhängigkeiten und Lizenz sind noch nicht aus einem passenden Originalpaket verifiziert; sie werden nicht durch die Lizenz dieses Repositories ersetzt oder stillschweigend mitlizenziert. Siehe BUILD.md.
''')
print(json.dumps({'lockEntries':[len(x['packages']) for x in inventories],'noticeFiles':sum(len(r['noticeFiles']) for x in inventories for r in x['packages'])}))
