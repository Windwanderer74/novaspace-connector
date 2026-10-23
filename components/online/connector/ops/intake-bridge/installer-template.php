<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
if(PHP_SAPI!=='cli' || !in_array('--install-and-test',$argv,true) || !is_file(getcwd().'/lib/base.php') || !extension_loaded('curl')){fwrite(STDERR,"STOPP: Nextcloud-Hauptordner, PHP CLI und --install-and-test erforderlich.\n");exit(1);}
define('OC_CONSOLE',true);
__INSTALL_HELPERS__
function nfInputPassword(): string {
    $tty=fopen('/dev/tty','r+');nfHttpAssert(is_resource($tty),'INTERACTIVE_TTY_REQUIRED');
    $stty=static function(array $args):string{$p=proc_open(array_merge(['stty'],$args),[0=>['file','/dev/tty','r'],1=>['pipe','w'],2=>['file','/dev/null','w']],$pipes);nfHttpAssert(is_resource($p),'TTY_CONTROL_FAILED');$s=stream_get_contents($pipes[1]);fclose($pipes[1]);nfHttpAssert(proc_close($p)===0,'TTY_CONTROL_FAILED');return trim($s);};
    $before=$stty(['-g']);register_shutdown_function(static function()use($stty,$before):void{try{$stty([$before]);}catch(Throwable $e){}});
    fwrite($tty,"Konto ChatGPT: aktuelles Kontopasswort (unsichtbar): ");$stty(['-echo']);
    try{$line=fgets($tty);}finally{$stty([$before]);fwrite($tty,"\n");fclose($tty);}
    nfHttpAssert(is_string($line),'PASSWORD_INPUT_ABORTED');$password=rtrim($line,"\r\n");nfHttpAssert($password!=='','EMPTY_PASSWORD');return $password;
}
function nfRequest(string $password,string $method,string $path,?array $body=null,bool $auth=true):array {
    nfHttpAssert(str_starts_with($path,'/ocs/v2.php/apps/novaforge_tables/api/v1/'),'HTTP_PATH_INVALID');
    $ch=curl_init('https://cloud.example.invalid'.$path.'?format=json');nfHttpAssert($ch!==false,'CURL_INIT_FAILED');$out='';$headers=['OCS-APIRequest: true','Accept: application/json'];
    if($body!==null)$headers[]='Content-Type: application/json';
    curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>60,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_WRITEFUNCTION=>static function($h,string $s)use(&$out):int{if(strlen($out)+strlen($s)>262144)return 0;$out.=$s;return strlen($s);}]);
    if($auth)curl_setopt_array($ch,[CURLOPT_HTTPAUTH=>CURLAUTH_BASIC,CURLOPT_USERPWD=>'ChatGPT:'.$password]);
    if($body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($body,JSON_THROW_ON_ERROR));
    $ok=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);unset($ch);nfHttpAssert($ok!==false,'TRANSPORT_OUTCOME_UNKNOWN_NO_RETRY');
    try{$reply=json_decode($out,true,64,JSON_THROW_ON_ERROR);}catch(\JsonException $e){throw new RuntimeException('HTTP_JSON_INVALID_HTTP_'.$status);}
    nfHttpAssert(is_array($reply['ocs']['meta']??null) && is_array($reply['ocs']['data']??null),'HTTP_ENVELOPE_INVALID_HTTP_'.$status);
    return ['http'=>$status,'meta'=>$reply['ocs']['meta'],'data'=>$reply['ocs']['data']];
}
function nfSafeHttpSummary(array $r):string {
    $http=is_int($r['http']??null) && $r['http']>=100 && $r['http']<=599?$r['http']:0;
    $raw=$r['meta']['statuscode']??null;$ocs=(is_int($raw) || (is_string($raw) && preg_match('/^[0-9]{1,4}$/D',$raw))) && (int)$raw>=0 && (int)$raw<=9999?(int)$raw:0;
    $state=match($r['meta']['status']??null){'ok'=>'OK','failure'=>'FAILURE',default=>'OTHER'};
    $known=['AUTH_REQUIRED','PILOT_ACCOUNT_DENIED','PILOT_SCOPE_DENIED','PILOT_WRITE_DISABLED','READ_DENIED','UPDATE_DENIED','INVALID_PATCH','INVALID_EXPECTED_VERSION','VERSION_CONFLICT','UNKNOWN_PARAMETER','JSON_REQUIRED','TABLES_SOURCE_CHANGED','NOT_OWN_PILOT','PILOT_STRUCTURE_CHANGED','UNSUPPORTED_PILOT_COLUMN','ROW_TABLE_MISMATCH','AMBIGUOUS_CELL_STORAGE','LOCK_TIMEOUT','PILOT_RUNTIME_FAILURE','REGISTER_RUNTIME_FAILURE','REGISTER_WRITE_DISABLED','REGISTER_SCHEMA_CHANGED','NOT_OWN_REGISTER'];
    $error=$r['data']['error']??null;$code=in_array($error,$known,true)?$error:'NONE_OR_UNRECOGNIZED';
    return 'HTTP_'.$http.'_OCS_'.$ocs.'_STATUS_'.$state.'_BRIDGE_'.$code;
}
function nfSuccess(array $r):array{nfHttpAssert($r['http']===200 && ($r['meta']['status']??null)==='ok' && in_array((int)($r['meta']['statuscode']??0),[100,200],true),'HTTP_SUCCESS_NOT_CONFIRMED_'.nfSafeHttpSummary($r));return $r['data'];}
function nfRejection(array $r,int $status,string $code):void{nfHttpAssert($r['http']===$status && ($r['data']['error']??null)===$code && ($r['data']['committed']??null)===false,'EXPECTED_REJECTION_FAILED');}
function nfRecord(array $r,array $values,string $id):void{nfHttpAssert(($r['account']??null)==='ChatGPT' && ($r['protocol']??null)===1 && ($r['bridgeVersion']??null)==='0.2.0' && ($r['registerOnly']??null)===true && preg_match('/^[a-f0-9]{64}$/D',$r['serverVersion']??'') && is_array($r['record']??null),'REGISTER_READBACK_INVALID');foreach(array_merge($values,['documentId'=>$id]) as $key=>$value)nfHttpAssert(($r['record'][$key]??null)===$value,'REGISTER_VALUE_MISMATCH');}
$original=json_decode(<<<'OLD'
__OLD_MANIFEST__
OLD,true,512,JSON_THROW_ON_ERROR);
$payload=json_decode(<<<'NEW'
__NEW_PAYLOAD__
NEW,true,512,JSON_THROW_ON_ERROR);
$fixture=base64_decode('__FIXTURE_BASE64__',true);
$step='Start';$password='';$users=null;$previous=null;$db=null;$active=null;$backup=null;$stage=null;$changed=[];$installed=false;$success=false;$config=null;$lock=null;$registerConfigTouched=false;
try {
    require getcwd().'/lib/base.php';
    $apps=\OC::$server->get(\OCP\App\IAppManager::class);$config=\OC::$server->get(\OCP\IConfig::class);$users=\OC::$server->get(\OCP\IUserSession::class);$previous=$users->getUser();
    $user=\OC::$server->get(\OCP\IUserManager::class)->get('ChatGPT');nfHttpAssert($user!==null && $apps->isEnabledForUser('novaforge_tables',$user),'BRIDGE_ACCOUNT_UNAVAILABLE');
    $active=$apps->getAppPath('novaforge_tables');nfHttpAssert(!is_link($active) && is_writable($active),'APP_NOT_WRITABLE');
    $lock=fopen(sys_get_temp_dir().'/novaforge-intake-install-'.hash('sha256',$active).'.lock','c');nfHttpAssert(is_resource($lock) && flock($lock,LOCK_EX|LOCK_NB),'INSTALL_ALREADY_RUNNING');
    if($config->getAppValue('novaforge_tables','installed_version','')==='0.2.0'){
        foreach($payload as $path=>$bytes)nfHttpAssert(is_file($active.'/'.$path) && hash_equals(hash('sha256',$bytes),hash_file('sha256',$active.'/'.$path)?:''),'INSTALLED_SOURCE_CHANGED');
        nfHttpAssert($config->getAppValue('novaforge_tables','register_selftest_passed','0')==='1','PREVIOUS_INSTALL_REQUIRES_STATE_REVIEW');
        echo "BEREITS ABGENOMMEN: Registerinstallation nicht wiederholt.\n";exit(0);
    }
    nfHttpAssert($apps->getAppVersion('novaforge_tables')==='0.1.1' && $config->getAppValue('novaforge_tables','installed_version','')==='0.1.1' && $config->getAppValue('novaforge_tables','register_schema','')==='' && $apps->getAppVersion('tables')==='2.3.1','BASELINE_CHANGED');
    foreach($original as $path=>$hash)nfHttpAssert(!is_link($active.'/'.$path) && is_file($active.'/'.$path) && hash_equals($hash,hash_file('sha256',$active.'/'.$path)?:''),'ORIGINAL_SOURCE_CHANGED');
    foreach($payload as $path=>$bytes)if(!isset($original[$path]))nfHttpAssert(!file_exists($active.'/'.$path),'NEW_SOURCE_ALREADY_EXISTS');
    $step='Bestehende Anmeldung';$password=nfInputPassword();$pilotBefore=nfSuccess(nfRequest($password,'GET','/ocs/v2.php/apps/novaforge_tables/api/v1/pilot/tables/6/rows/41/version'));
    nfHttpAssert(($pilotBefore['account']??null)==='ChatGPT' && ($pilotBefore['row']['id']??null)===41,'CURRENT_ACCOUNT_NOT_CONFIRMED');echo "PASS 1: Bestehendes Konto und unveraenderte Pilotbruecke erreichbar.\n";
    $step='Staging';$stage=dirname($active).'/.novaforge-intake-stage-'.bin2hex(random_bytes(6));nfHttpAssert(mkdir($stage,0700),'STAGE_FAILED');
    foreach($payload as $path=>$bytes){if(!is_dir(dirname($stage.'/'.$path)))nfHttpAssert(mkdir(dirname($stage.'/'.$path),0700,true),'STAGE_DIRECTORY_FAILED');nfHttpAssert(file_put_contents($stage.'/'.$path,$bytes,LOCK_EX)===strlen($bytes),'STAGE_WRITE_FAILED');if(str_ends_with($path,'.php'))nfHttpLint($stage.'/'.$path);}
    $xml=simplexml_load_string(file_get_contents($stage.'/appinfo/info.xml'),SimpleXMLElement::class,LIBXML_NONET);nfHttpAssert($xml!==false && (string)$xml->version==='0.2.0','METADATA_FAILED');nfHttpAssert(count((require $stage.'/appinfo/routes.php')['ocs']??[])===8,'ROUTES_FAILED');
    $step='Sicherung';$dataDir=$config->getSystemValue('datadirectory','');nfHttpAssert(is_string($dataDir) && is_dir($dataDir),'BACKUP_ROOT_UNAVAILABLE');$backup=$dataDir.'/novaforge-system-backups/intake-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4));nfHttpAssert(mkdir($backup,0700,true),'BACKUP_FAILED');
    foreach($original as $path=>$hash){if(!is_dir(dirname($backup.'/'.$path)))nfHttpAssert(mkdir(dirname($backup.'/'.$path),0700,true),'BACKUP_DIRECTORY_FAILED');nfHttpAssert(copy($active.'/'.$path,$backup.'/'.$path) && hash_equals($hash,hash_file('sha256',$backup.'/'.$path)?:''),'BACKUP_HASH_FAILED');}
    $seal=['from'=>'0.1.1','to'=>'0.2.0','old'=>$original,'new'=>array_map(fn($s)=>hash('sha256',$s),$payload),'enabled'=>$config->getAppValue('novaforge_tables','enabled','')];file_put_contents($backup.'/manifest.json',json_encode($seal,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);echo "SICHERUNG / BERICHT: ",$backup,"\n";
    $step='Private Registeranlage';$users->setUser($user);\OC_App::loadApp('tables');$db=\OC::$server->get(\OCP\IDBConnection::class)->getInner();nfHttpAssert(!$db->inTransaction(),'OUTER_TRANSACTION_ACTIVE');
    require $stage.'/lib/Service/RegisterWriteService.php';$container=(new \OCA\Tables\AppInfo\Application())->getContainer();$tables=$container->get(\OCA\Tables\Service\TableService::class);$columns=$container->get(\OCA\Tables\Service\ColumnService::class);
    foreach($tables->findAll('ChatGPT',false,false,false) as $existing)nfHttpAssert($existing->getTitle()!==\OCA\NovaforgeTables\Service\RegisterWriteService::TITLE,'REGISTER_ALREADY_EXISTS_REVIEW');
    $db->beginTransaction();try{$table=$tables->create(\OCA\NovaforgeTables\Service\RegisterWriteService::TITLE,'custom',null,'Privates Dokumentregister. Quellenfelder unveraenderlich; keine echte Akte in der Abnahme.','ChatGPT');$schema=['tableId'=>$table->getId(),'columns'=>[]];foreach(\OCA\NovaforgeTables\Service\RegisterWriteService::FIELDS as $field){$dto=new \OCA\Tables\Dto\Column(title:$field,type:'text',subtype:'line',mandatory:false,textMaxLength:2048,textUnique:false);$schema['columns'][$field]=$columns->create('ChatGPT',$schema['tableId'],null,$dto)->getId();}nfHttpAssert($db->getTransactionNestingLevel()===1,'SETUP_TRANSACTION_ESCAPED');$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    file_put_contents($backup.'/register-schema.json',json_encode($schema,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);
    $registerConfigTouched=true;$config->setAppValue('novaforge_tables','register_schema',json_encode($schema,JSON_THROW_ON_ERROR));$config->setAppValue('novaforge_tables','register_http_enabled','0');
    $service=new \OCA\NovaforgeTables\Service\RegisterWriteService(\OC::$server->get(\OCP\IDBConnection::class),$apps,$config,$users);$status=$service->status();nfHttpAssert($status['tableId']===$schema['tableId'] && $status['writeEnabled']===false,'REGISTER_NATIVE_STATUS_FAILED');
    $step='App-Austausch';foreach($original as $path=>$hash)nfHttpAssert(hash_equals($hash,hash_file('sha256',$active.'/'.$path)?:''),'SOURCE_CHANGED_BEFORE_SWAP');foreach($payload as $path=>$bytes){if(!is_dir(dirname($active.'/'.$path)))nfHttpAssert(mkdir(dirname($active.'/'.$path),0755,true),'APP_DIRECTORY_FAILED');nfHttpReplace($active.'/'.$path,$bytes);$changed[]=$path;}
    $config->setAppValue('novaforge_tables','installed_version','0.2.0');foreach($payload as $path=>$bytes)nfHttpAssert(hash_equals(hash('sha256',$bytes),hash_file('sha256',$active.'/'.$path)?:''),'INSTALLED_HASH_FAILED');$installed=true;
    $config->setAppValue('novaforge_tables','register_http_enabled','1');echo "PASS 2: Registerstruktur mit 17 Textspalten angelegt; PHP85-Syntax und Quellstand geprueft.\n";
    $step='Eigene Testquelle';$folder=\OC::$server->get(\OCP\Files\IRootFolder::class)->getUserFolder('ChatGPT')->get('NOVAFORGE-Pilot');$name='Aufnahme-Abnahme-1.10.0.pdf';
    if($folder->nodeExists($name)){$file=$folder->get($name);nfHttpAssert(hash_equals(hash('sha256',$fixture),hash('sha256',$file->getContent())),'FIXTURE_PATH_OCCUPIED');}else{$file=$folder->newFile($name);$file->putContent($fixture);}
    $documentId='d34e0f20-7b6a-4f51-a08b-3c7e78af2c4a';$values=['sourceInstance'=>'https://cloud.example.invalid','sourceAccount'=>'ChatGPT','sourceFileId'=>(string)$file->getId(),'sourcePath'=>'/NOVAFORGE-Pilot/'.$name,'sourceEtag'=>'"'.trim($file->getEtag(),'"').'"','sha256'=>hash('sha256',$fixture),'role'=>'synthetische Abnahme','originDocumentId'=>'','aktenzeichen'=>'TEST','vorgang'=>'Technischer Aufnahmeausbau','status'=>'Test angelegt','openQuestions'=>'','sizeBytes'=>(string)strlen($fixture),'pageCount'=>'3','receivedAtUtc'=>'2026-10-03T00:00:00Z','verification'=>'Eigene Testbytes und Quellenhash bestaetigt; lokale Sichtung im Entwicklungsbereich bestanden'];
    file_put_contents($backup.'/intended-record.json',json_encode(['documentId'=>$documentId,'values'=>$values],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),LOCK_EX);
    $path='/ocs/v2.php/apps/novaforge_tables/api/v1/register';$httpStatus=nfSuccess(nfRequest($password,'GET',$path.'/status'));nfHttpAssert(($httpStatus['columns']??null)===$schema['columns'] && ($httpStatus['writeEnabled']??null)===true,'REGISTER_HTTP_STATUS_FAILED');
    $unauth=nfRequest($password,'GET',$path.'/status',null,false);nfHttpAssert($unauth['http']===401 && in_array((int)($unauth['meta']['statuscode']??0),[401,997],true),'UNAUTHENTICATED_DENIAL_FAILED');
    $reply=nfSuccess(nfRequest($password,'POST',$path.'/records',['documentId'=>$documentId,'values'=>$values]));nfHttpAssert(($reply['status']??null)==='committed' && ($reply['committed']??null)===true && ($reply['readbackVerified']??null)===true,'CREATE_COMMIT_UNKNOWN_STOP');
    $before=nfSuccess(nfRequest($password,'GET',$path.'/documents/'.$documentId.'/version'));nfRecord($before,$values,$documentId);nfHttpAssert($before['serverVersion']===$reply['serverVersion'],'CREATE_HTTP_READBACK_MISMATCH');$rowId=$before['row']['id'];
    $again=nfSuccess(nfRequest($password,'POST',$path.'/records',['documentId'=>$documentId,'values'=>$values]));nfHttpAssert(($again['status']??null)==='already_present' && ($again['row']['id']??null)===$rowId && ($again['committed']??null)===false,'DUPLICATE_CREATE_FAILED');
    $different=$values;$different['role']='Nicht speichern';nfRejection(nfRequest($password,'POST',$path.'/records',['documentId'=>$documentId,'values'=>$different]),409,'DOCUMENT_ID_CONFLICT');echo "PASS 3: Authentifizierte Anlage, getrenntes Ruecklesen, idempotente Dokumentkennung, Konflikt und fehlende Anmeldung geprueft.\n";
    nfRejection(nfRequest($password,'PUT',$path.'/rows/'.$rowId,['expectedVersion'=>$before['serverVersion'],'values'=>['sourcePath'=>'/NICHT-SPEICHERN']]),400,'IMMUTABLE_SOURCE_FIELD');
    $change=nfSuccess(nfRequest($password,'PUT',$path.'/rows/'.$rowId,['expectedVersion'=>$before['serverVersion'],'values'=>['status'=>'Test bestanden']]));nfHttpAssert(($change['committed']??null)===true && ($change['readbackVerified']??null)===true,'UPDATE_COMMIT_UNKNOWN_STOP');$values['status']='Test bestanden';$after=nfSuccess(nfRequest($password,'GET',$path.'/rows/'.$rowId.'/version'));nfRecord($after,$values,$documentId);nfHttpAssert($after['serverVersion']===$change['serverVersion'],'UPDATE_HTTP_READBACK_MISMATCH');
    nfRejection(nfRequest($password,'PUT',$path.'/rows/'.$rowId,['expectedVersion'=>$before['serverVersion'],'values'=>['status'=>'Veraltet - NICHT SPEICHERN']]),409,'VERSION_CONFLICT');$final=nfSuccess(nfRequest($password,'GET',$path.'/rows/'.$rowId.'/version'));nfRecord($final,$values,$documentId);nfHttpAssert($final['serverVersion']===$after['serverVersion'],'CONFLICT_CHANGED_ROW');
    $pilotAfter=nfSuccess(nfRequest($password,'GET','/ocs/v2.php/apps/novaforge_tables/api/v1/pilot/tables/6/rows/41/version'));nfHttpAssert($pilotAfter['serverVersion']===$pilotBefore['serverVersion'] && $pilotAfter['row']===$pilotBefore['row'],'LEGACY_PILOT_CHANGED');echo "PASS 4: Bedingte Aenderung, Quellenfeldschutz, veraltete Version und unveraenderte alte Pilotzeile bestaetigt.\n";
    file_put_contents($backup.'/passed.json',json_encode(['register'=>$final,'source'=>$values,'pilotUnchanged'=>true],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),LOCK_EX);
    $config->setAppValue('novaforge_tables','register_selftest_passed','1');$success=true;echo "ENDE: Register-HTTP-Abnahme bestanden. Eine eigene synthetische PDF und ein Testeintrag bleiben erhalten. Keine echte Akte aufgenommen.\n";echo "REGISTER: Tabelle ",$schema['tableId'],", Zeile ",$rowId,"\n";echo "PDF-TESTQUELLE: ",$values['sourcePath'],", Datei-ID ",$values['sourceFileId'],", ETag ",$values['sourceEtag'],"\n";echo "NOCH: Neuer Connector-Schreibzugriff und Live-Werkzeugabnahme; danach Aktenaufnahme im richtigen Projekt.\n";
} catch(Throwable $e) {
    if($config && !$success && $registerConfigTouched){try{$config->setAppValue('novaforge_tables','register_http_enabled','0');}catch(Throwable $x){}}
    if(!$installed && $changed && $backup && $active){foreach(array_reverse($changed) as $path){if(isset($original[$path]))nfHttpReplace($active.'/'.$path,file_get_contents($backup.'/'.$path));elseif(is_file($active.'/'.$path))unlink($active.'/'.$path);}if($config)$config->setAppValue('novaforge_tables','installed_version','0.1.1');}
    $code=$e instanceof RuntimeException && preg_match('/^[A-Z0-9_]+$/D',$e->getMessage())?$e->getMessage():'RUNTIME_FAILURE';
    $state=$registerConfigTouched?'Registerschreiben deaktiviert; nicht blind wiederholen.':'Keine Registerkonfiguration oder Registerdaten durch diesen Lauf geaendert.';
    fwrite(STDERR,"STOPP bei ".$step.": ".$code.". ".$state.($backup?' Bericht: '.$backup:' Kein Berichtverzeichnis angelegt.')."\n");if($backup)file_put_contents($backup.'/stop.json',json_encode(['step'=>$step,'code'=>$code,'installed'=>$installed,'registerConfigurationTouched'=>$registerConfigTouched],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);
} finally {
    $password='';if($db && $db->inTransaction())$db->rollBack();if($users)$users->setUser($previous);if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}if($stage && is_dir($stage)){foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($stage,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $entry){if($entry->isDir())rmdir($entry->getPathname());else unlink($entry->getPathname());}rmdir($stage);}
}
exit($success?0:1);
