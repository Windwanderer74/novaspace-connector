#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Prepare a disposable Ubuntu 24.04 lab without installing system packages or services."""
from pathlib import Path, PurePosixPath
import argparse, hashlib, json, os, re, subprocess, tarfile, urllib.request

parser=argparse.ArgumentParser()
parser.add_argument('--lab-root',type=Path,required=True)
parser.add_argument('--nextcloud-version',default='34.0.4')
args=parser.parse_args();lab=args.lab_root.resolve();version=args.nextcloud_version
if not re.fullmatch(r'(34|35)\.\d+\.\d+',version):raise SystemExit('Only pinned Nextcloud 34/35 versions are supported.')
if '24.04' not in Path('/etc/os-release').read_text() or os.uname().machine!='x86_64':raise SystemExit('This runtime preparation recipe is for Ubuntu 24.04 x86_64.')
marker=lab/'lab-marker.json'
if lab.exists() and any(lab.iterdir()) and not marker.is_file():raise SystemExit('Use an empty lab directory.')
if marker.exists():
    previous=json.loads(marker.read_text())
    if previous!={'purpose':'novaspace-native-app-integration-test','nextcloudVersion':version}:raise SystemExit('Existing lab marker does not match.')
lab.mkdir(parents=True,exist_ok=True);marker.write_text(json.dumps({'purpose':'novaspace-native-app-integration-test','nextcloudVersion':version})+'\n')
for name in ['downloads','apt-cache','private','logs','php-conf.d']:(lab/name).mkdir(exist_ok=True)
(lab/'private').chmod(0o700)
packages=['php8.3-cli','php8.3-common','php8.3-opcache','php8.3-readline','php8.3-apcu','php8.3-curl','php8.3-gd','php8.3-intl','php8.3-mbstring','php8.3-mysql','php8.3-sqlite3','php8.3-xml','php8.3-zip','php8.3-bcmath','php8.3-gmp','mariadb-server-core','mariadb-client-core']
simulation=subprocess.run(['apt-get','-s','--no-install-recommends','install',*packages],capture_output=True,text=True)
if simulation.returncode:raise SystemExit('Usable Ubuntu APT indexes are required; refresh them before this preparation.\n'+simulation.stderr)
selected=sorted(set(packages+re.findall(r'^Inst (\S+)',simulation.stdout,re.M)+['mariadb-server','mariadb-common','mysql-common']))
command=['apt-get','-o','Acquire::Retries=0','-o','Acquire::https::Timeout=30']
if os.getuid()==0:command+=['-o','APT::Sandbox::User=root']
with (lab/'logs/runtime-download.log').open('w')as log:
    subprocess.run([*command,'download',*selected],cwd=lab/'apt-cache',stdout=log,stderr=subprocess.STDOUT,check=True)
runtime=lab/'runtime';runtime.mkdir(exist_ok=True)
with (lab/'logs/runtime-extract.log').open('w')as log:
    for package in sorted((lab/'apt-cache').glob('*.deb')):subprocess.run(['dpkg-deb','--extract',str(package),str(runtime)],stdout=log,stderr=subprocess.STDOUT,check=True)
configuration=[*(runtime/'etc/php/8.3/mods-available').glob('*.ini'),*(runtime/'usr/share').glob('php8.3-*/*/*.ini')]
for path in configuration:
    text=path.read_text()
    if not re.search(r'^(?:zend_)?extension\s*=',text,re.M):continue
    priority=re.search(r'priority=(\d+)',text)
    (lab/'php-conf.d'/f'{int(priority.group(1))if priority else 20:02d}-{path.name}').write_text(text)
for name in ['tmp','sessions']:(lab/'private'/name).mkdir(exist_ok=True)
(lab/'php.ini').write_text(f'''[PHP]
extension_dir={runtime}/usr/lib/php/20230831
memory_limit=512M
date.timezone=UTC
display_errors=Off
log_errors=On
error_log={lab}/logs/php-errors.log
zend.exception_ignore_args=On
allow_url_fopen=On
upload_tmp_dir={lab}/private/tmp
session.save_path={lab}/private/sessions
opcache.enable_cli=0
apc.enable_cli=1
openssl.cafile=/etc/ssl/certs/ca-certificates.crt
curl.cainfo=/etc/ssl/certs/ca-certificates.crt
''')
archive=lab/'downloads'/f'nextcloud-{version}.tar.bz2';checksum=Path(str(archive)+'.sha256')
def download(url,path):
    with urllib.request.urlopen(url,timeout=180)as response,path.open('wb')as output:
        while chunk:=response.read(1024*1024):output.write(chunk)
base='https://download.nextcloud.com/server/releases/'+archive.name
download(base+'.sha256',checksum)
if not archive.exists():download(base,archive)
actual=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
if actual!=checksum.read_text().split()[0]:raise SystemExit('Official archive checksum mismatch.')
if not(lab/'nextcloud/occ').exists():
    with tarfile.open(archive)as package:
        for member in package.getmembers():
            path=PurePosixPath(member.name)
            if path.is_absolute() or '..'in path.parts or not path.parts or path.parts[0]!='nextcloud':raise SystemExit('Unexpected archive path.')
        package.extractall(lab,filter='data')
print(json.dumps({'labPrepared':True,'nextcloudVersion':version,'archiveSha256':actual,'systemPackagesInstalled':False}))
