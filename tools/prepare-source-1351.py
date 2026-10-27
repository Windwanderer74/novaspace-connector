#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Apply the reviewed 1.35 publication rules to the pinned 1.35.1 correction.

This only prepares public source. It neither installs nor publishes anything.
The preceding helper remains unchanged as the reproducible 1.35.0 baseline.
"""
from pathlib import Path

helper = Path(__file__).with_name('prepare-source-135.py')
source = helper.read_text()

def change(old, new, count=None):
    global source
    found = source.count(old)
    if not found or count is not None and found != count:
        raise RuntimeError('Publication helper baseline differs: ' + old[:100])
    source = source.replace(old, new)

change('b1dc8a5389a01ba21deb73f6857f03b06774081a', '96e68f12cdfc9ea9482cd646983fbdd5f809f2b7', 1)
change('8b6936a5ad072864efda2ce3ebc3a26f5607ee2c5c2417b04f2ec8af0aa8c5e5', '9733d3ca988e8bc398b57a42b959e8acfaca47923e0b1e40e41e3c6211511d9d', 1)
change('1.35.0', '1.35.1')
change('0.1.12', '0.1.13')
change(".replace('workflow 1.5.0.','workflow 1.6.1.')", ".replace('workflow 1.6.1.','workflow 1.6.2.')", 1)
change("'nextcloud-local-candidate/src','topics-candidate/source'", "'nextcloud-local-candidate/src','nextcloud-local-candidate/browser','topics-candidate/source'", 1)
change("layer/'project-connector-manifest.json'", "layer/'project-empty-goals-manifest.json'", 1)
change("raise RuntimeError('Native app is not exact 0.2.12')", "raise RuntimeError('Native app is not exact 0.2.13')", 1)
change("(project,'native-projects','0.2.12')", "(project,'native-projects','0.2.13')", 1)

insertion = '''copy(project,layer/'update-0.2.13/appinfo/info.xml','update-0.2.13/appinfo/info.xml')
f=project/'tests/project-connector-entry.test.mjs'
s=f.read_text()
start=s.index("test('Candidate keeps the prior version metadata")
s=s[:start]+s[start:].replace("update-0.2.12", "update-0.2.13").replace("update-0.2.11", "update-0.2.12").replace("<version>0.2.12</version>", "<version>0.2.13</version>").replace("<version>0.2.11</version>", "<version>0.2.12</version>")
f.write_text(s)
'''
change('refresh_hashes(online);refresh_hashes(local);refresh_hashes(project)', insertion + '\nrefresh_hashes(online);refresh_hashes(local);refresh_hashes(project)', 1)
exec(compile(source, str(helper), 'exec'), {'__name__': '__main__', '__file__': str(helper)})
