<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
// Run only from the verified Nextcloud root using its existing PHP CLI.
declare(strict_types=1);
// Public source edition: historical installation-specific maintenance script.
if (getenv('NOVASPACE_ENABLE_LEGACY_INSTANCE_SCRIPTS') !== 'I_REVIEWED_THE_SOURCE') { fwrite(STDERR, "STOP: Historical instance-bound script. Read LEGACY_OPS.md before enabling.\n"); exit(78); }

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('OC_CONSOLE', true);
require getcwd() . '/lib/base.php';

function nfProcess(array $command, string $input = ''): array {
    $process = proc_open($command, [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],
        $pipes, null, ['PATH'=>'/usr/bin:/bin']);
    if (!is_resource($process)) throw new RuntimeException('PHP-Unterprozess nicht verfügbar.');
    foreach ($pipes as $pipe) stream_set_blocking($pipe, false);
    $offset=0; $out=''; $err=''; $deadline=microtime(true)+30;
    try {
        while (true) {
            if (microtime(true)>$deadline) throw new RuntimeException('Prüfung überschreitet Zeitgrenze.');
            $state=proc_get_status($process);
            if (isset($pipes[0]) && ($offset>=strlen($input) || !$state['running'])) {
                fclose($pipes[0]); unset($pipes[0]);
            }
            $read=[];
            foreach ([1,2] as $i) if (isset($pipes[$i]) && !feof($pipes[$i])) $read[]=$pipes[$i];
            $write=isset($pipes[0])?[$pipes[0]]:[]; $except=null;
            if (!$state['running'] && !$read) break;
            if (!$read && !$write) { usleep(10000); continue; }
            if (stream_select($read,$write,$except,0,100000)===false) throw new RuntimeException('Prüfprozess gestört.');
            foreach ($write as $pipe) {
                $sent=fwrite($pipe,substr($input,$offset,65536));
                if ($sent===false) throw new RuntimeException('Testeingabe nicht übertragbar.');
                $offset+=$sent;
            }
            foreach ($read as $pipe) {
                $part=fread($pipe,65536);
                if ($part===false) throw new RuntimeException('Prüfausgabe nicht lesbar.');
                if ($pipe===$pipes[1]) $out.=$part; else $err.=$part;
            }
            if (strlen($out)>524288 || strlen($err)>65536) throw new RuntimeException('Prüfausgabe zu groß.');
        }
        return [$state['exitcode'],$out,$err];
    } finally {
        foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
        if (is_resource($process)) {
            if (proc_get_status($process)['running']) proc_terminate($process,9);
            proc_close($process);
        }
    }
}

