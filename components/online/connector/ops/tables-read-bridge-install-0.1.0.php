<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
/** NOVAFORGE Tables read-only bridge installer 0.1.0. No overwrite. */
declare(strict_types=1);
// Historical installation-specific source: default disabled before bootstrap or input.
if (getenv('NOVASPACE_ENABLE_LEGACY_INSTANCE_SCRIPTS') !== 'I_REVIEWED_THE_SOURCE') { fwrite(STDERR, "STOP: Historical instance-bound script. Read LEGACY_OPS.md before enabling.\n"); exit(78); }

if (PHP_SAPI !== 'cli' || !is_file(getcwd().'/lib/base.php')) { fwrite(STDERR,"STOPP: Im Nextcloud-Hauptordner per PHP CLI ausführen.\n"); exit(1); }
define('OC_CONSOLE', true);
require getcwd().'/lib/base.php';
$files = json_decode(<<<'NF_FILES'
{"appinfo/info.xml": "<?xml version=\"1.0\"?>\n<info xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:noNamespaceSchemaLocation=\"https://apps.nextcloud.com/schema/apps/info.xsd\">\n  <id>novaforge_tables</id><name>NOVAFORGE Tables Read Bridge</name>\n  <summary>Read visible Tables without automatic tutorial creation</summary>\n  <description>Account-bound read-only bridge. No record writes or public shares.</description>\n  <version>0.1.0</version><licence>agpl</licence><author>NOVAFORGE</author>\n  <namespace>NovaforgeTables</namespace><category>tools</category>\n  <dependencies><nextcloud min-version=\"34\" max-version=\"34\"/><php min-version=\"8.3\"/></dependencies>\n</info>\n", "appinfo/routes.php": "<?php\ndeclare(strict_types=1);\nreturn ['ocs' => [['name'=>'tables#list', 'url'=>'/api/v1/list', 'verb'=>'GET']]];\n", "lib/Controller/TablesController.php": "<?php\ndeclare(strict_types=1);\nnamespace OCA\\NovaforgeTables\\Controller;\nuse OCP\\AppFramework\\OCSController;\nuse OCP\\AppFramework\\Http\\DataResponse;\nuse OCP\\AppFramework\\Http\\Attribute\\NoAdminRequired;\nuse OCP\\AppFramework\\Http\\Attribute\\NoCSRFRequired;\nuse OCP\\IRequest;\nuse OCP\\IUserSession;\nuse OCP\\App\\IAppManager;\n\nfinal class TablesController extends OCSController {\n    public function __construct(string $appName, IRequest $request,\n        private IUserSession $users, private IAppManager $apps) { parent::__construct($appName, $request); }\n    #[NoAdminRequired]\n    #[NoCSRFRequired]\n    public function list(): DataResponse {\n        $user = $this->users->getUser();\n        if (!$user) return new DataResponse(['error'=>'AUTH_REQUIRED'], 401);\n        if (!$this->apps->isEnabledForUser('tables', $user) || $this->apps->getAppVersion('tables') !== '2.3.1') {\n            return new DataResponse(['error'=>'TABLES_VERSION_UNSUPPORTED'], 503);\n        }\n        try {\n            $container = (new \\OCA\\Tables\\AppInfo\\Application())->getContainer();\n            $service = $container->get(\\OCA\\Tables\\Service\\TableService::class);\n            // Fourth argument explicitly disables automatic tutorial creation.\n            $tables = $service->findAll($user->getUID(), false, false, false);\n            if (count($tables) > 1000) return new DataResponse(['error'=>'TABLES_LIST_LIMIT'], 413);\n            return new DataResponse(['account'=>$user->getUID(), 'bridgeVersion'=>'0.1.0',\n                'protocol'=>1, 'tutorialCreation'=>false, 'tables'=>$service->formatTables($tables)]);\n        } catch (\\Throwable $e) {\n            return new DataResponse(['error'=>'TABLES_READ_FAILED'], 503);\n        }\n    }\n}\n"}
NF_FILES, true, 512, JSON_THROW_ON_ERROR);
$stage = null; $installed = false;
try {
    $apps = \OC::$server->get(\OCP\App\IAppManager::class);
    $users = \OC::$server->get(\OCP\IUserSession::class);
    $user = \OC::$server->get(\OCP\IUserManager::class)->get('ChatGPT');
    if (!$user || $apps->getAppVersion('tables') !== '2.3.1' || !is_dir($apps->getAppPath('tables'))) throw new RuntimeException('Konto oder Tables 2.3.1 nicht bestätigt.');
    $config=\OC::$server->get(\OCP\IConfig::class);
    printf("DATENBANK-TYP: %s\n",$config->getSystemValue('dbtype','unbekannt'));
    $parent = dirname($apps->getAppPath('novaforge_pdf'));
    $target = $parent.'/novaforge_tables';
    if (file_exists($target) || is_link($target) || !is_writable($parent)) throw new RuntimeException('Ziel besteht bereits oder App-Verzeichnis nicht schreibbar. Keine Wiederholung/Überschreibung.');
    $stage = $parent.'/.novaforge-tables-stage-'.bin2hex(random_bytes(8));
    if (!mkdir($stage, 0755)) throw new RuntimeException('Prüfverzeichnis nicht anlegbar.');
    foreach ($files as $path=>$source) {
        $destination=$stage.'/'.$path;
        if (!is_dir(dirname($destination)) && !mkdir(dirname($destination),0755,true)) throw new RuntimeException('Unterordner nicht anlegbar.');
        if (file_put_contents($destination,$source,LOCK_EX)!==strlen($source)) throw new RuntimeException('Quelle nicht vollständig geschrieben.');
        chmod($destination,0644);
        if (str_ends_with($path,'.php')) {
            $pipes=[];
            $proc=proc_open([PHP_BINARY,'-l',$destination],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
            if (!is_resource($proc)) throw new RuntimeException('Syntaxprüfung nicht startbar.');
            fclose($pipes[0]); $stdout=stream_get_contents($pipes[1]); $stderr=stream_get_contents($pipes[2]); fclose($pipes[1]);fclose($pipes[2]);
            if (proc_close($proc)!==0) throw new RuntimeException('PHP-Syntaxprüfung fehlgeschlagen.');
        }
    }
    \OC_App::loadApp('tables');
    $previous=$users->getUser();
    try {
        $users->setUser($user);
        require $stage.'/lib/Controller/TablesController.php';
        $controller=new \OCA\NovaforgeTables\Controller\TablesController('novaforge_tables',\OC::$server->get(\OCP\IRequest::class),$users,$apps);
        $response=$controller->list(); $data=$response->getData();
        if ($response->getStatus()!==200 || !is_array($data) || ($data['account']??null)!=='ChatGPT' || ($data['tutorialCreation']??null)!==false || !is_array($data['tables']??null)) throw new RuntimeException('Lesende Vorprüfung im Connector-Konto fehlgeschlagen.');
        printf("VORPRÜFUNG: Tables 2.3.1; Konto ChatGPT; %d sichtbare Tabellen; Tutorial-Anlage deaktiviert.\n",count($data['tables']));
    } finally { $users->setUser($previous); }
    if (file_exists($target) || is_link($target)) throw new RuntimeException('App-Ziel zwischenzeitlich angelegt; keine Überschreibung.');
    if (!rename($stage,$target)) throw new RuntimeException('App-Verzeichnis nicht installierbar.');
    $installed=true; $stage=null;
    echo "DATEIEN INSTALLIERT: novaforge_tables 0.1.0. Aktivierung folgt separat mit occ.\n";
    if (in_array('--with-test-image', $argv, true)) {
        $folder = \OC::$server->get(\OCP\Files\IRootFolder::class)->getUserFolder('ChatGPT')->get('NOVAFORGE-Pilot');
        $name='Connector-1.9.0-Bildtest-2026-10-03.png';
        if (!($folder instanceof \OCP\Files\Folder) || !$folder->isCreatable() || $folder->nodeExists($name)) throw new RuntimeException('Bildtest-Ziel nicht eindeutig frei und beschreibbar. App-Dateien sind bereits installiert; keine Bilddatei überschrieben.');
        $bytes=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAPAAAABkCAIAAAA3wCqQAAAB40lEQVR4nO3dQWoaYRiA4bEpBl15ojDJtbIQL+CR1GvkKAkBuygNJYEK7TRDXp9npePmY3j5+cHFtzifzwNUfJt7AJiSoEkRNCmCJkXQpAiaFEGTImhSBE3K9wu/LxafMsbX8X/+WPWa3/nr1+yEJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQpAiaFEGTImhSBE2KoEkRNCmCJkXQ/2q1Wt3f37993Ww2Pz+s1+vxl/1+P89w1+fSSgouub29fX19PZ1O4zj+/ny5XJ5Op3lmumJO6Ansdrvtdjv3FAyDoCfx8PAwDMPxeJx7EAQ9kY+H9MvLy9sd+unpaa7Bro079DTGcby5uTkcDm9P3KFnIejJ7Ha7x8fHuae4dq4ck7m7u1sul8/Pz3MPctUW5z/v7LTi9B2bZD+FTbIwDIImRtCkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZMiaFIETYqgSRE0KYImRdCkCJoUQZMiaFIurXWDL8UJTYqgSRE0KYImRdCkCJoUQZMiaFJ+AOl3O/KP5l9TAAAAAElFTkSuQmCC',true);
        $file=$folder->newFile($name,$bytes);
        if (!hash_equals(hash('sha256',$bytes),hash('sha256',$file->getContent()))) throw new RuntimeException('Bildtest-Rücklesen weicht ab.');
        printf("BILDTEST: /NOVAFORGE-Pilot/%s; ID %s; ETag %s; SHA-256 %s\n",$name,$file->getId(),$file->getEtag(),hash('sha256',$bytes));
    }
    echo "OFFEN: HTTP-Prüfung über den Connector; Tables-Schreiben und PDF-Seitenrendering.\n";
    echo "RENDERER-VORPRÜFUNG (Verfügbarkeit, kein Funktionsnachweis):\n";
    foreach (['/usr/bin/pdfinfo','/usr/bin/pdftoppm','/usr/bin/pdftocairo','/usr/bin/gs','/usr/bin/convert','/usr/bin/magick','/usr/bin/ocrmypdf'] as $binary) printf("%s: %s\n",$binary,is_executable($binary)?'ausführbar':'nicht vorhanden/ausführbar');
    printf("Imagick-Erweiterung: %s\n",extension_loaded('imagick')?'ja':'nein');
    if (extension_loaded('imagick')) printf("Imagick PDF-Format: %s (Policy/Delegat noch nicht getestet)\n",count(\Imagick::queryFormats('PDF'))?'gemeldet':'nicht gemeldet');
    printf("proc_open: %s; exec: %s\n",function_exists('proc_open')?'ja':'nein',function_exists('exec')?'ja':'nein');
} catch (Throwable $e) {
    fwrite(STDERR,"STOPP: ".$e->getMessage()."\n");
    if ($stage && is_dir($stage)) { foreach (array_reverse(array_keys($files)) as $path) @unlink($stage.'/'.$path); @rmdir($stage.'/lib/Controller'); @rmdir($stage.'/lib'); @rmdir($stage.'/appinfo'); @rmdir($stage); }
    exit(1);
}
