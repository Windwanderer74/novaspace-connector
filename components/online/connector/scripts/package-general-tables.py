# SPDX-License-Identifier: AGPL-3.0-or-later
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent.parent
oldroot=root/'ops/intake-bridge';newroot=root/'ops/general-tables-bridge';pilot=root/'ops/tables-pilot-bridge'
old={p:hashlib.sha256((oldroot/p).read_bytes()).hexdigest() for p in ['lib/Service/RegisterWriteService.php','lib/Controller/RegisterController.php','appinfo/routes.php','appinfo/info.xml']}
for p in ['lib/Service/PilotWriteService.php','lib/Controller/PilotController.php']:old[p]=hashlib.sha256((pilot/p).read_bytes()).hexdigest()
old['lib/Controller/TablesController.php']=json.loads((pilot/'original-manifest.json').read_text())['lib/Controller/TablesController.php']
routes=(oldroot/'appinfo/routes.php').read_text().replace(']];'," ['name'=>'general#status','url'=>'/api/v1/general/status','verb'=>'GET'],\n ['name'=>'general#structure','url'=>'/api/v1/general/tables/{tableId}/structure','verb'=>'GET'],\n ['name'=>'general#row','url'=>'/api/v1/general/tables/{tableId}/rows/{rowId}/version','verb'=>'GET'],\n ['name'=>'general#operation','url'=>'/api/v1/general/operations/{requestId}','verb'=>'GET'],\n ['name'=>'general#write','url'=>'/api/v1/general/write','verb'=>'POST'],\n]];")
info=(oldroot/'appinfo/info.xml').read_text().replace('<version>0.2.0</version>','<version>0.3.0</version>').replace('no arbitrary Tables writes or public shares.','General native Tables creation, columns, conditional row updates and personal Soul visibility; atomic request IDs. No deletion or public sharing.')
(newroot/'appinfo').mkdir(exist_ok=True);(newroot/'appinfo/routes.php').write_text(routes);(newroot/'appinfo/info.xml').write_text(info)
payload={p:(newroot/p).read_text() for p in ['lib/Service/GeneralWriteService.php','lib/Controller/GeneralController.php','appinfo/routes.php','appinfo/info.xml']}
base=(root/'ops/intake-install-test-0.2.1.php').read_text();helpers=base[base.index('function nfHttpAssert'):base.index('function nfRecord')]
s=(newroot/'installer-template.php').read_text()
for marker,value in {'__HELPERS__':helpers,'__OLD_MANIFEST__':json.dumps(old),'__NEW_PAYLOAD__':json.dumps(payload,ensure_ascii=False)}.items():assert s.count(marker)==1;s=s.replace(marker,value)
out=root/'ops/general-tables-install-test-0.3.0.php';out.write_text(s);print('Packaged general Tables bridge',hashlib.sha256(s.encode()).hexdigest())
