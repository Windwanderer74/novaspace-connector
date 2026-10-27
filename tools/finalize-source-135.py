#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bind executed source checks, file provenance and source-only manifests."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--qa-log-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];logs=a.qa_log_dir
def jwrite(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def node_result(name):
 s=(logs/name).read_text();values=[(int(n),int(f))for n,f in re.findall(r'ℹ pass (\d+)\s+ℹ fail (\d+)',s)]
 if not values or any(f for _,f in values):raise RuntimeError('Unconfirmed test log: '+name)
 return [n for n,_ in values]
def python_result(name):
 s=(logs/name).read_text();values=list(map(int,re.findall(r'Ran (\d+) tests? in',s)))
 if not values or s.count('\nOK\n')!=len(values):raise RuntimeError('Unconfirmed Python log: '+name)
 return values
online=root/'components/online/connector';local=root/'components/local/lmstudio';native=root/'components/nextcloud/projects'
if node_result('pub135-online-tests.log')!=[730]or node_result('pub135-online-built-tests.log')!=[2]:raise RuntimeError('Unexpected online contract')
if node_result('pub135-local-tests.log')!=[73,29]or node_result('pub135-native-tests.log')!=[4]:raise RuntimeError('Unexpected local/native contract')
if python_result('pub135-online-python.log')!=[7,4,5]:raise RuntimeError('Unexpected Python contract')
if [python_result(n)for n in ['pub135-local-python.log','pub135-topics-python.log','pub135-coordinator-python.log']]!=[[3],[9],[9]]:raise RuntimeError('Unexpected personal Python contract')
if 'Build complete.'not in(logs/'pub135-online-build.log').read_text():raise RuntimeError('Worker build unconfirmed')
protocol=(logs/'pub135-native-protocols.log').read_text()
if list(map(int,re.findall(r': (\d+) [^\n]*bestanden',protocol)))!=[28,35,11,1,11,6]or'Native app PHP syntax checked.'not in protocol:raise RuntimeError('Native protocols unconfirmed')
runtime={'os':'Linux x86_64','node':'24.22.1','npm':'11.9.0','python':'3.12.14','phpProtocolAndSyntax':'8.5.10 via PHP-WASM CLI; not a Nextcloud installation'}
common={'schemaVersion':2,'date':'2026-10-27','upstreamCommit':'b1dc8a5389a01ba21deb73f6857f03b06774081a','edition':'sanitized AGPL source snapshot','runtime':runtime,'liveChangesBySourceChecks':False,'modelOrFreshInstallAcceptanceBySourceChecks':False}
jwrite(online/'TEST_RESULTS.json',{**common,'version':'1.35.0','checks':{'lockedInstall':{'passed':True,'installedPackages':593},'unit':{'passed':730,'failed':0,'testFiles':len([f for f in(online/'tests').glob('*.test.mjs')if f.name not in ['rendered-html.test.mjs','intake-downloads.test.mjs']])},'builtWorker':{'passed':2,'failed':0},'browserBuild':{'passed':True,'thirdPartyPackages':17},'workerBuild':{'passed':True},'python':{'passed':[7,4,5],'failed':0},'historicalCliDefaultGuards':{'blocked':8,'bootstrapReached':False}},'boundaries':['Synthetic HTTP/temporary keys only; not live GitHub/Nextcloud writes','Native project fixtures have a separate component','Two stale discovery/version assertions updated to actual 200 tools/1.35.0; application unchanged','Not a fresh independent authentication/hosting or product acceptance']})
jwrite(local/'TEST_RESULTS.json',{**common,'versions':{'core':'1.35.0-local.1','topics':'0.1.12','coreTools':172,'topicsTools':171},'originalArchiveSha256':'8b6936a5ad072864efda2ce3ebc3a26f5607ee2c5c2417b04f2ec8af0aa8c5e5','checks':{'lockedInstall':{'corePackages':14,'topicPackages':30,'passed':True},'sourceBuilds':{'core':True,'topics':True,'catalogueWithoutCredentials':True},'javascript':{'corePassed':73,'topicsPassed':29,'failed':0,'topicCombinations':262144,'realMcpChildProcesses':True,'oneLmStudioSdkModuleGraph':True},'python':{'launcherPassed':3,'topicInstallerPassed':9,'coordinatorPassed':9,'mutationsSimulated':True},'historicalCliDefaultGuards':{'blocked':3,'configurationAccessed':False}},'boundaries':['Two original predecessor-core installer tests need excluded historical binary fixtures and are not rerun here','Original Windows installation and focused user-supplied LM Studio read test are separate recorded evidence','No fresh Windows DPAPI, general model/UI, project creation/resume, image or prompt-latency acceptance']})
jwrite(native/'TEST_RESULTS.json',{**common,'version':'0.2.12','checks':{'nodeGroups':{'passed':4,'failed':0,'controllerAssertions':25,'creationProtocolAssertions':64,'serviceAdapterAssertions':60,'apiContextAndPathAssertions':10},'standaloneProtocols':{'core':28,'creation':35,'matrix':11,'theme':1,'storage':11,'readyWorkplan':6},'appPhpSyntaxFiles':len(list((native/'app').rglob('*.php')))},'boundaries':['Nextcloud/Deck objects in controller/service fixtures are synthetic','Deck value-class and actual hook suites retained for host context; not claimed as standalone native integration','No private hosting installer/receipt included','Original host install/read API evidence is separate; practical connector creation/resume remains open']})
special={
 'online':{'tests/nextcloud-read.test.mjs':'Historical discovery expectations updated from195 to200 tools','tests/talk-read.test.mjs':'Historical capability version updated from1.33.2 to1.35.0'},
 'personal':{'topics-candidate/build.mjs':'Create generated fixture directory in a source-only checkout'},
 'native-projects':{'tests/project-connector-entry.test.mjs':'Resolve component root; private hosting-package test omitted from public source checks'},
}
for base in [online,local,native]:
 f=base/'SOURCE_PROVENANCE.json';d=json.loads(f.read_text())
 for entry in d['files']:
  path=entry['path'];entry['publishedSha256']=sha(base/path)
  detail=special.get(d['component'],{}).get(path)
  if detail and detail not in entry['changes']:entry['changes'].append(detail)
  if path.endswith('.php')and'LEGACY_INSTANCE_SCRIPTS'in(base/path).read_text():
   detail='Default historical-CLI guard added before bootstrap/input'
   if detail not in entry['changes']:entry['changes'].append(detail)
  if d['component']=='personal'and path in ['update_connector.py','nextcloud-local-candidate/install.py','topics-candidate/install_topics.py']:
   detail='Default historical-installer guard before configuration or credentials'
   if detail not in entry['changes']:entry['changes'].append(detail)
 jwrite(f,d)
 # Tracked sources plus new reviewed source files; ignored generated outputs stay out.
 listing=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','--',str(base.relative_to(root))],cwd=root,text=True).splitlines()
 included=[]
 for name in listing:
  file=root/name
  if file.is_symlink():raise RuntimeError('Unexpected symlink: '+name)
  if file.is_file()and file!=base/'SHA256SUMS.json':included.append(file)
 jwrite(base/'SHA256SUMS.json',{'schemaVersion':1,'edition':'source only','files':{str(f.relative_to(base)):sha(f)for f in sorted(set(included))}})
components={str(b.relative_to(root)):{'manifestSha256':sha(b/'SHA256SUMS.json'),'provenanceSha256':sha(b/'SOURCE_PROVENANCE.json'),'testReportSha256':sha(b/'TEST_RESULTS.json')}for b in[online,local,native]}
jwrite(root/'docs/PUBLICATION_1_35.json',{'schemaVersion':1,'date':'2026-10-27','publicBaseCommit':'3023b1adfb47362067cc02b73f625346797cffa6','sourceCheckpoint':'b1dc8a5389a01ba21deb73f6857f03b06774081a','components':components,'historicalOtherNativeComponentsUnchanged':True,'technicalPackage1':{'completed':21,'total':32},'practicalConnectorProjectCreationAccepted':False,'generalModelMatrixPaused':True})
print(json.dumps({'components':components,'published':False}))
