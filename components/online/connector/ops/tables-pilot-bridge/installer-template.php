<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Upgrade only the exact existing read bridge. No test-table creation or row writes. */
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || !in_array('--install-pilot-http',$argv,true) || !is_file(getcwd().'/lib/base.php')) {
    fwrite(STDERR,"STOPP: Im Nextcloud-Hauptordner per PHP CLI mit --install-pilot-http ausfuehren.\n"); exit(1);
}
define('OC_CONSOLE',true);
function nfHttpAssert(bool $ok,string $code): void { if (!$ok) throw new RuntimeException($code); }
function nfHttpLint(string $path): void {
    $pipes=[]; $proc=proc_open([PHP_BINARY,'-l',$path],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
    nfHttpAssert(is_resource($proc),'LINT_UNAVAILABLE'); fclose($pipes[0]);
    stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false);
    $deadline=microtime(true)+15; $size=0; $exit=null;
    try {
        while (true) {
            $size+=strlen(stream_get_contents($pipes[1]))+strlen(stream_get_contents($pipes[2]));
            nfHttpAssert($size<32768,'LINT_OUTPUT_LIMIT');
            $status=proc_get_status($proc); if (!$status['running']) { $exit=$status['exitcode']; break; }
            nfHttpAssert(microtime(true)<$deadline,'LINT_TIMEOUT'); usleep(20000);
        }
    } finally {
        if (proc_get_status($proc)['running']) proc_terminate($proc,9);
        fclose($pipes[1]); fclose($pipes[2]); proc_close($proc);
    }
    nfHttpAssert($exit===0,'PHP_SYNTAX_FAILED');
}
function nfHttpReplace(string $path,string $source): void {
    nfHttpAssert(!is_link($path),'SYMLINK_TARGET');
    $temporary=$path.'.nf-http-'.bin2hex(random_bytes(5));
    try {
        nfHttpAssert(file_put_contents($temporary,$source,LOCK_EX)===strlen($source),'FILE_WRITE_FAILED');
        nfHttpAssert(chmod($temporary,0644) && rename($temporary,$path),'FILE_SWAP_FAILED');
        if (function_exists('opcache_invalidate')) opcache_invalidate($path,true);
    } finally { if (is_file($temporary)) unlink($temporary); }
}
$original=json_decode(<<<'NF_OLD'
__OLD_MANIFEST__
NF_OLD,true,512,JSON_THROW_ON_ERROR);
$payload=json_decode(<<<'NF_NEW'
__NEW_PAYLOAD__
NF_NEW,true,512,JSON_THROW_ON_ERROR);
$step='Bootstrap'; $exitStatus=0; $stage=null; $backup=null; $lock=null; $changed=[];
$config=null; $users=null; $previous=null; $active=null; $oldInstalled=null; $oldEnabled=null; $oldPilot=null;
try {
    require getcwd().'/lib/base.php';
    $step='Exakter bisheriger Brueckenstand';
    $apps=\OC::$server->get(\OCP\App\IAppManager::class);
    $config=\OC::$server->get(\OCP\IConfig::class);
    $users=\OC::$server->get(\OCP\IUserSession::class); $previous=$users->getUser();
    $user=\OC::$server->get(\OCP\IUserManager::class)->get('ChatGPT');
    nfHttpAssert($user!==null && $apps->isEnabledForUser('novaforge_tables',$user),'BRIDGE_USER_UNAVAILABLE');
    $active=$apps->getAppPath('novaforge_tables');
    $oldInstalled=$config->getAppValue('novaforge_tables','installed_version','');
    $oldEnabled=$config->getAppValue('novaforge_tables','enabled','');
    $oldPilot=$config->getAppValue('novaforge_tables','pilot_http_enabled','');
    nfHttpAssert($apps->getAppVersion('novaforge_tables')==='0.1.0' && $oldInstalled==='0.1.0'
        && $oldPilot==='' && !is_link($active) && is_writable($active),'BRIDGE_BASELINE_CHANGED');
    $lock=fopen(sys_get_temp_dir().'/novaforge-tables-http-'.hash('sha256',$active).'.lock','c');
    nfHttpAssert(is_resource($lock) && flock($lock,LOCK_EX|LOCK_NB),'INSTALL_ALREADY_RUNNING');
    foreach ($original as $path=>$hash) nfHttpAssert(!is_link($active.'/'.$path) && is_file($active.'/'.$path)
        && hash_equals($hash,hash_file('sha256',$active.'/'.$path) ?: ''),'ORIGINAL_SOURCE_CHANGED');
    foreach ($payload as $path=>$source) if (!isset($original[$path])) nfHttpAssert(!file_exists($active.'/'.$path) && !is_link($active.'/'.$path),'NEW_SOURCE_ALREADY_EXISTS');
    $step='Staging und native Syntaxpruefung';
    $stage=dirname($active).'/.novaforge-tables-http-stage-'.bin2hex(random_bytes(6));
    nfHttpAssert(mkdir($stage,0700),'STAGE_CREATE_FAILED');
    foreach ($payload as $path=>$source) {
        if (!is_dir(dirname($stage.'/'.$path))) nfHttpAssert(mkdir(dirname($stage.'/'.$path),0700,true),'STAGE_DIRECTORY_FAILED');
        nfHttpAssert(file_put_contents($stage.'/'.$path,$source,LOCK_EX)===strlen($source),'STAGE_WRITE_FAILED');
        if (str_ends_with($path,'.php')) nfHttpLint($stage.'/'.$path);
    }
    // Nextcloud blocks libxml's external loader, including the main XML file.
    // Read locally first; keep the loader restriction intact while parsing.
    $xmlSource=file_get_contents($stage.'/appinfo/info.xml');
    nfHttpAssert(is_string($xmlSource),'APP_METADATA_READ_FAILED');
    $xml=simplexml_load_string($xmlSource,SimpleXMLElement::class,LIBXML_NONET);
    nfHttpAssert($xml!==false && (string)$xml->version==='0.1.1','APP_METADATA_FAILED');
    $routes=require $stage.'/appinfo/routes.php';
    nfHttpAssert(count($routes['ocs']??[])===3,'ROUTES_FAILED');
    $step='Lesende Pilot- und Eingabevorpruefung';
    \OC_App::loadApp('tables'); $users->setUser($user);
    require $stage.'/lib/Service/PilotWriteService.php';
    require $stage.'/lib/Controller/PilotController.php';
    $db=\OC::$server->get(\OCP\IDBConnection::class);
    $service=new \OCA\NovaforgeTables\Service\PilotWriteService($db,$apps,$config,$users);
    $before=$service->read(6,41);
    nfHttpAssert(($before['account']??null)==='ChatGPT' && ($before['row']['id']??null)===41
        && ($before['row']['tableId']??null)===6 && preg_match('/^[a-f0-9]{64}$/D',$before['serverVersion']??''),'PILOT_READ_FAILED');
    $reflection=new ReflectionMethod($service,'patch');
    foreach ([[],[['columnId'=>999999,'value'=>'x']],[['columnId'=>26,'value'=>str_repeat('x',201)]],
        [['columnId'=>26,'value'=>'a'],['columnId'=>26,'value'=>'b']], [['columnId'=>26,'value'=>null]],
        [['columnId'=>26,'value'=>"x\ny"]],[['columnId'=>26,'value'=>'x','extra'=>true]], [['columnId'=>26,'value'=>"\xFF"]]] as $invalid) {
        $rejected=false; try { $reflection->invoke($service,$invalid); }
        catch (RuntimeException $e) { $rejected=$e->getMessage()==='INVALID_PATCH'; }
        nfHttpAssert($rejected,'INVALID_INPUT_ACCEPTED');
    }
    nfHttpAssert($reflection->invoke($service,[['columnId'=>26,'value'=>'Gueltiger Test']])===[26=>'Gueltiger Test'],'VALID_INPUT_REJECTED');
    $denied=false; try { $service->read(7,41); } catch (RuntimeException $e) { $denied=$e->getMessage()==='PILOT_SCOPE_DENIED'; }
    nfHttpAssert($denied,'FOREIGN_TABLE_ACCEPTED');
    $denied=false; try { $service->read(6,999999); } catch (RuntimeException $e) { $denied=$e->getMessage()==='PILOT_SCOPE_DENIED'; }
    nfHttpAssert($denied,'FOREIGN_ROW_ACCEPTED');
    $users->setUser(null); $denied=false;
    try { $service->read(6,41); } catch (RuntimeException $e) { $denied=$e->getMessage()==='AUTH_REQUIRED'; }
    finally { $users->setUser($user); }
    nfHttpAssert($denied,'ANONYMOUS_ACCEPTED');
    $controller=new \OCA\NovaforgeTables\Controller\PilotController('novaforge_tables',\OC::$server->get(\OCP\IRequest::class),$db,$apps,$config,$users);
    $response=$controller->version(6,41);
    nfHttpAssert($response->getStatus()===200 && ($response->getData()['serverVersion']??null)===$before['serverVersion'],'CONTROLLER_READ_FAILED');
    echo "VORPRUEFUNG: PHP-Syntax, reale Pilotzeile 41, native Leserechte, 8 Eingabegrenzen und Konto/Tabellen/Zeilengrenzen bestanden. Keine Zeile geaendert.\n";
    $step='Geschuetzte Sicherung';
    $dataDir=$config->getSystemValue('datadirectory','');
    nfHttpAssert(is_string($dataDir) && is_dir($dataDir),'BACKUP_LOCATION_UNAVAILABLE');
    $backup=$dataDir.'/novaforge-system-backups/tables-http-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4));
    nfHttpAssert(mkdir($backup,0700,true),'BACKUP_CREATE_FAILED');
    foreach ($original as $path=>$hash) {
        if (!is_dir(dirname($backup.'/'.$path))) nfHttpAssert(mkdir(dirname($backup.'/'.$path),0700,true),'BACKUP_DIRECTORY_FAILED');
        nfHttpAssert(copy($active.'/'.$path,$backup.'/'.$path) && hash_equals($hash,hash_file('sha256',$backup.'/'.$path) ?: ''),'BACKUP_HASH_FAILED');
    }
    $manifest=['from'=>'0.1.0','to'=>'0.1.1','installedVersion'=>$oldInstalled,'enabled'=>$oldEnabled,
        'pilotHttpEnabled'=>$oldPilot,'original'=>$original,'new'=>array_map(fn($s)=>hash('sha256',$s),$payload)];
    $seal=json_encode($manifest,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES);
    nfHttpAssert(file_put_contents($backup.'/manifest.json',$seal,LOCK_EX)===strlen($seal),'BACKUP_MANIFEST_FAILED');
    $step='Gepruefter App-Austausch';
    foreach ($original as $path=>$hash) nfHttpAssert(hash_equals($hash,hash_file('sha256',$active.'/'.$path) ?: ''),'SOURCE_CHANGED_BEFORE_SWAP');
    // New class files first. Routes follow; writing remains disabled until final verification.
    foreach ($payload as $path=>$source) {
        if (!is_dir(dirname($active.'/'.$path))) nfHttpAssert(mkdir(dirname($active.'/'.$path),0755,true),'APP_DIRECTORY_FAILED');
        nfHttpReplace($active.'/'.$path,$source); $changed[]=$path;
    }
    $config->setAppValue('novaforge_tables','installed_version','0.1.1');
    foreach ($payload as $path=>$source) nfHttpAssert(hash_equals(hash('sha256',$source),hash_file('sha256',$active.'/'.$path) ?: ''),'INSTALLED_HASH_FAILED');
    foreach ($original as $path=>$hash) if (!isset($payload[$path])) nfHttpAssert(hash_equals($hash,hash_file('sha256',$active.'/'.$path) ?: ''),'LEGACY_SOURCE_CHANGED');
    $step='Lesende Rueckpruefung';
    $after=$service->read(6,41);
    nfHttpAssert(hash_equals($before['serverVersion'],$after['serverVersion']),'PILOT_CHANGED_DURING_INSTALL');
    nfHttpAssert($config->getAppValue('novaforge_tables','enabled','')===$oldEnabled,'APP_ENABLED_CHANGED');
    $config->setAppValue('novaforge_tables','pilot_http_enabled','1');
    nfHttpAssert($config->getAppValue('novaforge_tables','pilot_http_enabled','0')==='1','PILOT_FLAG_FAILED');
    echo "INSTALLIERT: novaforge_tables 0.1.1; bisherige Listenantwort erhalten.\n";
    echo "PILOTGRENZE: Nur authentifiziertes Konto ChatGPT, Tabelle 6, Zeilen 37-42, Textspalten 26-28.\n";
    echo "RUECKPRUEFUNG: Pilotzeile 41 einschliesslich serverseitiger Version unveraendert; App-Aktivierung erhalten.\n";
    echo "SICHERUNG: ".$backup."\n";
    echo "OFFEN: Echter authentifizierter HTTP-Schreibtest und MCP-Schreibwerkzeuge; keine Registerfreigabe. Nicht erneut installieren.\n";
} catch (Throwable $e) {
    $exitStatus=1;
    if ($changed && $active && $backup && $config) {
        try {
            $config->setAppValue('novaforge_tables','pilot_http_enabled','0');
            foreach (array_reverse($changed) as $path) {
                nfHttpAssert(hash_equals(hash('sha256',$payload[$path]),hash_file('sha256',$active.'/'.$path) ?: ''),'ROLLBACK_SOURCE_CHANGED');
                if (isset($original[$path])) {
                    nfHttpAssert(hash_equals($original[$path],hash_file('sha256',$backup.'/'.$path) ?: ''),'ROLLBACK_BACKUP_CHANGED');
                    nfHttpReplace($active.'/'.$path,file_get_contents($backup.'/'.$path));
                } else nfHttpAssert(unlink($active.'/'.$path),'ROLLBACK_REMOVE_FAILED');
            }
            $config->setAppValue('novaforge_tables','installed_version',$oldInstalled);
            if ($oldPilot==='') $config->deleteAppValue('novaforge_tables','pilot_http_enabled');
            else $config->setAppValue('novaforge_tables','pilot_http_enabled',$oldPilot);
            echo "RUECKWEG: Alte App-Dateien und Versionswert wiederhergestellt; Schreiben deaktiviert.\n";
        } catch (Throwable $rollback) {
            fwrite(STDERR,"RUECKWEG UNGEKLAERT: Schreibflag, Sicherung und App-Zustand vor Wiederholung pruefen.\n");
        }
    }
    $code=$e instanceof RuntimeException && preg_match('/^[A-Z_]+$/D',$e->getMessage()) ? $e->getMessage() : 'NATIVE_RUNTIME_FAILURE';
    fwrite(STDERR,"STOPP bei ".$step.": ".$code."; Klasse=".get_class($e)."; Datei=".basename($e->getFile())."; Zeile=".$e->getLine().". Nicht blind wiederholen.\n");
    if ($backup) fwrite(STDERR,"SICHERUNG: ".$backup."\n");
} finally {
    if ($users) $users->setUser($previous);
    if ($stage && is_dir($stage)) {
        foreach (array_keys($payload) as $path) if (is_file($stage.'/'.$path)) unlink($stage.'/'.$path);
        foreach (['lib/Service','lib/Controller','lib','appinfo',''] as $path) if (is_dir($stage.'/'.$path)) rmdir($stage.'/'.$path);
    }
    if (is_resource($lock)) { flock($lock,LOCK_UN); fclose($lock); }
}
exit($exitStatus);
