<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
if(PHP_SAPI!=='cli' || !in_array('--install-and-test',$argv,true) || !is_file(getcwd().'/lib/base.php') || !extension_loaded('curl')){fwrite(STDERR,"STOPP: Nextcloud-Hauptordner, PHP CLI und --install-and-test erforderlich.\n");exit(1);}
define('OC_CONSOLE',true);
__HELPERS__
$original=json_decode(<<<'OLD'
__OLD_MANIFEST__
OLD,true,512,JSON_THROW_ON_ERROR);
$payload=json_decode(<<<'NEW'
__NEW_PAYLOAD__
NEW,true,512,JSON_THROW_ON_ERROR);
$step='Start';$success=false;$swapped=false;$changed=[];$active=null;$backup=null;$stage=null;$db=null;$users=null;$previous=null;$config=null;$password='';$lock=null;$journalCreated=false;
try{
    require getcwd().'/lib/base.php';
    $apps=\OC::$server->get(\OCP\App\IAppManager::class);$config=\OC::$server->get(\OCP\IConfig::class);$users=\OC::$server->get(\OCP\IUserSession::class);$previous=$users->getUser();
    $user=\OC::$server->get(\OCP\IUserManager::class)->get('ChatGPT');$soul=\OC::$server->get(\OCP\IUserManager::class)->get('Soul');
    nfHttpAssert($user!==null && $soul!==null && $apps->isEnabledForUser('novaforge_tables',$user),'ACCOUNTS_UNAVAILABLE');
    $active=$apps->getAppPath('novaforge_tables');nfHttpAssert(is_writable($active) && !is_link($active),'APP_NOT_WRITABLE');
    $lock=fopen(sys_get_temp_dir().'/novaforge-general-install-'.hash('sha256',$active).'.lock','c');nfHttpAssert(is_resource($lock) && flock($lock,LOCK_EX|LOCK_NB),'INSTALL_ALREADY_RUNNING');
    $installed=$config->getAppValue('novaforge_tables','installed_version','');
    if($installed==='0.3.0'){
        foreach($payload as $path=>$bytes)nfHttpAssert(hash_equals(hash('sha256',$bytes),hash_file('sha256',$active.'/'.$path)?:''),'INSTALLED_SOURCE_CHANGED');
        nfHttpAssert($config->getAppValue('novaforge_tables','general_selftest_passed','0')==='1' && $config->getAppValue('novaforge_tables','general_http_enabled','0')==='1','PREVIOUS_INSTALL_REQUIRES_STATE_REVIEW');echo "BEREITS ABGENOMMEN: Installation nicht wiederholt.\n";exit(0);
    }
    nfHttpAssert($installed==='0.2.0' && $apps->getAppVersion('tables')==='2.3.1' && $config->getAppValue('novaforge_tables','register_selftest_passed','0')==='1','BASELINE_CHANGED');
    foreach($original as $path=>$hash)nfHttpAssert(!is_link($active.'/'.$path) && is_file($active.'/'.$path) && hash_equals($hash,hash_file('sha256',$active.'/'.$path)?:''),'ORIGINAL_SOURCE_CHANGED');
    foreach($payload as $path=>$bytes)if(!isset($original[$path]))nfHttpAssert(!file_exists($active.'/'.$path),'NEW_SOURCE_ALREADY_EXISTS');
    $password=nfInputPassword();$pilotBefore=nfSuccess(nfRequest($password,'GET','/ocs/v2.php/apps/novaforge_tables/api/v1/pilot/tables/6/rows/41/version'));
    $registerBefore=nfSuccess(nfRequest($password,'GET','/ocs/v2.php/apps/novaforge_tables/api/v1/register/status'));
    nfHttpAssert(($pilotBefore['account']??null)==='ChatGPT' && ($registerBefore['hostSelftestPassed']??null)===true,'EXISTING_HTTP_ACCESS_FAILED');
    $step='Staging';$stage=dirname($active).'/.novaforge-general-stage-'.bin2hex(random_bytes(6));nfHttpAssert(mkdir($stage,0700),'STAGE_FAILED');
    foreach($payload as $path=>$bytes){if(!is_dir(dirname($stage.'/'.$path)))nfHttpAssert(mkdir(dirname($stage.'/'.$path),0700,true),'STAGE_DIRECTORY_FAILED');nfHttpAssert(file_put_contents($stage.'/'.$path,$bytes,LOCK_EX)===strlen($bytes),'STAGE_WRITE_FAILED');if(str_ends_with($path,'.php'))nfHttpLint($stage.'/'.$path);}
    $xml=simplexml_load_string(file_get_contents($stage.'/appinfo/info.xml'),SimpleXMLElement::class,LIBXML_NONET);nfHttpAssert($xml!==false && (string)$xml->version==='0.3.0' && count((require $stage.'/appinfo/routes.php')['ocs']??[])===13,'METADATA_FAILED');
    $dataDir=$config->getSystemValue('datadirectory','');nfHttpAssert(is_string($dataDir) && is_dir($dataDir),'BACKUP_ROOT_UNAVAILABLE');$backup=$dataDir.'/novaforge-system-backups/general-tables-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4));nfHttpAssert(mkdir($backup,0700,true),'BACKUP_FAILED');
    foreach($original as $path=>$hash){if(!is_dir(dirname($backup.'/'.$path)))nfHttpAssert(mkdir(dirname($backup.'/'.$path),0700,true),'BACKUP_DIRECTORY_FAILED');nfHttpAssert(copy($active.'/'.$path,$backup.'/'.$path) && hash_equals($hash,hash_file('sha256',$backup.'/'.$path)?:''),'BACKUP_HASH_FAILED');}
    file_put_contents($backup.'/manifest.json',json_encode(['old'=>$original,'new'=>array_map(fn($s)=>hash('sha256',$s),$payload),'register'=>$registerBefore],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);echo "SICHERUNG / BERICHT: ",$backup,"\n";
    $step='Transaktionsjournal';$adapter=\OC::$server->get(\OCP\IDBConnection::class);nfHttpAssert($adapter instanceof \OC\DB\ConnectionAdapter,'DB_ADAPTER_UNSUPPORTED');$db=$adapter->getInner();nfHttpAssert(!$db->inTransaction() && $config->getSystemValue('dbtype','')==='mysql','DB_BASELINE_CHANGED');
    $prefix=$config->getSystemValue('dbtableprefix','oc_');nfHttpAssert(is_string($prefix) && preg_match('/^[a-zA-Z0-9_]+$/D',$prefix),'INVALID_DB_PREFIX');$journal=$prefix.'novaforge_tables_requests';
    $schema=$config->getSystemValue('dbname','');$r=$db->executeQuery('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',[$schema,$journal]);try{$exists=(int)$r->fetchOne();}finally{$r->free();}nfHttpAssert($exists===0,'JOURNAL_ALREADY_EXISTS_REVIEW');
    $db->executeStatement('CREATE TABLE `'.$journal.'` (request_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,result_json MEDIUMTEXT NOT NULL,PRIMARY KEY(request_id)) ENGINE=InnoDB');$journalCreated=true;
    $users->setUser($user);\OC_App::loadApp('tables');require $stage.'/lib/Service/GeneralWriteService.php';
    $service=new \OCA\NovaforgeTables\Service\GeneralWriteService($adapter,$apps,$config,$users);$service->status();
    $step='App-Austausch';foreach($original as $path=>$hash)nfHttpAssert(hash_equals($hash,hash_file('sha256',$active.'/'.$path)?:''),'SOURCE_CHANGED_BEFORE_SWAP');
    foreach($payload as $path=>$bytes){if(!is_dir(dirname($active.'/'.$path)))nfHttpAssert(mkdir(dirname($active.'/'.$path),0755,true),'APP_DIRECTORY_FAILED');nfHttpReplace($active.'/'.$path,$bytes);$changed[]=$path;}
    $config->setAppValue('novaforge_tables','installed_version','0.3.0');$swapped=true;$config->setAppValue('novaforge_tables','general_selftest_passed','0');$config->setAppValue('novaforge_tables','general_http_enabled','1');
    echo "PASS 1: Serverquellen, Syntax, Sicherung und atomarer Schreibbeleg vorbereitet.\n";
    $step='HTTP-Abnahme';$path='/ocs/v2.php/apps/novaforge_tables/api/v1/general';$status=nfSuccess(nfRequest($password,'GET',$path.'/status'));nfHttpAssert(($status['bridgeVersion']??null)==='0.3.0' && ($status['writeEnabled']??null)===true,'GENERAL_HTTP_STATUS_FAILED');
    $unauth=nfRequest($password,'GET',$path.'/status',null,false);nfHttpAssert($unauth['http']===401,'UNAUTHENTICATED_DENIAL_FAILED');
    $counter=0;$seed=bin2hex(random_bytes(10));$requestId=static function()use(&$counter,$seed):string{$h=hash('sha256',$seed.':'.(++$counter));return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20,12);};
    $createId=$requestId();$createBody=['action'=>'create_table','requestId'=>$createId,'payload'=>['title'=>'NOVAFORGE Tabellen-Abnahme '.gmdate('Ymd-His'),'description'=>'Eigene synthetische Testdaten; allgemeine Tabellenfunktionen.','columns'=>[['title'=>'Notiz','type'=>'text','subtype'=>'line'],['title'=>'Betrag','type'=>'number','numberDecimals'=>2],['title'=>'Tag','type'=>'datetime','subtype'=>'date'],['title'=>'Erledigt','type'=>'selection','subtype'=>'check']]]];
    file_put_contents($backup.'/intended-create.json',json_encode($createBody,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);
    $created=nfSuccess(nfRequest($password,'POST',$path.'/write',$createBody));nfHttpAssert(($created['committed']??null)===true && ($created['readbackVerified']??null)===true,'TABLE_CREATE_OUTCOME_UNKNOWN_STOP');$tableId=$created['tableId'];
    $structure=nfSuccess(nfRequest($password,'GET',$path.'/tables/'.$tableId.'/structure'));nfHttpAssert($structure['serverVersion']===$created['serverVersion'] && count($structure['columns'])===4,'TABLE_READBACK_FAILED');
    $duplicate=nfSuccess(nfRequest($password,'POST',$path.'/write',$createBody));nfHttpAssert(($duplicate['status']??null)==='already_committed' && ($duplicate['tableId']??null)===$tableId && ($duplicate['committed']??null)===false,'DUPLICATE_CREATE_FAILED');
    $conflict=$createBody;$conflict['payload']['title']='NICHT SPEICHERN';nfRejection(nfRequest($password,'POST',$path.'/write',$conflict),409,'REQUEST_ID_CONFLICT');
    $container=(new \OCA\Tables\AppInfo\Application())->getContainer();$rights=$container->get(\OCA\Tables\Service\PermissionsService::class);nfHttpAssert($rights->canReadRowsByElementId($tableId,'table','Soul') && $rights->canUpdateRowsByTableId($tableId,'Soul'),'SOUL_ACCESS_FAILED');
    echo "PASS 2: Freie Tabelle, vier Spaltentypen, Soul-Freigabe und doppelsichere Anlage bestaetigt.\n";
    $cols=[];foreach($structure['columns'] as $c)$cols[$c['title']]=(int)$c['id'];
    $newRow=nfSuccess(nfRequest($password,'POST',$path.'/write',['action'=>'create_row','requestId'=>$requestId(),'payload'=>['tableId'=>$tableId,'expectedVersion'=>$structure['serverVersion'],'data'=>[['columnId'=>$cols['Notiz'],'value'=>'Angelegt'],['columnId'=>$cols['Betrag'],'value'=>12.5],['columnId'=>$cols['Tag'],'value'=>'2026-10-03'],['columnId'=>$cols['Erledigt'],'value'=>false]]]]));nfHttpAssert(($newRow['committed']??null)===true,'ROW_CREATE_OUTCOME_UNKNOWN_STOP');$rowId=$newRow['row']['id'];
    $before=nfSuccess(nfRequest($password,'GET',$path.'/tables/'.$tableId.'/rows/'.$rowId.'/version'));$rowChanged=nfSuccess(nfRequest($password,'POST',$path.'/write',['action'=>'update_row','requestId'=>$requestId(),'payload'=>['tableId'=>$tableId,'rowId'=>$rowId,'expectedVersion'=>$before['serverVersion'],'data'=>[['columnId'=>$cols['Notiz'],'value'=>'Bearbeitet']]]]));nfHttpAssert(($rowChanged['committed']??null)===true && ($rowChanged['readbackVerified']??null)===true,'ROW_UPDATE_OUTCOME_UNKNOWN_STOP');
    $after=nfSuccess(nfRequest($password,'GET',$path.'/tables/'.$tableId.'/rows/'.$rowId.'/version'));$beforeData=array_column($before['row']['data'],'value','columnId');$afterData=array_column($after['row']['data'],'value','columnId');nfHttpAssert(($afterData[$cols['Notiz']]??null)==='Bearbeitet' && $after['serverVersion']===$rowChanged['serverVersion'],'ROW_READBACK_FAILED');foreach($beforeData as $id=>$v)if((int)$id!==$cols['Notiz'])nfHttpAssert(($afterData[$id]??null)===$v,'UNTOUCHED_CELL_CHANGED');
    nfRejection(nfRequest($password,'POST',$path.'/write',['action'=>'update_row','requestId'=>$requestId(),'payload'=>['tableId'=>$tableId,'rowId'=>$rowId,'expectedVersion'=>$before['serverVersion'],'data'=>[['columnId'=>$cols['Notiz'],'value'=>'NICHT SPEICHERN']]]]),409,'VERSION_CONFLICT');
    $fresh=nfSuccess(nfRequest($password,'GET',$path.'/tables/'.$tableId.'/structure'));$add=nfSuccess(nfRequest($password,'POST',$path.'/write',['action'=>'create_column','requestId'=>$requestId(),'payload'=>['tableId'=>$tableId,'expectedVersion'=>$fresh['serverVersion'],'column'=>['title'=>'Zusatz','type'=>'text','subtype'=>'line']]]));nfHttpAssert(($add['committed']??null)===true && count($add['columns'])===5,'COLUMN_CREATE_FAILED');
    $rename=nfSuccess(nfRequest($password,'POST',$path.'/write',['action'=>'update_column','requestId'=>$requestId(),'payload'=>['tableId'=>$tableId,'columnId'=>$add['columnId'],'expectedVersion'=>$add['serverVersion'],'title'=>'Kommentar']]));nfHttpAssert(($rename['committed']??null)===true,'COLUMN_UPDATE_FAILED');
    $metadata=nfSuccess(nfRequest($password,'POST',$path.'/write',['action'=>'update_table','requestId'=>$requestId(),'payload'=>['tableId'=>$tableId,'expectedVersion'=>$rename['serverVersion'],'description'=>'Allgemeine Tabellen-HTTP-Abnahme bestanden.']]));nfHttpAssert(($metadata['committed']??null)===true,'TABLE_UPDATE_FAILED');
    $lookup=nfSuccess(nfRequest($password,'GET',$path.'/operations/'.$createId));nfHttpAssert(($lookup['found']??null)===true && ($lookup['result']['tableId']??null)===$tableId,'OPERATION_LOOKUP_FAILED');
    foreach([6,$registerBefore['tableId']] as $protected)nfRejection(nfRequest($password,'GET',$path.'/tables/'.$protected.'/structure'),403,'PROTECTED_TABLE');
    $pilotAfter=nfSuccess(nfRequest($password,'GET','/ocs/v2.php/apps/novaforge_tables/api/v1/pilot/tables/6/rows/41/version'));$registerAfter=nfSuccess(nfRequest($password,'GET','/ocs/v2.php/apps/novaforge_tables/api/v1/register/status'));nfHttpAssert($pilotBefore['serverVersion']===$pilotAfter['serverVersion'] && $registerBefore===$registerAfter,'LEGACY_BRIDGES_CHANGED');
    file_put_contents($backup.'/passed.json',json_encode(['tableId'=>$tableId,'rowId'=>$rowId,'table'=>$metadata,'row'=>$after,'soulVisible'=>true,'staleRejected'=>true,'legacyUnchanged'=>true],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);
    $config->setAppValue('novaforge_tables','general_selftest_passed','1');$success=true;echo "PASS 3: Datensatzanlage/-aenderung, Spaltenanlage/-titel, Tabellenbeschreibung, Konfliktschutz und alte Bruecken bestaetigt.\nENDE: Allgemeine Tabellen-HTTP-Abnahme bestanden.\nTESTTABELLE: ",$tableId,", TESTZEILE: ",$rowId,"\n";
}catch(Throwable $e){
    if($config && $swapped && !$success)$config->setAppValue('novaforge_tables','general_http_enabled','0');
    if(!$swapped && $changed && $active && $backup)foreach(array_reverse($changed) as $p){if(isset($original[$p]))nfHttpReplace($active.'/'.$p,file_get_contents($backup.'/'.$p));elseif(is_file($active.'/'.$p))unlink($active.'/'.$p);}
    $code=$e instanceof RuntimeException && preg_match('/^[A-Z0-9_]+$/D',$e->getMessage())?$e->getMessage():'NATIVE_OR_RUNTIME_FAILURE';
    fwrite(STDERR,'STOPP bei '.$step.': '.$code.'. Allgemeines Schreiben nicht freigegeben; vorhandenes Register bleibt erhalten. Nicht blind wiederholen.'.($backup?' Bericht: '.$backup:'')."\n");if($backup)file_put_contents($backup.'/stop.json',json_encode(['step'=>$step,'code'=>$code,'sourceSwapped'=>$swapped,'journalCreated'=>$journalCreated],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR),LOCK_EX);
}finally{
    $password='';if($db && $db->inTransaction())$db->rollBack();if($users)$users->setUser($previous);if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}if($stage && is_dir($stage)){foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($stage,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $entry){if($entry->isDir())rmdir($entry->getPathname());else unlink($entry->getPathname());}rmdir($stage);}
}
exit($success?0:1);
