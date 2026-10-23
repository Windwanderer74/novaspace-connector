#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Run a native Nextcloud integration check in an explicitly marked disposable lab."""
from pathlib import Path
import argparse, base64, hashlib, html, http.cookiejar, json, os, re, secrets, shutil, socket as network_socket, subprocess, time, urllib.error, urllib.parse, urllib.request, uuid
from datetime import datetime, timezone
from html.parser import HTMLParser
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization

parser=argparse.ArgumentParser()
parser.add_argument('--lab-root',type=Path,required=True)
parser.add_argument('--app-source',type=Path,required=True)
args=parser.parse_args()
lab=args.lab_root.resolve(); source=args.app_source.resolve(); nc=lab/'nextcloud'; runtime=lab/'runtime/usr'
marker=lab/'lab-marker.json'
if not marker.is_file() or json.loads(marker.read_text()).get('purpose')!='novaspace-native-app-integration-test':
    raise SystemExit('An explicitly marked disposable lab is required.')
test_version=json.loads(marker.read_text())['nextcloudVersion']
if not re.fullmatch(r'(34|35)\.\d+\.\d+',test_version):raise SystemExit('This integration recipe is scoped to Nextcloud 34/35.')
archive=lab/'downloads'/('nextcloud-'+test_version+'.tar.bz2')
archive_sha256=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
if archive_sha256!=Path(str(archive)+'.sha256').read_text().split()[0]:raise SystemExit('Official archive checksum mismatch')
if lab==source or lab in source.parents or source in lab.parents:
    raise SystemExit('Lab and publication source must be separate.')
private=lab/'private'; logs=lab/'logs'; private.mkdir(exist_ok=True,mode=0o700);private.chmod(0o700);logs.mkdir(exist_ok=True)
php=[str(runtime/'bin/php8.3'),'-c',str(lab/'php.ini')]
env={**os.environ,'LD_LIBRARY_PATH':str(runtime/'lib/x86_64-linux-gnu'),'PHP_INI_SCAN_DIR':str(lab/'php-conf.d'),'PATH':str(runtime/'bin')+':'+os.environ['PATH']}
def free_port():
    with network_socket.socket(network_socket.AF_INET)as connection:
        connection.bind(('127.0.0.1',0));return connection.getsockname()[1]
db_port=free_port();http_port=free_port();run_id=uuid.uuid4().hex[:12]
base='http://127.0.0.1:'+str(http_port);dbname='nf_test_platform'
results=[]; processes=[]; handles=[]; sensitive=[]; versions={}
app_hashes={str(p.relative_to(source/'app')):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted((source/'app').rglob('*'))if p.is_file()}
credentials={k:secrets.token_urlsafe(32)for k in ['database','admin','owner','actor','other']}
credentials_file=private/'credentials.json';credentials_file.write_text(json.dumps(credentials));credentials_file.chmod(0o600);sensitive.extend(credentials.values())

def clean(text):
    for value in sensitive:
        if value:text=text.replace(value,'[redacted]')
    return text
def run(command,label,extra_env=None,input=None,check=True,timeout=90):
    result=subprocess.run(command,cwd=nc,env={**env,**(extra_env or {})},input=input,capture_output=True,text=True,timeout=timeout)
    if check and result.returncode:
        (logs/(label+'.log')).write_text(clean(result.stdout+'\n'+result.stderr))
        raise RuntimeError(label+' failed; '+clean((result.stderr or result.stdout)[-1800:]))
    return result
def occ(*arguments,label=None,extra_env=None):
    return run([*php,str(nc/'occ'),*arguments],label or arguments[0].replace(':','-'),extra_env).stdout
