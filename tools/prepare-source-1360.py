#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Refresh selected public source inputs from the pinned 1.36 / topics 0.1.17 checkpoints.

This is a source-publication helper, never a runtime installer or deployment.
Call from a clean checkout of the preceding public snapshot. No credentials read.
"""
import argparse, hashlib, json, re, shutil, subprocess
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--source',type=Path,required=True)
p.add_argument('--personal',type=Path,required=True)
p.add_argument('--topics',type=Path,required=True)
p.add_argument('--redactions',type=Path,required=True)
a=p.parse_args(); root=Path(__file__).resolve().parents[1]
src=a.source.resolve(); personal=a.personal.resolve(); topics=a.topics.resolve()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=src,text=True).strip()
if commit!='e2fd91539d4ba5855646f18eefd06e03609a957a':raise RuntimeError('Unexpected source checkpoint')
if subprocess.check_output(['git','status','--porcelain'],cwd=src,text=True).strip():raise RuntimeError('Source checkpoint is dirty')
original_archive='d3926b1c47f90a6407b3d84af85f72a2b412b4a2ff3173df16180594f7d54f02'
for name,h in json.loads((personal/'SHA256SUMS.json').read_text()).items():
 f=(personal/name).resolve()
 if not f.is_relative_to(personal) or not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=h:raise RuntimeError('Personal source differs: '+name)
online=root/'components/online/connector'; local=root/'components/local/lmstudio'
project=root/'components/nextcloud/projects'
def digest(data):return hashlib.sha256(data).hexdigest()
def jwrite(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def clean(text):
 replacements=json.loads(a.redactions.read_text())
 for old,new in replacements.items():text=text.replace(old,new)
 text=re.sub(r'https://cloud\.example\.invalid/index\.php/apps/intravox/#page-[a-f0-9-]+',
             'https://docs.example.invalid/guides/deck',text)
 return text
def notice(path,text):
 if 'SPDX-License-Identifier:' in text[:220]:return text
 ext=Path(path).suffix
 if ext in {'.ts','.tsx','.js','.mjs','.cjs','.mts','.ps1'}:return '// SPDX-License-Identifier: AGPL-3.0-or-later\n'+text if ext!='.ps1' else '# SPDX-License-Identifier: AGPL-3.0-or-later\n'+text
 if ext=='.php':return text.replace('<?php','<?php\n// SPDX-License-Identifier: AGPL-3.0-or-later',1)
 if ext in {'.py','.sh'}:
  if text.startswith('#!'):
   first,rest=text.split('\n',1);return first+'\n# SPDX-License-Identifier: AGPL-3.0-or-later\n'+rest
  return '# SPDX-License-Identifier: AGPL-3.0-or-later\n'+text
 if ext=='.css':return '/* SPDX-License-Identifier: AGPL-3.0-or-later */\n'+text
 return text
records={}
def copy(base,source,target,original_label=None):
 data=source.read_bytes(); changes=[]
 try:text=data.decode('utf-8')
 except UnicodeDecodeError:out=data
 else:
  revised=clean(text)
  if revised!=text:changes.append('Reserved host/contact/secondary-account examples replace installation values')
  revised=notice(target,revised)
  if revised!=clean(text):changes.append('Own-code SPDX notice; existing third-party notices retained')
  out=revised.encode()
 dest=base/target;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(out)
 records.setdefault(base,[]).append({'path':target,'sourcePath':original_label or str(source.relative_to(src) if source.is_relative_to(src) else source.relative_to(personal)),
   'sourceSha256':digest(data),'publishedSha256':digest(out),'changes':changes,'license':'Unchanged upstream license; see the retained license file' if 'THIRD_PARTY_LICENSES/' in target else 'AGPL-3.0-or-later'})
def refresh_hashes(base):
 for r in records[base]:r['publishedSha256']=digest((base/r['path']).read_bytes())

# Preserve reviewed build/packaging/configuration helpers from the earlier public edition.
old=json.loads((online/'SOURCE_PROVENANCE.json').read_text())
if old.get('version')!='1.35.1':raise RuntimeError('Use a clean 1.35.1 public baseline')
overrides={'.gitignore','package.json','package-lock.json','scripts/build-browser-workflow.mjs','scripts/build-verified.sh','scripts/install-ci.sh','scripts/sites-env.sh'}
paths={r['sourcePath'] for r in old['files'] if r['path'] not in overrides}
for folder in ['app','lib','browser']:
 paths.update(str(f.relative_to(src)) for f in (src/folder).rglob('*') if f.is_file() and f.suffix in {'.ts','.tsx','.css','.svg','.mts'})
for f in (src/'tests').glob('*.test.mjs'):
 text=f.read_text()
 # Native fixture tests have their own component below; hosted-instance installers remain separate.
 if '@php-wasm/' not in text and 'ops/project-capsules' not in text and 'ops/github-bridge' not in text:
  paths.add(str(f.relative_to(src)))
for name in sorted(paths):
 if (src/name).is_file():copy(online,src/name,name)
f=online/'tests/nextcloud-read.test.mjs';s=f.read_text().replace('tools.length,195','tools.length,211').replace('map(t=>t.name)).size,195','map(t=>t.name)).size,211');f.write_text(s)
f=online/'tests/talk-read.test.mjs';f.write_text(f.read_text().replace("connectorVersion,'1.33.2'","connectorVersion,'1.36.0'"))
legacy=['ops/general-tables-install-test-0.3.0.php','ops/intake-install-test-0.2.1.php','ops/pdf-bridge-repair-0.1.1.php','ops/register-share-soul-0.1.0.php','ops/tables-http-test-0.1.0.php','ops/tables-pilot-http-install-0.1.2.php','ops/tables-read-bridge-install-0.1.0.php','ops/tables-write-pilot-0.1.1.php']
for name in legacy:
 f=online/name;s=f.read_text();position=s.index('declare(strict_types=1);')+len('declare(strict_types=1);') if 'declare(strict_types=1);'in s else s.index('\n',s.index('<?php'))
 gate="\n// Historical installation-specific source: default disabled before bootstrap or input.\nif (getenv('NOVASPACE_ENABLE_LEGACY_INSTANCE_SCRIPTS') !== 'I_REVIEWED_THE_SOURCE') { fwrite(STDERR, \"STOP: Historical instance-bound script. Read LEGACY_OPS.md before enabling.\\n\"); exit(78); }\n"
 f.write_text(s[:position]+gate+s[position:])
for f in [online/'package.json',online/'package-lock.json']:
 d=json.loads(f.read_text());d['version']='1.36.0'
 if 'packages'in d:d['packages']['']['version']='1.36.0'
 jwrite(f,d)
f=online/'scripts/build-browser-workflow.mjs';f.write_text(f.read_text().replace('workflow 1.5.0.','workflow 1.6.2.'))

# Personal source: binaries, user-facing cmd launchers and private receipts are omitted.
oldlocal=json.loads((local/'SOURCE_PROVENANCE.json').read_text())
if oldlocal.get('version')!='1.35.1-local.1':raise RuntimeError('Use a clean 1.35.1 personal-source baseline')
localpaths={r['path'] for r in oldlocal['files'] if r['path'] not in {'nextcloud-local-candidate/package.json','topics-candidate/build.mjs'}}
for folder in ['nextcloud-local-candidate/lib','nextcloud-local-candidate/src','nextcloud-local-candidate/browser','topics-candidate/source']:
 localpaths.update(str(f.relative_to(personal))for f in(personal/folder).rglob('*')if f.is_file()and f.suffix in{'.ts','.mts'})
for f in(personal/'nextcloud-local-candidate/tests').glob('*.test.mjs'):localpaths.add(str(f.relative_to(personal)))
for f in(personal/'topics-candidate/tests').glob('*.test.cjs'):localpaths.add(str(f.relative_to(personal)))
for f in (topics/'source').rglob('*'):
 if f.is_file() and f.suffix in {'.ts','.mts'}:localpaths.add('topics-candidate/'+str(f.relative_to(topics)))
for f in (topics/'tests').rglob('*'):
 if f.is_file() and f.suffix in {'.cjs','.py'} and f.name!='nextcloud-local.cjs' and '__pycache__' not in f.parts:localpaths.add('topics-candidate/'+str(f.relative_to(topics)))
for name in sorted(localpaths):
 file=topics/name.removeprefix('topics-candidate/') if name.startswith('topics-candidate/') else personal/name
 if file.is_file():copy(local,file,name,'topics-0.1.17/'+str(file.relative_to(topics)) if file.is_relative_to(topics) else None)
copy(local,topics/'build.mjs','topics-candidate/build.mjs','topics-0.1.17/build.mjs')
f=local/'topics-candidate/build.mjs';s=f.read_text().replace("await copyFile('../nextcloud-local-candidate/dist/nextcloud-local.cjs'","await mkdir('tests/fixtures',{recursive:true});\nawait copyFile('../nextcloud-local-candidate/dist/nextcloud-local.cjs'");f.write_text(s)
for name in ['update_connector.py','nextcloud-local-candidate/install.py','topics-candidate/install_topics.py']:
 f=local/name;s=f.read_text();oldguard="if __name__ == '__main__':" if "if __name__ == '__main__':"in s else "if __name__=='__main__':"
 if oldguard not in s:raise RuntimeError('Installer main guard changed: '+name)
 gate=oldguard+"\n    if __import__('os').environ.get('NOVASPACE_ENABLE_HISTORICAL_INSTALLERS') != 'I_REVIEWED_THE_SOURCE':\n        raise SystemExit('STOP: Historical installer disabled. Read BUILD.md; no configuration accessed.')"
 f.write_text(s.replace(oldguard,gate,1))
for base,version in [(local,'1.36.0-local.1'),(local/'nextcloud-local-candidate','1.36.0-local.1'),(local/'topics-candidate','0.1.17')]:
 for f in [base/'package.json',base/'package-lock.json']:
  if f.exists():
   d=json.loads(f.read_text());d['version']=version
   if 'packages'in d:d['packages']['']['version']=version
   jwrite(f,d)
f=local/'nextcloud-local-candidate/catalogue.mjs';f.write_text(f.read_text().replace('length!==172','length!==183'))
f=local/'config/local.example.json';f.write_text(clean(f.read_text()))

refresh_hashes(online);refresh_hashes(local)
for base,component,version in [(online,'online','1.36.0'),(local,'personal','1.36.0-local.1')]:
 provenance={'schemaVersion':2,'date':'2026-10-29','component':component,'version':version,'upstreamCommit':commit,'edition':'sanitized AGPL source; no deployment or independent first-install claim','historyImported':False,'originalPersonalArchiveSha256':original_archive if base==local else None,'privateEvidenceIdsPublished':False,'files':records[base],'excluded':['Credentials, runtime configuration and private receipts','Generated binaries, historical private hosting installers and full private Git history'],'additionalFilesPolicy':'Own publication/build/docs helpers: AGPL-3.0-or-later; existing third-party notices and dependency locks retained.'}
 jwrite(base/'SOURCE_PROVENANCE.json',provenance)
print(json.dumps({'prepared':str(root),'onlineSourceFiles':len(records[online]),'personalSourceFiles':len(records[local]),'upstreamCommit':commit,'published':False}))
