# SPDX-License-Identifier: AGPL-3.0-or-later
from pathlib import Path
import json,hashlib,base64
root=Path(__file__).resolve().parent.parent
src=root/'ops/intake-bridge';pilot=root/'ops/tables-pilot-bridge'
old={p:hashlib.sha256((pilot/p).read_bytes()).hexdigest() for p in ['lib/Service/PilotWriteService.php','lib/Controller/PilotController.php','appinfo/routes.php','appinfo/info.xml']}
old['lib/Controller/TablesController.php']=json.loads((pilot/'original-manifest.json').read_text())['lib/Controller/TablesController.php']
payload={p:(src/p).read_text() for p in ['lib/Service/RegisterWriteService.php','lib/Controller/RegisterController.php','appinfo/routes.php','appinfo/info.xml']}
helpers=(pilot/'installer-template.php').read_text();helpers=helpers[helpers.index('function nfHttpAssert'):helpers.index('$original=')]
s=(src/'installer-template.php').read_text()
for marker,value in {'__INSTALL_HELPERS__':helpers,'__OLD_MANIFEST__':json.dumps(old),'__NEW_PAYLOAD__':json.dumps(payload,ensure_ascii=False),'__FIXTURE_BASE64__':base64.b64encode((root/'tests/fixtures/intake-pages.pdf').read_bytes()).decode()}.items():
 assert s.count(marker)==1;s=s.replace(marker,value)
(root/'ops/intake-install-test-0.2.1.php').write_text(s)
print('Packaged intake bridge installer/test 0.2.1 (bridge 0.2.0)',hashlib.sha256(s.encode()).hexdigest())