def sql(query):
    return run([str(runtime/'bin/mariadb'),'--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+str(db_port),'--user=root','--batch','--skip-column-names'], 'database-query',input=query).stdout.strip()
def record(name,condition,**details):
    result={'name':name,'passed':bool(condition),**details};results.append(result);print(('PASS' if condition else 'FAIL')+': '+name,flush=True)
    if not condition:raise AssertionError(name)
def start(command,name,extra_env=None):
    handle=(logs/(name+'.log')).open('w');handles.append(handle)
    process=subprocess.Popen(command,cwd=nc,env={**env,**(extra_env or {})},stdout=handle,stderr=subprocess.STDOUT)
    processes.append(process);return process
def wait_for(check,process,label,seconds=30):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        if process.poll() is not None:raise RuntimeError(label+' exited early; inspect its local log.')
        try:
            if check():return
        except Exception:pass
        time.sleep(.25)
    raise RuntimeError(label+' did not become ready')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**kw):return None
class Web:
    def __init__(self):
        self.cookies=http.cookiejar.CookieJar()
        self.opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPCookieProcessor(self.cookies),NoRedirect())
    def request(self,path,method='GET',data=None,headers=None):
        url=path if path.startswith(base) else base+path
        if not url.startswith(base+'/'):raise RuntimeError('Test HTTP target must stay on loopback lab origin')
        headers=dict(headers or {})
        if method=='POST':headers.setdefault('Origin',base)
        if isinstance(data,dict):data=urllib.parse.urlencode(data,doseq=True).encode();headers.setdefault('Content-Type','application/x-www-form-urlencoded')
        request=urllib.request.Request(url,data=data,headers=headers,method=method)
        try:response=self.opener.open(request,timeout=30)
        except urllib.error.HTTPError as error:response=error
        return response.code,dict(response.headers),response.read().decode('utf-8','replace')
    def login(self,user,password):
        status,headers,body=self.request('/index.php/login'); token=request_token(body)
        status,headers,body=self.request('/index.php/login',method='POST',data={'user':user,'password':password,'requesttoken':token,'timezone':'UTC','timezone_offset':'0'})
        if status not in (302,303) or '/login' in headers.get('Location',''):
            (logs/'login-response.html').write_text(body);raise RuntimeError('Native login failed, HTTP '+str(status))

def request_token(body):
    for pattern in [r'data-requesttoken="([^"]+)"',r'name="requesttoken"\s+value="([^"]+)"']:
        match=re.search(pattern,body)
        if match:return html.unescape(match.group(1))
    raise RuntimeError('Native request token missing from response')
class Forms(HTMLParser):
    def __init__(self,body):self.forms=[];self.current=None;super().__init__();self.feed(body)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='form':self.current={'action':a.get('action',''),'fields':{}};self.forms.append(self.current)
        elif tag=='input' and self.current is not None and a.get('name') and a.get('type')=='hidden':self.current['fields'][a['name']]=a.get('value','')
    def handle_endtag(self,tag):
        if tag=='form':self.current=None
    def find(self,ending):
        matches=[f for f in self.forms if urllib.parse.urlparse(f['action']).path.endswith(ending)]
        if len(matches)!=1:raise RuntimeError('Expected one native form: '+ending)
        return matches[0]

key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
public_key=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode()
trust={'kid':hashlib.sha256(public_key.encode()).hexdigest(),'issuer':'https://connector.test','audienceBase':base+'/ocs/v2.php/apps/novaspace_platform/api/v1/registry','publicKey':public_key,'label':'Isolated integration test'}
def b64(data):return base64.urlsafe_b64encode(data).decode().rstrip('=')
def proof(purpose,patch=None,body_hash=None):
    now=int(time.time());claims={'iss':trust['issuer'],'aud':trust['audienceBase']+'/'+purpose,'sub':'b'*64,'client':'c'*64,'scope':['nextcloud:read','github:read','github:write'],'purpose':purpose,'iat':now,'exp':now+30,'nonce':str(uuid.uuid4())}
    if body_hash is not None:claims['bodyHash']=body_hash
    claims.update(patch or {})
    encode=lambda value:json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()
    signing=(b64(encode({'alg':'RS256','kid':trust['kid'],'typ':'novaspace-client+jwt'}))+'.'+b64(encode(claims))).encode()
    return signing.decode()+'.'+b64(key.sign(signing,padding.PKCS1v15(),hashes.SHA256()))

