#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Record the executed correction checks and refresh source-only manifests."""
import argparse, hashlib, json, re, subprocess
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--qa-log-dir',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1]
checkpoint='96e68f12cdfc9ea9482cd646983fbdd5f809f2b7'
base='658498cb3f2bcdbf9872f38e0c66b9d4b99eb969'
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def baseline(path):return json.loads(subprocess.check_output(['git','show',base+':'+str(path.relative_to(root))],cwd=root,text=True))
def node(name,expected):
    text=(a.qa_log_dir/name).read_text()
    passes=list(map(int,re.findall(r'(?:ℹ |# )pass (\d+)',text)))
    failures=list(map(int,re.findall(r'(?:ℹ |# )fail (\d+)',text)))
    if passes!=expected or failures!=[0]*len(expected):raise RuntimeError('Unconfirmed Node log: '+name)
    return text
online=node('pub1351-online.log',[38,2])
personal=node('pub1351-personal.log',[84,29])
node('pub1351-native-isolated.log',[4])
node('n01-existing-paths.log',[43])
python=(a.qa_log_dir/'pub1351-python.log').read_text()
if list(map(int,re.findall(r'Ran (\d+) tests?',python)))!=[3,9,9] or python.count('\nOK\n')!=3:raise RuntimeError('Python checks unconfirmed')
if 'Build complete.' not in online:raise RuntimeError('Worker build unconfirmed')
components=[root/'components/online/connector',root/'components/local/lmstudio',root/'components/nextcloud/projects']
common={'schemaVersion':3,'date':'2026-10-27','upstreamCommit':checkpoint,'edition':'sanitized AGPL source snapshot','liveChangesBySourceChecks':False,'modelOrFreshInstallAcceptanceBySourceChecks':False}
checks=[
 {'version':'1.35.1','checks':{'targetedJavascriptPassed':38,'builtWorkerPassed':2,'notesFilesAndSharingPassed':43,'workerBuild':True,'browserBuild':True,'failed':0},'boundaries':['Focused correction and Notes/Files checks; the previous 730-case run is retained below, not relabelled as rerun','Synthetic HTTP and temporary keys; no live mutation by source checks']},
 {'versions':{'core':'1.35.1-local.1','topics':'0.1.13','revision':13,'coreTools':172,'topicsTools':171},'checks':{'coreBuild':True,'topicsBuild':True,'coreJavascriptPassed':84,'topicsJavascriptPassed':29,'topicCombinations':262144,'pythonPassed':[3,9,9],'failed':0},'boundaries':['Historical public installers remain disabled by default','Excluded predecessor-binary tests are not claimed as rerun; no fresh Windows or general model/UI acceptance']},
 {'version':'0.2.13','checks':{'nodeGroupsPassed':4,'controllerAssertions':25,'protocolAssertions':64,'serviceAssertions':60,'apiAssertions':10,'failed':0},'boundaries':['Only app version differs from the preceding 23-file native app; synthetic Nextcloud context','The first parallel runner output was incomplete; only the complete isolated four-group run is accepted','No private host installer, payload or receipt included']}
]
for component,report in zip(components,checks):
    report={**common,**report,'previousSnapshotChecks':baseline(component/'TEST_RESULTS.json')}
    write(component/'TEST_RESULTS.json',report)
    provenance=json.loads((component/'SOURCE_PROVENANCE.json').read_text())
    for entry in provenance['files']:
        entry['publishedSha256']=sha(component/entry['path'])
        path=entry['path'];details=[]
        if path.endswith('.php') and 'LEGACY_INSTANCE_SCRIPTS' in (component/path).read_text():
            details.append('Default historical-CLI guard before bootstrap or input')
        if path in ['update_connector.py','nextcloud-local-candidate/install.py','topics-candidate/install_topics.py']:
            details.append('Default historical-installer guard before configuration or credentials')
        if path=='topics-candidate/build.mjs':details.append('Create generated fixture directory in a source-only checkout')
        if path=='tests/nextcloud-read.test.mjs':details.append('Discovery assertion uses the actual 200-tool catalogue')
        if path=='tests/talk-read.test.mjs':details.append('Capability assertion uses current 1.35.1 version')
        for detail in details:
            if detail not in entry['changes']:entry['changes'].append(detail)
    if component==components[2]:
        e=next(e for e in provenance['files'] if e['path']=='tests/project-connector-entry.test.mjs')
        e['changes'].append('Public fixture root; private host test omitted; metadata assertion compares 0.2.12 to 0.2.13')
    write(component/'SOURCE_PROVENANCE.json',provenance)
    names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','--',str(component.relative_to(root))],cwd=root,text=True).splitlines()
    files={}
    for name in sorted(set(names)):
        file=root/name
        if file.is_symlink():raise RuntimeError('Unexpected symlink: '+name)
        if file.is_file() and file!=component/'SHA256SUMS.json':files[str(file.relative_to(component))]=sha(file)
    write(component/'SHA256SUMS.json',{'schemaVersion':1,'edition':'source only','files':files})
record={str(c.relative_to(root)):{'manifestSha256':sha(c/'SHA256SUMS.json'),'provenanceSha256':sha(c/'SOURCE_PROVENANCE.json'),'testReportSha256':sha(c/'TEST_RESULTS.json')} for c in components}
write(root/'docs/PUBLICATION_1_35_1.json',{'schemaVersion':1,'date':'2026-10-27','publicBaseCommit':base,'sourceCheckpoint':checkpoint,'components':record,'historicalOtherNativeComponentsUnchanged':True,'technicalPackage1':{'completed':22,'total':32},'projectBetaBlock':'accepted with recorded scope boundaries','notesFilesTechnicalReconciliation':'complete using existing tools','practicalEvidenceBasis':'separate operator and client reports, no private IDs or receipts published','partialCreationRecoveryLiveAccepted':False,'generalModelMatrixPaused':True})
print(json.dumps({'components':record,'checksPassed':True,'published':False}))