$changed=[]; $backup=null; $lock=null;
try {
    if (!class_exists(ZipArchive::class) || !function_exists('curl_init')
        || !function_exists('proc_open')) throw new RuntimeException('ZIP, cURL oder PHP-Unterprozess fehlt.');
    $apps=\OC::$server->get(\OCP\App\IAppManager::class);
    $config=\OC::$server->get(\OCP\IConfig::class);
    $app=$apps->getAppPath('novaforge_pdf');
    $php='/usr/bin/php85';
    if ($apps->getAppVersion('novaforge_pdf')!=='0.1.0'
        || !is_executable($php) || is_dir($app.'/lib/Vendor')) {
        throw new RuntimeException('Ausgangsstand weicht ab. Keine automatische Wiederholung oder Überschreibung.');
    }
    $lock=fopen(sys_get_temp_dir().'/novaforge-pdf-repair-'.hash('sha256',$app).'.lock','c');
    if (!$lock || !flock($lock,LOCK_EX|LOCK_NB)) throw new RuntimeException('Andere PDF-Reparatur läuft.');
    $controller=file_get_contents($app.'/lib/Controller/PdfController.php');
    $worker=file_get_contents($app.'/bin/worker.php');
    $info=file_get_contents($app.'/appinfo/info.xml');
    if ($controller===false || $worker===false || $info===false) throw new RuntimeException('Brückenquellen fehlen.');
    $oldExtract=<<<'CODE'
    private function extract(string $bytes, int $start, int $count): array {
        if ($this->appManager->getAppVersion('aiquila') !== '0.4.11') {
            throw new \RuntimeException('PDF_LIBRARY_VERSION_CHANGED');
        }
        return $this->worker->run($this->config->getAppValue('novaforge_pdf', 'php_binary', '/usr/bin/php85'),
            $this->appManager->getAppPath('aiquila') . '/lib/NovaforgePdfPilot/Vendor', $bytes, $start, $count);
    }
CODE;
    if (substr_count($controller,$oldExtract)!==1
        || !str_contains($info,'<version>0.1.0</version>')
        || !str_contains($worker,'OCA\AIquila\NovaforgePdfPilot\Vendor\Config')) {
        throw new RuntimeException('Brückenquellen entsprechen nicht dem geprüften Stand.');
    }
    $stage=sys_get_temp_dir().'/novaforge-pdf-stage-'.bin2hex(random_bytes(8));
    if (!mkdir($stage.'/Vendor',0700,true)) throw new RuntimeException('Prüfverzeichnis nicht anlegbar.');
    $ref='2cfa0d92bd557875c9f52a75fde0e8392302a354'; // Official smalot v2.12.5.
    $archive=fopen($stage.'/source.zip','xb');
    if (!$archive) throw new RuntimeException('Download-Zieldatei nicht anlegbar.');
    $received=0;
    $curl=curl_init('https://codeload.github.com/smalot/pdfparser/zip/'.$ref);
    curl_setopt_array($curl,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>15,
        CURLOPT_TIMEOUT=>60,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
        CURLOPT_USERAGENT=>'NOVAFORGE-PDF-Repair/0.1.1',
        CURLOPT_WRITEFUNCTION=>static function($curl,string $bytes) use ($archive,&$received): int {
            $received+=strlen($bytes);
            return $received>8388608?0:fwrite($archive,$bytes);
        }]);
    $ok=curl_exec($curl); $status=curl_getinfo($curl,CURLINFO_RESPONSE_CODE);
    curl_close($curl); fclose($archive);
    if ($ok!==true || $status!==200) throw new RuntimeException('Gepinnte Bibliothek nicht heruntergeladen; aktive App unverändert.');
    $zip=new ZipArchive();
    if ($zip->open($stage.'/source.zip')!==true) throw new RuntimeException('Bibliotheksarchiv ungültig.');
    $prefix='pdfparser-'.$ref.'/src/Smalot/PdfParser/';
    $manifest=[];
    for ($i=0;$i<$zip->numFiles;$i++) {
        $name=$zip->getNameIndex($i);
        if (!str_starts_with($name,$prefix) || !str_ends_with($name,'.php')) continue;
        $relative=substr($name,strlen($prefix));
        if (!preg_match('~^[A-Za-z0-9_/-]+\.php$~D',$relative)
            || in_array('..',explode('/',$relative),true)) throw new RuntimeException('Unzulässiger Bibliothekspfad.');
        $source=$zip->getFromIndex($i);
        if ($source===false || strlen($source)>2097152) throw new RuntimeException('Bibliotheksquelle ungültig.');
        $source=str_replace(
            ['Smalot\\\\PdfParser','Smalot\\PdfParser'],
            ['OCA\\\\NovaforgePdf\\\\Vendor','OCA\\NovaforgePdf\\Vendor'],$source);
        $path=$stage.'/Vendor/'.$relative;
        if (!is_dir(dirname($path)) && !mkdir(dirname($path),0700,true)) throw new RuntimeException('Bibliotheksordner nicht anlegbar.');
        if (file_put_contents($path,$source)!==strlen($source)) throw new RuntimeException('Bibliotheksquelle nicht gespeichert.');
        $manifest[$relative]=hash('sha256',$source);
    }
    foreach (['LICENSE.txt','LICENSE'] as $name) {
        $license=$zip->getFromName('pdfparser-'.$ref.'/'.$name);
        if ($license!==false) { file_put_contents($stage.'/Vendor/LICENSE.txt',$license); break; }
    }
    $zip->close();
    if (!isset($manifest['Parser.php'],$manifest['Config.php']) || count($manifest)<20
        || !is_file($stage.'/Vendor/LICENSE.txt')) throw new RuntimeException('Bibliothek oder Lizenz unvollständig.');
    ksort($manifest);
    $seal=json_encode(['package'=>'smalot/pdfparser','version'=>'2.12.5','reference'=>$ref,'files'=>$manifest],JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    file_put_contents($stage.'/Vendor/manifest.json',$seal);
    $digest=hash('sha256',$seal);
    $newExtract=<<<'CODE'
    private function extract(string $bytes, int $start, int $count): array {
        $vendor = dirname(__DIR__) . '/Vendor';
        $manifest = @file_get_contents($vendor . '/manifest.json');
        if ($manifest === false || !hash_equals('__MANIFEST_SHA256__', hash('sha256', $manifest))) {
            throw new \RuntimeException('PDF_LIBRARY_VERSION_CHANGED');
        }
        $seal = json_decode($manifest, true, 32, JSON_THROW_ON_ERROR);
        foreach ($seal['files'] as $file => $sha256) {
            if (!is_file($vendor . '/' . $file) || !hash_equals($sha256, hash_file('sha256', $vendor . '/' . $file))) {
                throw new \RuntimeException('PDF_LIBRARY_VERSION_CHANGED');
            }
        }
        return $this->worker->run($this->config->getAppValue('novaforge_pdf', 'php_binary', '/usr/bin/php85'),
            $vendor, $bytes, $start, $count);
    }
CODE;
    $newExtract=str_replace('__MANIFEST_SHA256__',$digest,$newExtract);
    $controller=str_replace($oldExtract,$newExtract,$controller);
    $controller=str_replace(["'bridgeVersion' => '0.1.0'","AIquila-PDF-Pilot / smalot 2.12.5"],
        ["'bridgeVersion' => '0.1.1'","NOVAFORGE PDF / smalot 2.12.5"],$controller);
    $worker=str_replace(
        ['OCA\\\\AIquila\\\\NovaforgePdfPilot\\\\Vendor','OCA\\AIquila\\NovaforgePdfPilot\\Vendor'],
        ['OCA\\\\NovaforgePdf\\\\Vendor','OCA\\NovaforgePdf\\Vendor'],$worker);
    $info=str_replace('<version>0.1.0</version>','<version>0.1.1</version>',$info);
    $info=str_replace(['existing AIquila PDF pilot library','the installed AIquila PDF pilot parser'],
        ['isolated verified PDF library','its own isolated and verified PDF parser'],$info);
    file_put_contents($stage.'/PdfController.php',$controller);
    file_put_contents($stage.'/worker.php',$worker);
    file_put_contents($stage.'/info.xml',$info);
    foreach (array_merge([$stage.'/PdfController.php',$stage.'/worker.php'],
        array_map(fn($p)=>$stage.'/Vendor/'.$p,array_keys($manifest))) as $path) {
        [$code]=nfProcess([$php,'-l',$path]);
        if ($code!==0) throw new RuntimeException('PHP-Syntaxprüfung fehlgeschlagen; aktive App unverändert.');
    }
    $fixture=file_get_contents($app.'/fixtures/Lesetest.pdf');
    if ($fixture===false || strlen($fixture)>1048576) throw new RuntimeException('Test-PDF fehlt oder ist unerwartet groß.');
    [$code,$output]=nfProcess([$php,'-d','memory_limit=192M','-d','max_execution_time=20',
        $stage.'/worker.php',$stage.'/Vendor','1','2'],$fixture);
    $test=json_decode($output,true);
    if ($code!==0 || !is_array($test) || ($test['pageCount']??null)!==2
        || !str_contains($test['pages'][0]['text']??'','KIESELMOND-PDF-7C19')
        || !str_contains($test['pages'][1]['text']??'','TANNENLICHT-42B8')) {
        throw new RuntimeException('Beide PDF-Testseiten nicht bestätigt; aktive App unverändert.');
    }
    echo "VORPRÜFUNG: PHP-Syntax und beide PDF-Testseiten bestanden.\n";
    $dataDir=$config->getSystemValue('datadirectory');
    if (!is_string($dataDir) || !is_dir($dataDir)) throw new RuntimeException('Geschützter Sicherungsort fehlt.');
    $backup=$dataDir.'/novaforge-system-backups/pdf-bridge-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(3));
    if (!mkdir($backup,0700,true)) throw new RuntimeException('Sicherung nicht anlegbar.');
    $replacements=['lib/Controller/PdfController.php'=>$stage.'/PdfController.php',
        'bin/worker.php'=>$stage.'/worker.php','appinfo/info.xml'=>$stage.'/info.xml'];
    foreach ($replacements as $relative=>$source) {
        $backupFile=$backup.'/'.$relative;
        if (!is_dir(dirname($backupFile))) mkdir(dirname($backupFile),0700,true);
        if (!copy($app.'/'.$relative,$backupFile)) throw new RuntimeException('Sicherung unvollständig; aktive App unverändert.');
    }
    if (!rename($stage.'/Vendor',$app.'/lib/Vendor')) throw new RuntimeException('Eigene PDF-Bibliothek nicht installierbar.');
    $changed[]='lib/Vendor';
    foreach ($replacements as $relative=>$source) {
        $temporary=$app.'/'.$relative.'.nf-repair';
        if (!copy($source,$temporary) || !chmod($temporary,0644) || !rename($temporary,$app.'/'.$relative)) {
            throw new RuntimeException('Dateiaustausch fehlgeschlagen.');
        }
        $changed[]=$relative;
    }
    $config->setAppValue('novaforge_pdf','installed_version','0.1.1');
    echo "INSTALLIERT: PDF-Brücke 0.1.1; eigene geprüfte Bibliothek, unabhängig von AIquila.\n";
    echo "BIBLIOTHEK: ",count($manifest)," PHP-Dateien; Manifest SHA-256 ",$digest,"\n";
    echo "SICHERUNG: ",$backup,"\n";
    echo "OFFEN: HTTP-Selbsttest über den Connector und tatsächlicher PDF-Leseabruf.\n";
} catch (Throwable $e) {
    if ($backup!==null && $changed) {
        foreach (array_reverse($changed) as $relative) {
            if ($relative==='lib/Vendor') continue; // Keep new library for diagnosis.
            if (is_file($backup.'/'.$relative)) copy($backup.'/'.$relative,$app.'/'.$relative);
        }
        if (isset($config)) $config->setAppValue('novaforge_pdf','installed_version','0.1.0');
        fwrite(STDERR,"RÜCKWEG: Bisherige Brückendateien aus Sicherung wiederhergestellt; neue Bibliothek bleibt zur Diagnose.\n");
    }
    fwrite(STDERR,"STOPP: ".$e->getMessage()."\n");
    exit(1);
} finally {
    if (is_resource($lock)) { flock($lock,LOCK_UN); fclose($lock); }
}
