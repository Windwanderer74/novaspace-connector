<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
// Historical installation-specific source: default disabled before bootstrap or input.
if (getenv('NOVASPACE_ENABLE_LEGACY_INSTANCE_SCRIPTS') !== 'I_REVIEWED_THE_SOURCE') { fwrite(STDERR, "STOP: Historical instance-bound script. Read LEGACY_OPS.md before enabling.\n"); exit(78); }

if(PHP_SAPI!=='cli' || !is_file(getcwd().'/lib/base.php')){fwrite(STDERR,"STOPP: PHP CLI im Nextcloud-Hauptordner erforderlich.\n");exit(1);}
define('OC_CONSOLE',true);
function nfShareCheck(bool $ok,string $code):void{if(!$ok)throw new RuntimeException($code);}
$users=null;$previous=null;$db=null;$lock=null;$created=false;$committed=false;
try{
    require getcwd().'/lib/base.php';
    $apps=\OC::$server->get(\OCP\App\IAppManager::class);$config=\OC::$server->get(\OCP\IConfig::class);
    $users=\OC::$server->get(\OCP\IUserSession::class);$previous=$users->getUser();$manager=\OC::$server->get(\OCP\IUserManager::class);
    $owner=$manager->get('ChatGPT');$recipient=$manager->get('Soul');nfShareCheck($owner!==null && $recipient!==null && $owner->getUID()==='ChatGPT' && $recipient->getUID()==='Soul' && $recipient->isEnabled(),'ACCOUNT_NOT_CONFIRMED');
    nfShareCheck($apps->getAppVersion('tables')==='2.3.1' && $apps->isEnabledForUser('tables',$owner) && $apps->isEnabledForUser('tables',$recipient) && $config->getAppValue('novaforge_tables','installed_version','')==='0.2.0' && $config->getAppValue('novaforge_tables','register_selftest_passed','0')==='1','ACCEPTED_REGISTER_REQUIRED');
    $schema=json_decode($config->getAppValue('novaforge_tables','register_schema',''),true,64,JSON_THROW_ON_ERROR);nfShareCheck(($schema['tableId']??null)===7 && ($schema['columns']['documentId']??null)===29 && ($schema['columns']['verification']??null)===45 && count($schema['columns']??[])===17,'REGISTER_CHANGED');
    $path=$apps->getAppPath('tables');foreach(['lib/Service/ShareService.php'=>'0aa24616a4665295be9b617a06897ce2856e375adc441e9d6702d42aa9d6c0c2','lib/Service/ValueObject/ShareCreate.php'=>'fc02dea336b4b7b5c9c5e8f80868d7f591a1173242a47e00eec823766b6140e3','lib/Controller/ShareController.php'=>'28ff7ef32dccd5b9979b220c1933a9dcb08c629e623126b7001a6ba73b005431'] as $file=>$hash)nfShareCheck(is_file($path.'/'.$file) && !is_link($path.'/'.$file) && hash_equals($hash,hash_file('sha256',$path.'/'.$file)?:''),'TABLES_SHARING_SOURCE_CHANGED');
    $lock=fopen(sys_get_temp_dir().'/novaforge-register-share-'.hash('sha256',getcwd()).'.lock','c');nfShareCheck(is_resource($lock) && flock($lock,LOCK_EX|LOCK_NB),'SHARE_ALREADY_RUNNING');
    $users->setUser($owner);\OC_App::loadApp('tables');$container=(new \OCA\Tables\AppInfo\Application())->getContainer();
    $tables=$container->get(\OCA\Tables\Service\TableService::class);$shares=$container->get(\OCA\Tables\Service\ShareService::class);
    $table=$tables->find(7,true,'ChatGPT');nfShareCheck($table->getOwnership()==='ChatGPT' && $table->getTitle()==='NOVAFORGE Dokumentregister / 1' && !$table->getArchived(),'REGISTER_OWNERSHIP_CHANGED');
    $find=static function()use($shares):array{return array_values(array_filter($shares->findAll('table',7,'ChatGPT',false),static fn($s)=>$s->getReceiver()==='Soul' && $s->getReceiverType()===\OCA\Tables\Constants\ShareReceiverType::USER));};
    $before=$find();nfShareCheck(count($before)<=1,'MULTIPLE_SOUL_SHARES');
    $db=\OC::$server->get(\OCP\IDBConnection::class)->getInner();nfShareCheck(!$db->inTransaction(),'OUTER_TRANSACTION_ACTIVE');
    if(!$before){
        $db->beginTransaction();$created=true;
        $shares->create(new \OCA\Tables\Service\ValueObject\ShareCreate(nodeId:7,nodeType:'table',receiver:'Soul',receiverType:\OCA\Tables\Constants\ShareReceiverType::USER,permissionRead:true,permissionCreate:false,permissionUpdate:false,permissionDelete:false,permissionManage:false,displayMode:0));
        $during=$find();nfShareCheck(count($during)===1 && $during[0]->getPermissionRead() && !$during[0]->getPermissionCreate() && !$during[0]->getPermissionUpdate() && !$during[0]->getPermissionDelete() && !$during[0]->getPermissionManage(),'SHARE_BEFORE_COMMIT_FAILED');
        $db->commit();$committed=true;
    }
    $after=$find();nfShareCheck(count($after)===1 && $after[0]->getPermissionRead(),'SHARE_READBACK_FAILED');
    nfShareCheck($tables->find(7,true,'Soul')->getId()===7,'SOUL_TABLE_READ_NOT_CONFIRMED');
    echo 'PASS: Dokumentregister Tabelle 7 fuer Konto Soul lesbar. Freigabe-ID ',$after[0]->getId(),'. ',($created?'Neue Freigabe: nur Lesen.':'Bestehende Freigabe unveraendert erhalten.'),"\n";
}catch(Throwable $e){
    if($db && $db->inTransaction())$db->rollBack();
    $code=$e instanceof RuntimeException && preg_match('/^[A-Z0-9_]+$/D',$e->getMessage())?$e->getMessage():'SHARE_RUNTIME_FAILURE';
    fwrite(STDERR,'STOPP: '.$code.'. '.($committed?'Freigabe wurde committed; Rueckpruefung offen.':($created?'Anlage versucht; Commit bei Verbindungsabbruch unklar.':'Keine Freigabeanlage versucht.'))." Nicht blind wiederholen.\n");exit(1);
}finally{if($users)$users->setUser($previous);if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}}
