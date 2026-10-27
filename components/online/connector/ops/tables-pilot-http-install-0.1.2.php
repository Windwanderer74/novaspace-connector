<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Upgrade only the exact existing read bridge. No test-table creation or row writes. */
declare(strict_types=1);
// Historical installation-specific source: default disabled before bootstrap or input.
if (getenv('NOVASPACE_ENABLE_LEGACY_INSTANCE_SCRIPTS') !== 'I_REVIEWED_THE_SOURCE') { fwrite(STDERR, "STOP: Historical instance-bound script. Read LEGACY_OPS.md before enabling.\n"); exit(78); }

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
{
  "appinfo/info.xml": "3947dcb754b409e6d1cce0ebde89d2bb346add0f738f6684fd74e70818020834",
  "appinfo/routes.php": "bc0bde86cef4ed9d626894d621bf519fe1f4d594be18759d3dd820735717803e",
  "lib/Controller/TablesController.php": "ae63014bd34a94379d80e14be23e347c0a0a93717a6d5191bd92e8be0b2c90ab"
}
NF_OLD,true,512,JSON_THROW_ON_ERROR);
$payload=json_decode(<<<'NF_NEW'
{"lib/Service/PilotWriteService.php": "<?php\n// SPDX-License-Identifier: AGPL-3.0-or-later\ndeclare(strict_types=1);\nnamespace OCA\\NovaforgeTables\\Service;\nuse RuntimeException;\n\nfinal class PilotWriteService {\n    public const USER = 'ChatGPT';\n    public const TITLE = 'NOVAFORGE Schreibschutz-Pilot 2026-10-03 / 0.1.1';\n    private ?\\OC\\DB\\Connection $db = null;\n    private array $names = [];\n    private array $indexes = [];\n    private $rows;\n    private $permissions;\n    private bool $updateUsed = false;\n    private string $baselineIsolation = '';\n    public function __construct(\n        private \\OCP\\IDBConnection $adapter,\n        private \\OCP\\App\\IAppManager $apps,\n        private \\OCP\\IConfig $config,\n        private \\OCP\\IUserSession $users,\n    ) {}\nprivate function check(bool $value, string $code): void {\n    if (!$value) throw new RuntimeException($code);\n}\nprivate function releaseResult($result): void {\n    if ($result instanceof \\OCP\\DB\\IResult) $result->closeCursor();\n    elseif ($result instanceof \\Doctrine\\DBAL\\Result) $result->free();\n    else throw new RuntimeException('UNSUPPORTED_DB_RESULT');\n}\nprivate function all($db, string $sql, array $params = []): array {\n    $result = $db->executeQuery($sql, $params);\n    try { return $result->fetchAllAssociative(); }\n    finally { $this->releaseResult($result); }\n}\nprivate function one($db, string $sql, array $params = []) {\n    $result = $db->executeQuery($sql, $params);\n    try { return $result->fetchOne(); }\n    finally { $this->releaseResult($result); }\n}\nprivate function quoted(string $identifier): string {\n    $this->check((bool)preg_match('/^[a-zA-Z0-9_]+$/D', $identifier), 'UNSAFE_IDENTIFIER');\n    return '`'.$identifier.'`';\n}\nprivate function rollback($db): void {\n    if (!$db) return;\n    for ($depth=0; $db->inTransaction() && $depth<16; $depth++) $db->rollBack();\n    $this->check(!$db->inTransaction(), 'ROLLBACK_INCOMPLETE');\n}\nprivate function begin($db): void {\n    $this->check(!$db->inTransaction() && $db->getTransactionNestingLevel() === 0, 'NESTED_TRANSACTION');\n    // No SESSION/GLOBAL change. This setting applies to this next transaction only.\n    $db->executeStatement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');\n    $db->beginTransaction();\n    $this->check($db->getTransactionNestingLevel() === 1, 'TRANSACTION_NOT_STARTED');\n}\nprivate function snapshot($db, array $names, array $indexes, int $tableId, int $rowId, bool $lock): array {\n    $suffix = $lock ? ' FOR UPDATE WAIT 1' : '';\n    // First reads are locking current reads. Do not create an earlier MVCC read view.\n    $table = $this->all($db, 'SELECT * FROM '.$names['tables_tables'].' WHERE id = ?'.$suffix, [$tableId]);\n    $this->check(count($table) === 1 && $table[0]['ownership'] === self::USER\n        && $table[0]['title'] === self::TITLE && array_key_exists('archived',$table[0]) && !$table[0]['archived'], 'NOT_OWN_PILOT');\n    $columns = $this->all($db, 'SELECT * FROM '.$names['tables_columns'].' WHERE table_id = ? ORDER BY id'.$suffix, [$tableId]);\n    $this->check(array_map(fn($c)=>(int)$c['id'], $columns) === [26,27,28], 'PILOT_STRUCTURE_CHANGED');\n    foreach ($columns as $column) $this->check($column['type'] === 'text' && $column['subtype'] === 'line' && !(bool)$column['mandatory'] && !(bool)$column['text_unique'] && (int)$column['text_max_length'] === 200, 'UNSUPPORTED_PILOT_COLUMN');\n    $sleeves = $this->all($db, 'SELECT * FROM '.$names['tables_row_sleeves'].' WHERE id = ? AND table_id = ?'.$suffix, [$rowId, $tableId]);\n    $this->check(count($sleeves) === 1, 'ROW_TABLE_MISMATCH');\n    $cells = [];\n    foreach (['text','number','datetime','selection','usergroup'] as $type) {\n        $key = 'tables_row_cells_'.$type;\n        $cells[$type] = [];\n        foreach ($columns as $column) {\n            $rows = $this->all($db, 'SELECT * FROM '.$names[$key].' FORCE INDEX ('.$indexes[$key].')'\n                .' WHERE column_id = ? AND row_id = ? ORDER BY id'.$suffix, [(int)$column['id'], $rowId]);\n            // The pilot is deliberately text-only: any other storage or duplicate is rejected.\n            $this->check(($type === 'text' && count($rows) <= 1) || ($type !== 'text' && count($rows) === 0), 'AMBIGUOUS_CELL_STORAGE');\n            $cells[$type][(string)$column['id']] = $rows;\n        }\n    }\n    return ['account'=>self::USER, 'table'=>$table[0], 'columns'=>$columns, 'sleeve'=>$sleeves[0], 'cells'=>$cells];\n}\nprivate function versionOf(array $snapshot): string {\n    return hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));\n}\nprivate function readVersion($db, array $names, array $indexes, int $tableId, int $rowId): string {\n    $this->begin($db);\n    try { return $this->versionOf($this->snapshot($db, $names, $indexes, $tableId, $rowId, true)); }\n    finally { $this->rollback($db); }\n}\n\n    private function scope(int $tableId, int $rowId): void {\n        $user = $this->users->getUser();\n        $this->check($user !== null, 'AUTH_REQUIRED');\n        $this->check($user->getUID() === self::USER, 'PILOT_ACCOUNT_DENIED');\n        $this->check($tableId === 6 && in_array($rowId,[37,38,39,40,41,42],true), 'PILOT_SCOPE_DENIED');\n    }\n    private function initialize(): void {\n        if ($this->db !== null) return;\n        $user = $this->users->getUser();\n        $this->check($user !== null && $this->apps->isEnabledForUser('tables',$user), 'TABLES_UNAVAILABLE');\n        $this->check($this->apps->getAppVersion('tables') === '2.3.1'\n            && $this->config->getSystemValue('dbtype','') === 'mysql', 'SERVER_VERSION_UNSUPPORTED');\n        $expectedHashes = [\n        'lib/Service/RowService.php' => '01901e23fe453844ac7a3393b28f5fbbc81ba4d16b9e8417d7827b403c73e2e6',\n        'lib/Db/Row2Mapper.php' => 'e12cd6fa6d6eb78f541680bb6da8dbab218d160c0c2c6966f8a3fcd2428d88cd',\n        'lib/Db/RowSleeveMapper.php' => 'dcdd56b51d1b8bbe96244d0464f19e1901e741288e959ccb37704890938835f6',\n        'lib/Db/RowCellMapperSuper.php' => 'fd15564da3651a20d145e6d825468f6e22504057218d0895e0ba40feac167e26',\n        'lib/Db/RowCellTextMapper.php' => '4eff18137535557d64b9cb411a612ede8f73ebd832f5671142198159e0ee8c06',\n        'lib/Db/TableMapper.php' => 'd0876a500448bd808e2a614f4e8e0260eaa10b2f063dbc11d6f5cca86be1d397',\n        'lib/Db/ColumnMapper.php' => 'b9944069d35452c84d0543ff882688f68240a7529066e74b8d243fbda2841e9a',\n        'lib/Service/TableService.php' => '011e30ad89bbff8b2912e0d4d532b6c93d827868d23eaac086e316e214db4113',\n        'lib/Dto/Column.php' => 'c252f253811de9f0f12192a3f4aef88879c1ce8552147835cc5dd350f10032f3',\n        'lib/Service/PermissionsService.php' => '47f4f704517c195c265acb21c9a3521b123ce79d233e791e0950340db2817ee7',\n        ];\n        $root = $this->apps->getAppPath('tables');\n        foreach ($expectedHashes as $file=>$hash) {\n            $this->check(is_file($root.'/'.$file) && hash_equals($hash,hash_file('sha256',$root.'/'.$file) ?: ''), 'TABLES_SOURCE_CHANGED');\n        }\n        $this->check($this->adapter instanceof \\OC\\DB\\ConnectionAdapter, 'DB_ADAPTER_UNSUPPORTED');\n        $this->db = $this->adapter->getInner();\n        $this->check(!$this->db->inTransaction() && $this->db->getTransactionNestingLevel() === 0, 'ACTIVE_OUTER_TRANSACTION');\n        $version = (string)$this->one($this->db,'SELECT VERSION()');\n        $this->check((bool)preg_match('/^10\\.11\\./',$version) && str_contains($version,'MariaDB'), 'DB_VERSION_UNSUPPORTED');\n        $this->baselineIsolation = (string)$this->one($this->db,'SELECT @@session.tx_isolation');\n        $prefix = $this->config->getSystemValue('dbtableprefix','oc_');\n        $schema = $this->config->getSystemValue('dbname','');\n        $this->check(is_string($prefix) && is_string($schema) && $schema !== '', 'DB_CONFIG_UNCLEAR');\n        foreach (['tables_tables','tables_columns','tables_row_sleeves','tables_row_cells_text','tables_row_cells_number','tables_row_cells_datetime','tables_row_cells_selection','tables_row_cells_usergroup'] as $name) {\n            $physical = $prefix.$name;\n            $this->names[$name] = $this->quoted($physical);\n            $this->check(strcasecmp((string)$this->one($this->db,'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',[$schema,$physical]),'InnoDB') === 0, 'ENGINE_CHANGED');\n            if (!str_starts_with($name,'tables_row_cells_')) continue;\n            $available = $this->all($this->db,'SELECT INDEX_NAME AS name, SEQ_IN_INDEX AS seq, COLUMN_NAME AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME,SEQ_IN_INDEX',[$schema,$physical]);\n            $grouped = [];\n            foreach ($available as $entry) $grouped[$entry['name']][(int)$entry['seq']] = $entry['col'];\n            foreach ($grouped as $index=>$parts) {\n                if (count($parts) === 2 && ($parts[1]??null) === 'column_id' && ($parts[2]??null) === 'row_id') {\n                    $this->indexes[$name] = $this->quoted($index); break;\n                }\n            }\n            $this->check(isset($this->indexes[$name]), 'CELL_INDEX_MISSING');\n        }\n        $container = (new \\OCA\\Tables\\AppInfo\\Application())->getContainer();\n        $this->rows = $container->get(\\OCA\\Tables\\Service\\RowService::class);\n        $this->permissions = $container->get(\\OCA\\Tables\\Service\\PermissionsService::class);\n    }\n    private function authorizedSnapshot(int $tableId, int $rowId, bool $write): array {\n        // Locking current reads precede the native permission checks and any MVCC read view.\n        $s = $this->snapshot($this->db,$this->names,$this->indexes,$tableId,$rowId,true);\n        $this->check($this->permissions->canReadRowsByElementId($tableId,'table',self::USER), 'READ_DENIED');\n        if ($write) $this->check($this->permissions->canUpdateRowsByTableId($tableId,self::USER), 'UPDATE_DENIED');\n        return $s;\n    }\n    private function rowData(array $s): array {\n        $cells = [];\n        foreach ($s['cells']['text'] as $columnId=>$stored) {\n            if ($stored) $cells[] = ['columnId'=>(int)$columnId,'value'=>$stored[0]['value']];\n        }\n        return ['id'=>(int)$s['sleeve']['id'],'tableId'=>6,\n            'createdAt'=>$s['sleeve']['created_at'],'lastEditAt'=>$s['sleeve']['last_edit_at'],'data'=>$cells];\n    }\n    private function isolationUnchanged(): void {\n        $this->check(!$this->db->inTransaction() && $this->db->getTransactionNestingLevel() === 0, 'TRANSACTION_LEFT_OPEN');\n        $this->check($this->one($this->db,'SELECT @@session.tx_isolation') === $this->baselineIsolation, 'SESSION_ISOLATION_CHANGED');\n    }\n    public function read(int $tableId, int $rowId): array {\n        $this->scope($tableId,$rowId); $this->initialize(); $this->begin($this->db);\n        try {\n            $s = $this->authorizedSnapshot($tableId,$rowId,false);\n            $result = ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,\n                'tableId'=>$tableId,'row'=>$this->rowData($s),'serverVersion'=>$this->versionOf($s),\n                'versionKind'=>'server-locked-raw-state','writeEnabled'=>$this->config->getAppValue('novaforge_tables','pilot_http_enabled','0') === '1'];\n        } finally { $this->rollback($this->db); }\n        $this->isolationUnchanged();\n        return $result;\n    }\n    private function patch(array $data): array {\n        $this->check(array_is_list($data) && count($data)>0 && count($data)<=3, 'INVALID_PATCH');\n        $seen = [];\n        foreach ($data as $cell) {\n            $this->check(is_array($cell), 'INVALID_PATCH');\n            $keys = array_keys($cell); sort($keys);\n            $this->check($keys === ['columnId','value'] && is_int($cell['columnId'])\n                && in_array($cell['columnId'],[26,27,28],true) && !isset($seen[$cell['columnId']])\n                && is_string($cell['value']) && strlen($cell['value'])<=200\n                && mb_check_encoding($cell['value'],'UTF-8') && !preg_match('/[\\r\\n\\x00]/',$cell['value']), 'INVALID_PATCH');\n            $seen[$cell['columnId']] = $cell['value'];\n        }\n        return $seen;\n    }\n    public function update(int $tableId, int $rowId, string $expectedVersion, array $data): array {\n        $this->scope($tableId,$rowId);\n        $this->check($this->config->getAppValue('novaforge_tables','pilot_http_enabled','0') === '1', 'PILOT_WRITE_DISABLED');\n        $this->check(!$this->updateUsed, 'REQUEST_UPDATE_ALREADY_USED');\n        $this->updateUsed = true;\n        $this->check((bool)preg_match('/^[a-f0-9]{64}$/D',$expectedVersion), 'INVALID_EXPECTED_VERSION');\n        $patch = $this->patch($data);\n        $this->initialize(); $this->begin($this->db);\n        $commitAttempted = false;\n        try {\n            $before = $this->authorizedSnapshot($tableId,$rowId,true);\n            $this->check(hash_equals($expectedVersion,$this->versionOf($before)), 'VERSION_CONFLICT');\n            $changed = false;\n            foreach ($patch as $id=>$value) {\n                $stored = $before['cells']['text'][(string)$id];\n                if (!$stored || $stored[0]['value'] !== $value) $changed = true;\n            }\n            if (!$changed) {\n                $this->rollback($this->db); $this->isolationUnchanged();\n                return ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,\n                    'status'=>'no_change','committed'=>false,'readbackVerified'=>true,\n                    'serverVersion'=>$expectedVersion,'row'=>$this->rowData($before)];\n            }\n            // One native update in this fresh HTTP request; no cached row read beforehand.\n            $this->rows->updateSet($rowId,null,$data,self::USER,$tableId);\n            $this->check($this->db->getTransactionNestingLevel() === 1, 'TRANSACTION_ESCAPED');\n            $after = $this->authorizedSnapshot($tableId,$rowId,true);\n            foreach ($patch as $id=>$value) {\n                $stored = $after['cells']['text'][(string)$id];\n                $this->check(count($stored) === 1 && $stored[0]['value'] === $value, 'WRITE_READBACK_MISMATCH');\n            }\n            foreach ($before['cells']['text'] as $id=>$stored) {\n                if (!array_key_exists((int)$id,$patch)) $this->check($after['cells']['text'][$id] === $stored, 'UNTOUCHED_CELL_CHANGED');\n            }\n            $newVersion = $this->versionOf($after);\n            $this->check(!hash_equals($expectedVersion,$newVersion), 'UNCHANGED_WRITE_VERSION');\n            $afterRow = $this->rowData($after);\n            $commitAttempted = true;\n            $this->db->commit();\n        } catch (\\Throwable $e) {\n            $rollbackConfirmed = true;\n            try { $this->rollback($this->db); $this->isolationUnchanged(); }\n            catch (\\Throwable $cleanup) { $rollbackConfirmed = false; }\n            if ($commitAttempted || !$rollbackConfirmed) {\n                return ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,\n                    'status'=>'commit_unknown','committed'=>null,'readbackVerified'=>false,\n                    'error'=>'COMMIT_OR_ROLLBACK_UNCONFIRMED','tableId'=>$tableId,'rowId'=>$rowId];\n            }\n            throw $e;\n        }\n        $result = ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,\n            'status'=>'committed','committed'=>true,'readbackVerified'=>false,\n            'serverVersion'=>$newVersion,'row'=>$afterRow];\n        try {\n            $this->isolationUnchanged();\n            $r = $this->read($tableId,$rowId);\n            if (hash_equals($newVersion,$r['serverVersion'])) $result['readbackVerified'] = true;\n            else {\n                $result['status'] = 'committed_changed_afterwards';\n                $result['currentServerVersion'] = $r['serverVersion']; $result['currentRow'] = $r['row'];\n            }\n        } catch (\\Throwable $e) { $result['status']='committed_readback_failed'; }\n        return $result;\n    }\n\n}\n", "lib/Controller/PilotController.php": "<?php\n// SPDX-License-Identifier: AGPL-3.0-or-later\ndeclare(strict_types=1);\nnamespace OCA\\NovaforgeTables\\Controller;\n\nuse OCP\\AppFramework\\OCSController;\nuse OCP\\AppFramework\\Http\\DataResponse;\nuse OCP\\AppFramework\\Http\\Attribute\\NoAdminRequired;\nuse OCP\\IRequest;\nuse OCP\\IUserSession;\nuse OCP\\IConfig;\nuse OCP\\IDBConnection;\nuse OCP\\App\\IAppManager;\nuse OCA\\NovaforgeTables\\Service\\PilotWriteService;\n\nfinal class PilotController extends OCSController {\n    public function __construct(string $appName, IRequest $request,\n        private IDBConnection $db, private IAppManager $apps,\n        private IConfig $config, private IUserSession $users) {\n        parent::__construct($appName,$request);\n    }\n    private function service(): PilotWriteService {\n        return new PilotWriteService($this->db,$this->apps,$this->config,$this->users);\n    }\n    private function response(array $data, int $status = 200): DataResponse {\n        return new DataResponse($data,$status,['Cache-Control'=>'no-store']);\n    }\n    private function parameters(array $allowed): void {\n        foreach (array_keys($this->request->getParams()) as $key) {\n            if (!in_array($key,array_merge($allowed,['format','_route']),true)) throw new \\RuntimeException('UNKNOWN_PARAMETER');\n        }\n    }\n    private function failure(\\Throwable $e): DataResponse {\n        $code = $e instanceof \\RuntimeException ? $e->getMessage() : 'PILOT_RUNTIME_FAILURE';\n        $known = ['AUTH_REQUIRED','PILOT_ACCOUNT_DENIED','PILOT_SCOPE_DENIED','PILOT_WRITE_DISABLED',\n            'READ_DENIED','UPDATE_DENIED','INVALID_PATCH','INVALID_EXPECTED_VERSION',\n            'VERSION_CONFLICT','UNKNOWN_PARAMETER','JSON_REQUIRED','TABLES_SOURCE_CHANGED',\n            'NOT_OWN_PILOT','PILOT_STRUCTURE_CHANGED','UNSUPPORTED_PILOT_COLUMN',\n            'ROW_TABLE_MISMATCH','AMBIGUOUS_CELL_STORAGE'];\n        if (!in_array($code,$known,true)) $code = 'PILOT_RUNTIME_FAILURE';\n        for ($cause=$e,$depth=0;$cause && $depth<8;$cause=$cause->getPrevious(),$depth++) {\n            if (preg_match('/lock wait timeout|1205/i',$cause->getMessage())) $code = 'LOCK_TIMEOUT';\n        }\n        $status = match ($code) {\n            'AUTH_REQUIRED'=>401,\n            'PILOT_ACCOUNT_DENIED','PILOT_SCOPE_DENIED','READ_DENIED','UPDATE_DENIED','PILOT_WRITE_DISABLED'=>403,\n            'INVALID_PATCH','INVALID_EXPECTED_VERSION','UNKNOWN_PARAMETER','JSON_REQUIRED'=>400,\n            'VERSION_CONFLICT'=>409,\n            'LOCK_TIMEOUT'=>423,\n            default=>503,\n        };\n        return $this->response(['error'=>$code,'pilotOnly'=>true,'committed'=>false],$status);\n    }\n    // Preserve Nextcloud's authentication, two-factor and OCS CSRF middleware.\n    // API clients must send OCS-APIRequest: true. No PublicPage/CORS/NoCSRFRequired.\n    #[NoAdminRequired]\n    public function version(int $tableId, int $rowId): DataResponse {\n        try {\n            $this->parameters(['tableId','rowId']);\n            return $this->response($this->service()->read($tableId,$rowId));\n        } catch (\\Throwable $e) { return $this->failure($e); }\n    }\n    #[NoAdminRequired]\n    public function update(int $tableId, int $rowId, string $expectedVersion, array $data): DataResponse {\n        try {\n            $this->parameters(['tableId','rowId','expectedVersion','data']);\n            if (!preg_match('~^application/json(?:\\s*;|$)~i',$this->request->getHeader('Content-Type'))) throw new \\RuntimeException('JSON_REQUIRED');\n            $result = $this->service()->update($tableId,$rowId,$expectedVersion,$data);\n            return $this->response($result,$result['committed'] === null ? 503 : 200);\n        } catch (\\Throwable $e) { return $this->failure($e); }\n    }\n}\n", "appinfo/routes.php": "<?php\ndeclare(strict_types=1);\nreturn ['ocs' => [\n ['name'=>'tables#list','url'=>'/api/v1/list','verb'=>'GET'],\n ['name'=>'pilot#version','url'=>'/api/v1/pilot/tables/{tableId}/rows/{rowId}/version','verb'=>'GET'],\n ['name'=>'pilot#update','url'=>'/api/v1/pilot/tables/{tableId}/rows/{rowId}','verb'=>'PUT'],\n]];\n", "appinfo/info.xml": "<?xml version=\"1.0\"?>\n<info xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:noNamespaceSchemaLocation=\"https://apps.nextcloud.com/schema/apps/info.xsd\">\n  <id>novaforge_tables</id><name>NOVAFORGE Tables Read Bridge</name>\n  <summary>Read visible Tables without automatic tutorial creation</summary>\n  <description>Account-bound read bridge and strictly limited HTTP pilot updates for synthetic table 6. No general record writes or public shares.</description>\n  <version>0.1.1</version><licence>agpl</licence><author>NOVAFORGE</author>\n  <namespace>NovaforgeTables</namespace><category>tools</category>\n  <dependencies><nextcloud min-version=\"34\" max-version=\"34\"/><php min-version=\"8.3\"/></dependencies>\n</info>\n"}
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