try:
    database_directory=private/('mariadb-'+run_id)
    run([str(runtime/'bin/mariadb-install-db'),'--no-defaults','--basedir='+str(runtime),'--datadir='+str(database_directory),'--auth-root-authentication-method=normal','--skip-test-db','--user=root'],'mariadb-initialize')
    print('Starting isolated MariaDB',flush=True)
    db=start([str(runtime/'sbin/mariadbd'),'--no-defaults','--user=root','--basedir='+str(runtime),'--datadir='+str(database_directory),'--socket=','--pid-file='+str(private/('mariadb-'+run_id+'.pid')),'--bind-address=127.0.0.1','--port='+str(db_port),'--innodb-use-native-aio=0','--transaction-isolation=READ-COMMITTED','--character-set-server=utf8mb4','--collation-server=utf8mb4_general_ci'],'mariadb')
    wait_for(lambda:Path(sql('SELECT @@datadir;')).resolve()==database_directory.resolve(),db,'MariaDB')
    versions['php']=run([*php,'-r','echo PHP_VERSION;'],'php-version').stdout.strip()
    versions['database']=sql('SELECT VERSION();')
    sql('CREATE DATABASE '+dbname+' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; CREATE USER \'nf_test_platform\'@\'127.0.0.1\' IDENTIFIED BY \''+credentials['database']+'\'; GRANT ALL ON '+dbname+'.* TO \'nf_test_platform\'@\'127.0.0.1\';')
    data_dir=private/('data-'+run_id)
    config={'appstoreenabled':False,'updatechecker':False,'trusted_domains':['127.0.0.1'],'overwrite.cli.url':base,'auth.bruteforce.protection.enabled':False,'ratelimit.protection.enabled':False,'default_phone_region':'DE','default_language':'en','default_locale':'en_US','logfile':str(logs/'nextcloud.jsonl'),'loglevel':1,'apps_paths':[{'path':str(nc/'apps'),'url':'/apps','writable':False},{'path':str(nc/'custom_apps'),'url':'/custom_apps','writable':True}]}
    (nc/'custom_apps').mkdir(exist_ok=True)
    encoded=json.dumps(config).replace('\\','\\\\').replace("'","\\'")
    (nc/'config/config.php').write_text("<?php\n$CONFIG = json_decode('"+encoded+"', true);\n")
    (nc/'config/config.php').chmod(0o600)
    installer=lab/'install-native.php'
    installer.write_text('''<?php
ini_set('zend.exception_ignore_args','1');
$lab=__DIR__; $secret=json_decode(file_get_contents($lab.'/private/credentials.json'),true,512,JSON_THROW_ON_ERROR);
$_SERVER['argv']=[$lab.'/nextcloud/occ','maintenance:install','--database=mysql','--database-name=nf_test_platform','--database-host=127.0.0.1','--database-port='.getenv('NF_LAB_DATABASE_PORT'),'--database-user=nf_test_platform','--database-pass='.$secret['database'],'--admin-user=nf_test_admin','--admin-pass='.$secret['admin'],'--data-dir='.getenv('NF_LAB_DATA_DIR'),'--no-interaction'];
$argv=$_SERVER['argv']; require $lab.'/nextcloud/console.php';
''')
    print('Installing official Nextcloud core',flush=True)
    install=run([*php,str(installer)],'nextcloud-install',extra_env={'NF_LAB_DATABASE_PORT':str(db_port),'NF_LAB_DATA_DIR':str(data_dir)},timeout=180)
    record('Official Nextcloud installation succeeds','Nextcloud was successfully installed' in install.stdout)
    version=json.loads(occ('status','--output=json'));record('Requested Nextcloud '+test_version+' installed',version.get('installed') is True and version.get('versionstring')==test_version,version=version.get('versionstring'))
    app=nc/'custom_apps/novaspace_platform'
    if app.exists():shutil.rmtree(app)
    shutil.copytree(source/'app',app)
    print('Activating native app and migrations',flush=True)
    enabled=occ('app:enable','novaspace_platform')
    record('Native app activates through real occ', 'enabled' in enabled)
    tables=sql("SELECT table_name FROM information_schema.tables WHERE table_schema='"+dbname+"' AND table_name LIKE 'oc_ns_pf_%' ORDER BY table_name;").splitlines()
    expected=['oc_ns_pf_access','oc_ns_pf_actions','oc_ns_pf_connections','oc_ns_pf_events','oc_ns_pf_grants','oc_ns_pf_owners']
    record('All six native migrations tables exist',tables==expected,tables=tables)
    occ('config:app:set','password_policy','enforceHaveIBeenPwned','--value=0')
    for name,secret in [('owner','owner'),('actor','actor'),('other','other')]:occ('user:add','--password-from-env','--no-interaction','nf_test_'+name,extra_env={'NC_PASS':credentials[secret]})
    token_output=occ('user:auth-tokens:add','nf_test_actor','--password-from-env','--name=NovaSpace integration','--no-interaction',extra_env={'NC_PASS':credentials['actor']})
    app_password=token_output.strip().splitlines()[-1];sensitive.append(app_password)
    if len(app_password)<30:raise RuntimeError('Native app password was not returned')
    print('Starting loopback-only Nextcloud HTTP server',flush=True)
    webserver=start([*php,'-S','127.0.0.1:'+str(http_port),'-t',str(nc)],'http')
    public=Web();wait_for(lambda:public.request('/status.php')[0]==200,webserver,'Nextcloud HTTP')
    status,_,_=public.request('/index.php/apps/novaspace_platform/')
    record('Unauthenticated native page requires login',status in (302,303,401),httpStatus=status)
    owner=Web();owner.login('nf_test_owner',credentials['owner'])
    status,_,body=owner.request('/index.php/apps/novaspace_platform/')
    (logs/'owner-initial.html').write_text(body)
    record('Real native owner page renders',status==200 and 'Meine KI-Verbindungen' in body and 'nf_test_owner' in body,httpStatus=status)
    actor=Web();authorization='Basic '+base64.b64encode(('nf_test_actor:'+app_password).encode()).decode();sensitive.append(authorization)
    registry='/ocs/v2.php/apps/novaspace_platform/api/v1/registry'
    def api(operation,assertion=None,query='',client=None):
        headers={'Accept':'application/json','OCS-APIRequest':'true'}
        if client is None:headers['Authorization']=authorization
        if assertion is not None:headers['X-NovaSpace-Client']=assertion
        status,_,text=(client or actor).request(registry+'/'+operation+'?format=json'+query,headers=headers)
        try:data=json.loads(text).get('ocs',{}).get('data')
        except json.JSONDecodeError:data=None
        return status,data,text
    def connection_state():
        status,data,text=api('status',proof('status'))
        if status!=200:
            (logs/'registry-error.json').write_text(text);raise RuntimeError('Native registry status HTTP '+str(status))
        return data['connection']
    def github(command,assertion_patch=None):
        payload={'command':command};canonical=json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
        headers={'Accept':'application/json','Content-Type':'application/json','OCS-APIRequest':'true','Authorization':authorization,'X-NovaSpace-Client':proof('github',assertion_patch,hashlib.sha256(canonical).hexdigest())}
        status,_,text=actor.request(registry+'/github?format=json',method='POST',data=json.dumps(payload,separators=(',',':')).encode(),headers=headers)
        try:data=json.loads(text).get('ocs',{}).get('data')
        except json.JSONDecodeError:data=None
        return status,data,text
    def event_count():return int(sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_events;'))
    status,_,_=api('status',proof('status'))
    record('Inactive publication trust rejects signed online request',status==503,httpStatus=status)
    (app/'appinfo/trusted-gateway.json').write_text(json.dumps(trust,indent=2)+'\n')
    state=connection_state()
    record('Real app-password identity reaches unregistered registry',state['registered'] is False)
    status,setup,text=api('setup',proof('setup'))
    if status!=200:(logs/'setup-error.json').write_text(text)
    record('Signed setup returns native approval link without registering',status==200 and setup.get('requiresWebApproval') is True and setup.get('registeredByThisCall') is False and int(sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_connections;'))==0,httpStatus=status)
    approval_url=setup['setupUrl'];sensitive.append(approval_url)
    status,_,body=owner.request(approval_url);forms=Forms(body);form=forms.find('/connections/approve')
    record('Owner receives native approval form',status==200 and 'nf_test_owner' in body and 'nf_test_actor' in body,httpStatus=status)
    fields={**form['fields'],'label':'Native integration connection'}
    status,_,_=owner.request(form['action'],method='POST',data={k:v for k,v in fields.items()if k!='requesttoken'})
    record('Approval without CSRF is rejected without database change',status in (403,412) and int(sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_connections;'))==0,httpStatus=status)
    status,_,_=owner.request(form['action'],method='POST',data=fields)
    record('Native owner can approve the exact personal connection',status in (302,303),httpStatus=status)
    state=connection_state();connection=state['connection'];connection_id=connection['connectionId']
    record('Registration separates logical owner from native actor',state['active'] is True and connection['ownerUid']=='nf_test_owner' and connection['nativeUid']=='nf_test_actor')
    record('Approval creates one registry row and one journal event',int(sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_connections;'))==1 and event_count()==1)
    for name,assertion,query in [('Expired assertion',proof('status',{'iat':int(time.time())-120,'exp':int(time.time())-1}),''),('Cross-purpose assertion',proof('setup'),''),('Wrong issuer',proof('status',{'iss':'https://untrusted.test'}),''),('Owner parameter injection',proof('status'),'&ownerUid=nf_test_other')]:
        status,_,text=api('status',assertion,query)
        record(name+' is rejected',status==(400 if query else 503) and app_password not in text,httpStatus=status)
    status,_,_=api('status',proof('status'),client=owner)
    record('Web session cannot substitute for signed app-password caller',status==503,httpStatus=status)
    status,data,text=github({'operation':'status'})
    record('Missing optional GitHub app is reported without false connection',status==200 and data.get('outcome')=='sync_app_unavailable' and data.get('connected') is False and data.get('account')=='nf_test_owner',httpStatus=status)
    status,_,inventory_body=owner.request('/index.php/apps/novaspace_platform/inventory')
    inventory_form=Forms(inventory_body).find('/inventory/grants/'+connection_id)
    status,_,_=owner.request(inventory_form['action'],method='POST',data={**inventory_form['fields'],'mode':'read'})
    record('Missing optional Inventory app cannot create a grant or orphan journal',status==409 and sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_grants;')=='0' and sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_actions;')=='0' and sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_owners;')=='0',httpStatus=status)
    _,_,body=owner.request('/index.php/apps/novaspace_platform/');access=Forms(body).find('/access')
    apps={key:('read'if key in ['mail','talk','announcements']else 'write')for key in ['files','deck','notes','tasks','contacts','calendar','mindmap','tables','mail','talk','announcements','inventory']}
    apps.update({'notes':'off','tasks':'off','contacts':'off'})
    permission_fields={**access['fields'],'enabled':'0',**{'apps['+key+']':value for key,value in apps.items()}}
    status,_,_=owner.request(access['action'],method='POST',data=permission_fields)
    record('Owner can atomically disable the connection main switch',status in (302,303) and connection_state()['accessPolicy']['enabled'] is False,httpStatus=status)
    count=event_count();status,_,_=owner.request(access['action'],method='POST',data=permission_fields)
    record('Repeated identical access request does not duplicate journal',status in (302,303) and event_count()==count,httpStatus=status)
    stale={**permission_fields,'requestId':str(uuid.uuid4()),'enabled':'1'}
    status,_,_=owner.request(access['action'],method='POST',data=stale)
    record('Stale permission form cannot overwrite a newer revision',status==409 and connection_state()['accessPolicy']['enabled'] is False and event_count()==count,httpStatus=status)
    status,_,_=github({'operation':'status'})
    record('Disabled main switch blocks native GitHub operation',status==503,httpStatus=status)
    other=Web();other.login('nf_test_other',credentials['other']);status,_,other_body=other.request('/index.php/apps/novaspace_platform/')
    record('Another owner cannot see this connection',status==200 and 'Native integration connection'not in other_body and connection_id not in other_body,httpStatus=status)
    _,_,body=owner.request('/index.php/apps/novaspace_platform/');access=Forms(body).find('/access')
    enable_fields={**access['fields'],'enabled':'1',**{'apps['+key+']':value for key,value in apps.items()}}
    alien={**enable_fields,'requesttoken':request_token(other_body)}
    status,_,_=other.request(access['action'],method='POST',data=alien)
    record('Another owner cannot change the connection with valid own CSRF',status==409 and connection_state()['accessPolicy']['enabled'] is False,httpStatus=status)
    status,_,_=owner.request(access['action'],method='POST',data=enable_fields)
    record('Fresh owner form can re-enable the connection',status in (302,303) and connection_state()['accessPolicy']['enabled'] is True,httpStatus=status)
    _,_,body=owner.request('/index.php/apps/novaspace_platform/');revoke=Forms(body).find('/revoke')
    before_events=event_count()
    status,_,_=owner.request(revoke['action'],method='POST',data={k:v for k,v in revoke['fields'].items()if k!='requesttoken'})
    record('Revocation without CSRF is rejected without state change',status in (403,412) and connection_state()['active'] is True and event_count()==before_events,httpStatus=status)
    status,_,_=owner.request(revoke['action'],method='POST',data=revoke['fields'])
    record('Native owner revocation becomes visible to following API read',status in (302,303) and connection_state()['active'] is False and event_count()==before_events+1,httpStatus=status)
    count=event_count();status,_,_=owner.request(revoke['action'],method='POST',data=revoke['fields'])
    record('Repeated revocation preserves one journal event',status in (302,303) and event_count()==count,httpStatus=status)
    status,_,_=github({'operation':'status'})
    record('Revoked connection blocks following GitHub operation',status==503,httpStatus=status)
    migrations=sql("SELECT COUNT(*) FROM "+dbname+".oc_migrations WHERE app='novaspace_platform';")
    occ('app:disable','novaspace_platform')
    record('Disabling app preserves registry and journal',int(sql('SELECT COUNT(*) FROM '+dbname+'.oc_ns_pf_connections;'))==1 and event_count()==count)
    occ('app:enable','novaspace_platform')
    record('Re-enabling app does not rerun or duplicate migrations',sql("SELECT COUNT(*) FROM "+dbname+".oc_migrations WHERE app='novaspace_platform';")==migrations and event_count()==count)
    status,_,body=owner.request('/index.php/apps/novaspace_platform/')
    record('Revocation remains effective after app re-enable',status==200 and 'Widerrufen'in body and connection_state()['active'] is False,httpStatus=status)
    webserver.terminate();webserver.wait(timeout=15)
    webserver=start([*php,'-S','127.0.0.1:'+str(http_port),'-t',str(nc)],'http-restarted')
    wait_for(lambda:public.request('/status.php')[0]==200,webserver,'Restarted Nextcloud HTTP')
    status,_,body=owner.request('/index.php/apps/novaspace_platform/')
    record('Real webserver restart preserves session, journal and revocation',status==200 and 'Widerrufen'in body and connection_state()['active'] is False and event_count()==count,httpStatus=status)
    print('NATIVE_INTEGRATION_CHECKS_COMPLETE',flush=True)
except Exception as error:
    print('TEST_RUN_FAILED: '+clean(str(error)),flush=True)
    results.append({'name':'run completion','passed':False,'error':clean(str(error))})
    raise
finally:
    for process in reversed(processes):
        process.terminate()
        try:process.wait(timeout=15)
        except subprocess.TimeoutExpired:process.kill();process.wait()
    for handle in handles:handle.close()
    report={'schemaVersion':1,'testedAtUtc':datetime.now(timezone.utc).isoformat(),'nextcloud':test_version,'php':versions.get('php'),'database':versions.get('database'),'webServer':'PHP built-in loopback test server','coreArchive':{'url':'https://download.nextcloud.com/server/releases/nextcloud-'+test_version+'.tar.bz2','sha256':archive_sha256},'productionAccessed':False,'externalGithubOperationsPerformed':False,'credentials':'Generated exclusively for this disposable local lab; omitted from report.','testGatewayKey':'Ephemeral RSA key, generated in process memory.','testedAppFileSha256':app_hashes,'checksPassed':sum(r['passed']for r in results),'checksTotal':len(results),'results':results,'limits':['Only the exact version and runtime combination in this report is covered.','PHP built-in loopback server; Apache/nginx/FPM, HTTPS and production load are not certified.','External deckgithubsync/Inventory apps absent: their guarded absence is tested; successful external-app and GitHub writes are not tested.','Stale-version rejection tested; no multi-worker race/load test.','This fresh installation is not an upgrade acceptance for an existing production installation.','Lab-only brute-force/rate-limit protection disabled to keep negative functional tests deterministic.']}
    (lab/'integration-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
