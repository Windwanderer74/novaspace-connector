# SPDX-License-Identifier: AGPL-3.0-or-later
from pathlib import Path
import base64, hashlib, json

root = Path(__file__).resolve().parent
before = {
    'GithubSyncProjectAdapter.php': None,
    'GithubBridgeCore.php': '27907145aebc2fd3957e0241598161215f831bc5e9d6735e57257a3f595be29b',
    'GithubBridgeService.php': '0bca526649042babb950f6d4025bad5396d81588c7a9ed0b350025c359db2d2a',
}
files = {}
for name, old in before.items():
    text = (root / 'bridge' / name).read_text()
    files[name] = {'text': text, 'beforeSha256': old, 'afterSha256': hashlib.sha256(text.encode()).hexdigest()}
payload = {
    'files': files,
    'tests': {name: (root / 'tests' / name).read_text() for name in ['legacy-bridge-core.php','bridge-results.php']},
    'upstreamSha256': {name: hashlib.sha256((root / 'upstream/lib/Service' / name).read_bytes()).hexdigest()
                       for name in ['SyncService.php','DeckService.php','GithubProjectService.php']},
}
template = (root / 'install-template.php').read_text()
assert template.count('__PAYLOAD__') == 1
encoded = base64.b64encode(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()).decode()
bundle = template.replace('__PAYLOAD__', encoded)
target = root / 'NovaSpace_GitHub_Sync_Bridge_0_1_1_Installer.php.txt'
target.write_text(bundle)
manifest = {'kind':'novaspace-sync-bridge-0.1.1','installerSha256':hashlib.sha256(bundle.encode()).hexdigest(),
            'installerBytes':len(bundle.encode()),'files':{name:{k:v for k,v in entry.items() if k!='text'} for name,entry in files.items()},
            'upstreamSha256':payload['upstreamSha256']}
(root/'INSTALL_SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'path':str(target),'bytes':manifest['installerBytes'],'sha256':manifest['installerSha256']}))
