<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaforgeTables\Service;
use RuntimeException;

final class PilotWriteService {
    public const USER = 'ChatGPT';
    public const TITLE = 'NOVAFORGE Schreibschutz-Pilot 2026-10-03 / 0.1.1';
    private ?\OC\DB\Connection $db = null;
    private array $names = [];
    private array $indexes = [];
    private $rows;
    private $permissions;
    private bool $updateUsed = false;
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
    $result = $db->executeQuery($sql, $params);
    try { return $result->fetchAllAssociative(); }
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
    $this->check(!$db->inTransaction(), 'ROLLBACK_INCOMPLETE');
}
private function begin($db): void {
    $this->check(!$db->inTransaction() && $db->getTransactionNestingLevel() === 0, 'NESTED_TRANSACTION');
    // No SESSION/GLOBAL change. This setting applies to this next transaction only.
    $db->executeStatement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $db->beginTransaction();
    $this->check($db->getTransactionNestingLevel() === 1, 'TRANSACTION_NOT_STARTED');
}
private function snapshot($db, array $names, array $indexes, int $tableId, int $rowId, bool $lock): array {
    $suffix = $lock ? ' FOR UPDATE WAIT 1' : '';
    // First reads are locking current reads. Do not create an earlier MVCC read view.
    $table = $this->all($db, 'SELECT * FROM '.$names['tables_tables'].' WHERE id = ?'.$suffix, [$tableId]);
    $this->check(count($table) === 1 && $table[0]['ownership'] === self::USER
        && $table[0]['title'] === self::TITLE && array_key_exists('archived',$table[0]) && !$table[0]['archived'], 'NOT_OWN_PILOT');
    $columns = $this->all($db, 'SELECT * FROM '.$names['tables_columns'].' WHERE table_id = ? ORDER BY id'.$suffix, [$tableId]);
    $this->check(array_map(fn($c)=>(int)$c['id'], $columns) === [26,27,28], 'PILOT_STRUCTURE_CHANGED');
    foreach ($columns as $column) $this->check($column['type'] === 'text' && $column['subtype'] === 'line' && !(bool)$column['mandatory'] && !(bool)$column['text_unique'] && (int)$column['text_max_length'] === 200, 'UNSUPPORTED_PILOT_COLUMN');
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

    private function scope(int $tableId, int $rowId): void {
        $user = $this->users->getUser();
        $this->check($user !== null, 'AUTH_REQUIRED');
        $this->check($user->getUID() === self::USER, 'PILOT_ACCOUNT_DENIED');
        $this->check($tableId === 6 && in_array($rowId,[37,38,39,40,41,42],true), 'PILOT_SCOPE_DENIED');
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
        return ['id'=>(int)$s['sleeve']['id'],'tableId'=>6,
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
            $result = ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,
                'tableId'=>$tableId,'row'=>$this->rowData($s),'serverVersion'=>$this->versionOf($s),
                'versionKind'=>'server-locked-raw-state','writeEnabled'=>$this->config->getAppValue('novaforge_tables','pilot_http_enabled','0') === '1'];
        } finally { $this->rollback($this->db); }
        $this->isolationUnchanged();
        return $result;
    }
    private function patch(array $data): array {
        $this->check(array_is_list($data) && count($data)>0 && count($data)<=3, 'INVALID_PATCH');
        $seen = [];
        foreach ($data as $cell) {
            $this->check(is_array($cell), 'INVALID_PATCH');
            $keys = array_keys($cell); sort($keys);
            $this->check($keys === ['columnId','value'] && is_int($cell['columnId'])
                && in_array($cell['columnId'],[26,27,28],true) && !isset($seen[$cell['columnId']])
                && is_string($cell['value']) && strlen($cell['value'])<=200
                && mb_check_encoding($cell['value'],'UTF-8') && !preg_match('/[\r\n\x00]/',$cell['value']), 'INVALID_PATCH');
            $seen[$cell['columnId']] = $cell['value'];
        }
        return $seen;
    }
    public function update(int $tableId, int $rowId, string $expectedVersion, array $data): array {
        $this->scope($tableId,$rowId);
        $this->check($this->config->getAppValue('novaforge_tables','pilot_http_enabled','0') === '1', 'PILOT_WRITE_DISABLED');
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
                return ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,
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
                return ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,
                    'status'=>'commit_unknown','committed'=>null,'readbackVerified'=>false,
                    'error'=>'COMMIT_OR_ROLLBACK_UNCONFIRMED','tableId'=>$tableId,'rowId'=>$rowId];
            }
            throw $e;
        }
        $result = ['account'=>self::USER,'bridgeVersion'=>'0.1.1','protocol'=>1,'pilotOnly'=>true,
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

}
