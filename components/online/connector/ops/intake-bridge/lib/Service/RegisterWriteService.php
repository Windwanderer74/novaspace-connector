<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaforgeTables\Service;
use RuntimeException;

final class RegisterWriteService {
    public const USER = 'ChatGPT';
    public const TITLE = 'NOVAFORGE Dokumentregister / 1';
    private ?\OC\DB\Connection $db = null;
    private array $names = [];
    private array $indexes = [];
    private $rows;
    private $permissions;
    private bool $updateUsed = false;
    private int $documentKeyCount = 0;
    private float $deadline = 0;
    private string $baselineIsolation = '';
    public function __construct(
        private \OCP\IDBConnection $adapter,
        private \OCP\App\IAppManager $apps,
        private \OCP\IConfig $config,
        private \OCP\IUserSession $users,
    ) {}
private function check(bool $value, string $code): void {
    if (!$value) throw new RuntimeException($code);
}
private function releaseResult($result): void {
    if ($result instanceof \OCP\DB\IResult) $result->closeCursor();
    elseif ($result instanceof \Doctrine\DBAL\Result) $result->free();
    else throw new RuntimeException('UNSUPPORTED_DB_RESULT');
}
private function all($db, string $sql, array $params = []): array {
    $this->check($this->deadline===0.0 || microtime(true)<$this->deadline,'REGISTER_TIME_LIMIT');
    $result = $db->executeQuery($sql, $params);
    try { $rows=$result->fetchAllAssociative(); $this->check($this->deadline===0.0 || microtime(true)<$this->deadline,'REGISTER_TIME_LIMIT'); return $rows; }
    finally { $this->releaseResult($result); }
}
private function one($db, string $sql, array $params = []) {
    $result = $db->executeQuery($sql, $params);
    try { return $result->fetchOne(); }
    finally { $this->releaseResult($result); }
}
private function quoted(string $identifier): string {
    $this->check((bool)preg_match('/^[a-zA-Z0-9_]+$/D', $identifier), 'UNSAFE_IDENTIFIER');
    return '`'.$identifier.'`';
}
private function rollback($db): void {
    if (!$db) return;
    for ($depth=0; $db->inTransaction() && $depth<16; $depth++) $db->rollBack();
    $this->check(!$db->inTransaction(), 'ROLLBACK_INCOMPLETE'); $this->deadline=0;
}
private function begin($db): void {
    $this->check(!$db->inTransaction() && $db->getTransactionNestingLevel() === 0, 'NESTED_TRANSACTION');
    // No SESSION/GLOBAL change. This setting applies to this next transaction only.
    $db->executeStatement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $db->beginTransaction(); $this->deadline=microtime(true)+20;
    $this->check($db->getTransactionNestingLevel() === 1, 'TRANSACTION_NOT_STARTED');
}
private function snapshot($db, array $names, array $indexes, int $tableId, int $rowId, bool $lock): array {
    $suffix = $lock ? ' FOR UPDATE WAIT 1' : '';
    // First reads are locking current reads. Do not create an earlier MVCC read view.
    $table = $this->all($db, 'SELECT * FROM '.$names['tables_tables'].' WHERE id = ?'.$suffix, [$tableId]);
    $this->check(count($table) === 1 && $table[0]['ownership'] === self::USER
        && $table[0]['title'] === self::TITLE && array_key_exists('archived',$table[0]) && !$table[0]['archived'], 'NOT_OWN_REGISTER');
    $columns = $this->all($db, 'SELECT * FROM '.$names['tables_columns'].' WHERE table_id = ? ORDER BY id'.$suffix, [$tableId]);
    $schema=$this->schema(); $expected=array_values($schema['columns']); sort($expected);
    $this->check(array_map(fn($c)=>(int)$c['id'], $columns) === $expected, 'REGISTER_STRUCTURE_CHANGED');
    foreach ($columns as $column) $this->check(($schema['columns'][$column['title']]??null)===(int)$column['id'], 'REGISTER_STRUCTURE_CHANGED');
    foreach ($columns as $column) $this->check($column['type'] === 'text' && $column['subtype'] === 'line' && !(bool)$column['mandatory'] && !(bool)$column['text_unique'] && (int)$column['text_max_length'] === 2048, 'UNSUPPORTED_REGISTER_COLUMN');
    $sleeves = $this->all($db, 'SELECT * FROM '.$names['tables_row_sleeves'].' WHERE id = ? AND table_id = ?'.$suffix, [$rowId, $tableId]);
    $this->check(count($sleeves) === 1, 'ROW_TABLE_MISMATCH');
    $cells = [];
    foreach (['text','number','datetime','selection','usergroup'] as $type) {
        $key = 'tables_row_cells_'.$type;
        $cells[$type] = [];
        foreach ($columns as $column) {
            $rows = $this->all($db, 'SELECT * FROM '.$names[$key].' FORCE INDEX ('.$indexes[$key].')'
                .' WHERE column_id = ? AND row_id = ? ORDER BY id'.$suffix, [(int)$column['id'], $rowId]);
            // The pilot is deliberately text-only: any other storage or duplicate is rejected.
            $this->check(($type === 'text' && count($rows) <= 1) || ($type !== 'text' && count($rows) === 0), 'AMBIGUOUS_CELL_STORAGE');
            $cells[$type][(string)$column['id']] = $rows;
        }
    }
    return ['account'=>self::USER, 'table'=>$table[0], 'columns'=>$columns, 'sleeve'=>$sleeves[0], 'cells'=>$cells];
}
private function versionOf(array $snapshot): string {
    return hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
private function readVersion($db, array $names, array $indexes, int $tableId, int $rowId): string {
    $this->begin($db);
    try { return $this->versionOf($this->snapshot($db, $names, $indexes, $tableId, $rowId, true)); }
    finally { $this->rollback($db); }
}

    public const FIELDS = ['documentId','sourceInstance','sourceAccount','sourceFileId','sourcePath','sourceEtag','sha256','role','originDocumentId','aktenzeichen','vorgang','status','openQuestions','sizeBytes','pageCount','receivedAtUtc','verification'];
    private function schema(): array {
        $schema=json_decode($this->config->getAppValue('novaforge_tables','register_schema','{}'),true);
        $this->check(is_array($schema) && is_int($schema['tableId']??null) && $schema['tableId']>0 && is_array($schema['columns']??null),'REGISTER_NOT_INSTALLED');
        $keys=array_keys($schema['columns']); sort($keys); $expected=self::FIELDS; sort($expected);
        $this->check($keys===$expected && count(array_unique(array_values($schema['columns'])))===count(self::FIELDS),'REGISTER_STRUCTURE_CHANGED');
        foreach ($schema['columns'] as $id) $this->check(is_int($id) && $id>0,'REGISTER_STRUCTURE_CHANGED');
        return $schema;
    }
    private function scope(int $tableId, int $rowId): void {
        $user=$this->users->getUser(); $this->check($user!==null,'AUTH_REQUIRED');
        $this->check($user->getUID()===self::USER,'REGISTER_ACCOUNT_DENIED');
        $this->check($tableId===$this->schema()['tableId'] && $rowId>0,'REGISTER_SCOPE_DENIED');
    }
    public function status(): array {
        $schema=$this->schema(); $this->scope($schema['tableId'],1); $this->initialize();
        $this->begin($this->db);
        try { $this->lockStructure($schema['tableId']); }
        finally { $this->rollback($this->db); }
        $this->isolationUnchanged();
        return ['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,'tableId'=>$schema['tableId'],'columns'=>$schema['columns'],'title'=>self::TITLE,'writeEnabled'=>$this->config->getAppValue('novaforge_tables','register_http_enabled','0')==='1','hostSelftestPassed'=>$this->config->getAppValue('novaforge_tables','register_selftest_passed','0')==='1','maxRows'=>5000];
    }
    private function lockStructure(int $tableId): array {
        $tables=$this->all($this->db,'SELECT * FROM '.$this->names['tables_tables'].' WHERE id = ? FOR UPDATE WAIT 1',[$tableId]);
        $this->check(count($tables)===1 && $tables[0]['ownership']===self::USER && $tables[0]['title']===self::TITLE && !$tables[0]['archived'],'NOT_OWN_REGISTER');
        $columns=$this->all($this->db,'SELECT * FROM '.$this->names['tables_columns'].' WHERE table_id = ? ORDER BY id FOR UPDATE WAIT 1',[$tableId]);
        $schema=$this->schema(); $expected=array_values($schema['columns']); sort($expected);
        $this->check(array_map(fn($c)=>(int)$c['id'],$columns)===$expected,'REGISTER_STRUCTURE_CHANGED');
        foreach ($columns as $c) $this->check(($schema['columns'][$c['title']]??null)===(int)$c['id'] && $c['type']==='text' && $c['subtype']==='line' && !(bool)$c['mandatory'] && !(bool)$c['text_unique'] && (int)$c['text_max_length']===2048,'REGISTER_STRUCTURE_CHANGED');
        $this->check($this->permissions->canReadRowsByElementId($tableId,'table',self::USER),'READ_DENIED');
        return $schema;
    }
    private function documentRow(int $tableId,string $documentId): ?int {
        $this->check((bool)preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$documentId),'INVALID_DOCUMENT_ID');
        $schema=$this->lockStructure($tableId);
        // Lock the complete indexed document-id range, including insertion gaps.
        $cells=$this->all($this->db,'SELECT * FROM '.$this->names['tables_row_cells_text'].' FORCE INDEX ('.$this->indexes['tables_row_cells_text'].') WHERE column_id = ? ORDER BY row_id LIMIT 5001 FOR UPDATE WAIT 1',[$schema['columns']['documentId']]);
        $this->check(count($cells)<=5000,'REGISTER_LIMIT'); $this->documentKeyCount=count($cells); $matched=[];
        foreach ($cells as $c) if ($c['value']===$documentId) $matched[]=(int)$c['row_id'];
        $this->check(count($matched)<=1,'DUPLICATE_DOCUMENT_ID');
        return $matched[0]??null;
    }
    public function find(string $documentId): array {
        $tableId=$this->schema()['tableId']; $this->scope($tableId,1); $this->initialize(); $this->begin($this->db);
        try { $id=$this->documentRow($tableId,$documentId); }
        finally { $this->rollback($this->db); }
        $this->isolationUnchanged();
        return $id===null?['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,'tableId'=>$tableId,'documentId'=>$documentId,'found'=>false]:array_merge($this->read($tableId,$id),['documentId'=>$documentId,'found'=>true]);
    }
    private function initialize(): void {
        if ($this->db !== null) return;
        $user = $this->users->getUser();
        $this->check($user !== null && $this->apps->isEnabledForUser('tables',$user), 'TABLES_UNAVAILABLE');
        $this->check($this->apps->getAppVersion('tables') === '2.3.1'
            && $this->config->getSystemValue('dbtype','') === 'mysql', 'SERVER_VERSION_UNSUPPORTED');
        $expectedHashes = [
        'lib/Service/RowService.php' => '01901e23fe453844ac7a3393b28f5fbbc81ba4d16b9e8417d7827b403c73e2e6',
        'lib/Db/Row2Mapper.php' => 'e12cd6fa6d6eb78f541680bb6da8dbab218d160c0c2c6966f8a3fcd2428d88cd',
        'lib/Db/RowSleeveMapper.php' => 'dcdd56b51d1b8bbe96244d0464f19e1901e741288e959ccb37704890938835f6',
        'lib/Db/RowCellMapperSuper.php' => 'fd15564da3651a20d145e6d825468f6e22504057218d0895e0ba40feac167e26',
        'lib/Db/RowCellTextMapper.php' => '4eff18137535557d64b9cb411a612ede8f73ebd832f5671142198159e0ee8c06',
        'lib/Db/TableMapper.php' => 'd0876a500448bd808e2a614f4e8e0260eaa10b2f063dbc11d6f5cca86be1d397',
        'lib/Db/ColumnMapper.php' => 'b9944069d35452c84d0543ff882688f68240a7529066e74b8d243fbda2841e9a',
        'lib/Service/TableService.php' => '011e30ad89bbff8b2912e0d4d532b6c93d827868d23eaac086e316e214db4113',
        'lib/Dto/Column.php' => 'c252f253811de9f0f12192a3f4aef88879c1ce8552147835cc5dd350f10032f3',
        'lib/Service/PermissionsService.php' => '47f4f704517c195c265acb21c9a3521b123ce79d233e791e0950340db2817ee7',
        ];
        $root = $this->apps->getAppPath('tables');
        foreach ($expectedHashes as $file=>$hash) {
            $this->check(is_file($root.'/'.$file) && hash_equals($hash,hash_file('sha256',$root.'/'.$file) ?: ''), 'TABLES_SOURCE_CHANGED');
        }
        $this->check($this->adapter instanceof \OC\DB\ConnectionAdapter, 'DB_ADAPTER_UNSUPPORTED');
        $this->db = $this->adapter->getInner();
        $this->check(!$this->db->inTransaction() && $this->db->getTransactionNestingLevel() === 0, 'ACTIVE_OUTER_TRANSACTION');
        $version = (string)$this->one($this->db,'SELECT VERSION()');
        $this->check((bool)preg_match('/^10\.11\./',$version) && str_contains($version,'MariaDB'), 'DB_VERSION_UNSUPPORTED');
        $this->baselineIsolation = (string)$this->one($this->db,'SELECT @@session.tx_isolation');
        $prefix = $this->config->getSystemValue('dbtableprefix','oc_');
        $schema = $this->config->getSystemValue('dbname','');
        $this->check(is_string($prefix) && is_string($schema) && $schema !== '', 'DB_CONFIG_UNCLEAR');
        foreach (['tables_tables','tables_columns','tables_row_sleeves','tables_row_cells_text','tables_row_cells_number','tables_row_cells_datetime','tables_row_cells_selection','tables_row_cells_usergroup'] as $name) {
            $physical = $prefix.$name;
            $this->names[$name] = $this->quoted($physical);
            $this->check(strcasecmp((string)$this->one($this->db,'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',[$schema,$physical]),'InnoDB') === 0, 'ENGINE_CHANGED');
            if (!str_starts_with($name,'tables_row_cells_')) continue;
            $available = $this->all($this->db,'SELECT INDEX_NAME AS name, SEQ_IN_INDEX AS seq, COLUMN_NAME AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME,SEQ_IN_INDEX',[$schema,$physical]);
            $grouped = [];
            foreach ($available as $entry) $grouped[$entry['name']][(int)$entry['seq']] = $entry['col'];
            foreach ($grouped as $index=>$parts) {
                if (count($parts) === 2 && ($parts[1]??null) === 'column_id' && ($parts[2]??null) === 'row_id') {
                    $this->indexes[$name] = $this->quoted($index); break;
                }
            }
            $this->check(isset($this->indexes[$name]), 'CELL_INDEX_MISSING');
        }
        $container = (new \OCA\Tables\AppInfo\Application())->getContainer();
        $this->rows = $container->get(\OCA\Tables\Service\RowService::class);
        $this->permissions = $container->get(\OCA\Tables\Service\PermissionsService::class);
    }
    private function authorizedSnapshot(int $tableId, int $rowId, bool $write): array {
        // Locking current reads precede the native permission checks and any MVCC read view.
        $s = $this->snapshot($this->db,$this->names,$this->indexes,$tableId,$rowId,true);
        $this->check($this->permissions->canReadRowsByElementId($tableId,'table',self::USER), 'READ_DENIED');
        if ($write) $this->check($this->permissions->canUpdateRowsByTableId($tableId,self::USER), 'UPDATE_DENIED');
        return $s;
    }
    private function rowData(array $s): array {
        $cells = [];
        foreach ($s['cells']['text'] as $columnId=>$stored) {
            if ($stored) $cells[] = ['columnId'=>(int)$columnId,'value'=>$stored[0]['value']];
        }
        return ['id'=>(int)$s['sleeve']['id'],'tableId'=>(int)$s['table']['id'],
            'createdAt'=>$s['sleeve']['created_at'],'lastEditAt'=>$s['sleeve']['last_edit_at'],'data'=>$cells];
    }
    private function isolationUnchanged(): void {
        $this->check(!$this->db->inTransaction() && $this->db->getTransactionNestingLevel() === 0, 'TRANSACTION_LEFT_OPEN');
        $this->check($this->one($this->db,'SELECT @@session.tx_isolation') === $this->baselineIsolation, 'SESSION_ISOLATION_CHANGED');
    }
    public function read(int $tableId, int $rowId): array {
        $this->scope($tableId,$rowId); $this->initialize(); $this->begin($this->db);
        try {
            $s = $this->authorizedSnapshot($tableId,$rowId,false);
            $result = ['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,
                'tableId'=>$tableId,'row'=>$this->rowData($s),'serverVersion'=>$this->versionOf($s),
                'record'=>$this->record($s),'versionKind'=>'server-locked-raw-state','writeEnabled'=>$this->config->getAppValue('novaforge_tables','register_http_enabled','0') === '1'];
        } finally { $this->rollback($this->db); }
        $this->isolationUnchanged();
        return $result;
    }
    private function patch(array $data, bool $creating = false): array {
        $this->check(array_is_list($data) && count($data)>0 && count($data)<=count(self::FIELDS), 'INVALID_PATCH');
        $seen = [];
        foreach ($data as $cell) {
            $this->check(is_array($cell), 'INVALID_PATCH');
            $keys = array_keys($cell); sort($keys);
            $this->check($keys === ['columnId','value'] && is_int($cell['columnId'])
                && in_array($cell['columnId'],array_values($this->schema()['columns']),true) && !isset($seen[$cell['columnId']])
                && is_string($cell['value']) && strlen($cell['value'])<=2048
                && mb_check_encoding($cell['value'],'UTF-8') && !preg_match('/[\r\n\x00]/',$cell['value']), 'INVALID_PATCH');
            if (!$creating) $this->check(in_array($cell['columnId'],array_intersect_key($this->schema()['columns'],array_flip(['role','aktenzeichen','vorgang','status','openQuestions','verification'])),true),'IMMUTABLE_SOURCE_FIELD');
            $seen[$cell['columnId']] = $cell['value'];
        }
        return $seen;
    }
    public function update(int $tableId, int $rowId, string $expectedVersion, array $data): array {
        $this->scope($tableId,$rowId);
        $this->check($this->config->getAppValue('novaforge_tables','register_http_enabled','0') === '1', 'REGISTER_WRITE_DISABLED');
        $this->check(!$this->updateUsed, 'REQUEST_UPDATE_ALREADY_USED');
        $this->updateUsed = true;
        $this->check((bool)preg_match('/^[a-f0-9]{64}$/D',$expectedVersion), 'INVALID_EXPECTED_VERSION');
        $patch = $this->patch($data);
        $this->initialize(); $this->begin($this->db);
        $commitAttempted = false;
        try {
            $before = $this->authorizedSnapshot($tableId,$rowId,true);
            $this->check(hash_equals($expectedVersion,$this->versionOf($before)), 'VERSION_CONFLICT');
            $changed = false;
            foreach ($patch as $id=>$value) {
                $stored = $before['cells']['text'][(string)$id];
                if (!$stored || $stored[0]['value'] !== $value) $changed = true;
            }
            if (!$changed) {
                $this->rollback($this->db); $this->isolationUnchanged();
                return ['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,
                    'status'=>'no_change','committed'=>false,'readbackVerified'=>true,
                    'serverVersion'=>$expectedVersion,'row'=>$this->rowData($before)];
            }
            // One native update in this fresh HTTP request; no cached row read beforehand.
            $this->rows->updateSet($rowId,null,$data,self::USER,$tableId);
            $this->check($this->db->getTransactionNestingLevel() === 1, 'TRANSACTION_ESCAPED');
            $after = $this->authorizedSnapshot($tableId,$rowId,true);
            foreach ($patch as $id=>$value) {
                $stored = $after['cells']['text'][(string)$id];
                $this->check(count($stored) === 1 && $stored[0]['value'] === $value, 'WRITE_READBACK_MISMATCH');
            }
            foreach ($before['cells']['text'] as $id=>$stored) {
                if (!array_key_exists((int)$id,$patch)) $this->check($after['cells']['text'][$id] === $stored, 'UNTOUCHED_CELL_CHANGED');
            }
            $newVersion = $this->versionOf($after);
            $this->check(!hash_equals($expectedVersion,$newVersion), 'UNCHANGED_WRITE_VERSION');
            $afterRow = $this->rowData($after);
            $commitAttempted = true;
            $this->db->commit();
        } catch (\Throwable $e) {
            $rollbackConfirmed = true;
            try { $this->rollback($this->db); $this->isolationUnchanged(); }
            catch (\Throwable $cleanup) { $rollbackConfirmed = false; }
            if ($commitAttempted || !$rollbackConfirmed) {
                return ['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,
                    'status'=>'commit_unknown','committed'=>null,'readbackVerified'=>false,
                    'error'=>'COMMIT_OR_ROLLBACK_UNCONFIRMED','tableId'=>$tableId,'rowId'=>$rowId];
            }
            throw $e;
        }
        $result = ['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,
            'status'=>'committed','committed'=>true,'readbackVerified'=>false,
            'serverVersion'=>$newVersion,'row'=>$afterRow];
        try {
            $this->isolationUnchanged();
            $r = $this->read($tableId,$rowId);
            if (hash_equals($newVersion,$r['serverVersion'])) $result['readbackVerified'] = true;
            else {
                $result['status'] = 'committed_changed_afterwards';
                $result['currentServerVersion'] = $r['serverVersion']; $result['currentRow'] = $r['row'];
            }
        } catch (\Throwable $e) { $result['status']='committed_readback_failed'; }
        return $result;
    }

    private function record(array $s): array {
        $out=[]; foreach ($this->schema()['columns'] as $key=>$id) $out[$key]=$s['cells']['text'][(string)$id][0]['value']??null; return $out;
    }
    public function create(string $documentId,array $values): array {
        $tableId=$this->schema()['tableId']; $this->scope($tableId,1);
        $this->check($this->config->getAppValue('novaforge_tables','register_http_enabled','0')==='1','REGISTER_WRITE_DISABLED');
        $keys=array_keys($values); sort($keys); $required=array_diff(self::FIELDS,['documentId']); sort($required);
        $this->check($keys===$required,'INVALID_RECORD'); $values['documentId']=$documentId;
        foreach ($values as $v) $this->check(is_string($v) && strlen($v)<=2048 && mb_check_encoding($v,'UTF-8') && !preg_match('/[\r\n\x00]/',$v),'INVALID_RECORD');
        $this->check($values['sourceAccount']===self::USER && $values['sourceInstance']==='https://cloud.example.invalid' && preg_match('/^[1-9][0-9]*$/D',$values['sourceFileId']) && preg_match('/^[a-f0-9]{64}$/D',$values['sha256']) && str_starts_with($values['sourcePath'],'/') && !in_array('..',explode('/',$values['sourcePath']),true) && preg_match('/^"[^"\r\n]+"$/D',$values['sourceEtag']) && preg_match('/^[0-9]+$/D',$values['sizeBytes']) && preg_match('/^[0-9]*$/D',$values['pageCount']) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/D',$values['receivedAtUtc']),'INVALID_RECORD');
        $schema=$this->schema(); $data=[]; foreach ($values as $key=>$v) $data[]=['columnId'=>$schema['columns'][$key],'value'=>$v];
        $patch=$this->patch($data,true); $this->initialize(); $this->begin($this->db); $attempted=false;
        try {
            $existing=$this->documentRow($tableId,$documentId);
            if ($existing!==null) {
                $s=$this->authorizedSnapshot($tableId,$existing,false);
                foreach ($patch as $id=>$value) $this->check(($s['cells']['text'][(string)$id][0]['value']??null)===$value,'DOCUMENT_ID_CONFLICT');
                $this->rollback($this->db); $this->isolationUnchanged();
                return array_merge($this->read($tableId,$existing),['status'=>'already_present','committed'=>false,'readbackVerified'=>true,'documentId'=>$documentId]);
            }
            $this->check($this->documentKeyCount<5000,'REGISTER_LIMIT');
            // Native RowService::create enforces effective creation permission; ownership is locked above.
            $created=$this->rows->create($tableId,null,$data,self::USER); $rowId=$created->getId();
            $this->check($this->db->getTransactionNestingLevel()===1,'TRANSACTION_ESCAPED');
            $s=$this->authorizedSnapshot($tableId,$rowId,false);
            foreach ($patch as $id=>$value) $this->check(($s['cells']['text'][(string)$id][0]['value']??null)===$value,'WRITE_READBACK_MISMATCH');
            $version=$this->versionOf($s); $attempted=true; $this->db->commit();
        } catch (\Throwable $e) {
            $clean=true; try { $this->rollback($this->db); $this->isolationUnchanged(); } catch (\Throwable $cleanup) { $clean=false; }
            if ($attempted || !$clean) return ['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,'status'=>'commit_unknown','committed'=>null,'readbackVerified'=>false,'tableId'=>$tableId,'documentId'=>$documentId];
            throw $e;
        }
        $result=['account'=>self::USER,'bridgeVersion'=>'0.2.0','protocol'=>1,'registerOnly'=>true,'tableId'=>$tableId,'documentId'=>$documentId,'status'=>'committed','committed'=>true,'readbackVerified'=>false,'serverVersion'=>$version,'row'=>$this->rowData($s),'record'=>$this->record($s)];
        try { $this->isolationUnchanged(); $after=$this->read($tableId,$rowId); if(hash_equals($version,$after['serverVersion']))$result['readbackVerified']=true;else{$result['status']='committed_changed_afterwards';$result['currentRow']=$after['row'];$result['currentServerVersion']=$after['serverVersion'];} }
        catch(\Throwable $e){$result['status']='committed_readback_failed';}
        return $result;
    }

}
