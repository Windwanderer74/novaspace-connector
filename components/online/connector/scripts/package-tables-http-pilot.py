#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Build a deterministic CLI payload from reviewed source files, without network I/O."""
from pathlib import Path
import json
root = Path(__file__).resolve().parent.parent
source = root / 'ops/tables-pilot-bridge'
paths = ['lib/Service/PilotWriteService.php','lib/Controller/PilotController.php','appinfo/routes.php','appinfo/info.xml']
payload = {p:(source/p).read_text() for p in paths}
template = (source/'installer-template.php').read_text()
assert template.count('__OLD_MANIFEST__') == template.count('__NEW_PAYLOAD__') == 1
installer = template.replace('__OLD_MANIFEST__',(source/'original-manifest.json').read_text().strip()).replace('__NEW_PAYLOAD__',json.dumps(payload,ensure_ascii=False))
(root/'ops/tables-pilot-http-install-0.1.2.php').write_text(installer)
print('Packaged Tables HTTP pilot installer 0.1.2 (bridge 0.1.1)')
