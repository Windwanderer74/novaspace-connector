<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
/** NOVAFORGE isolated Tables storage/RowService pilot 0.1.1. Not an installed bridge. */
declare(strict_types=1);
// Public source edition: historical installation-specific maintenance script.
if (getenv('NOVASPACE_ENABLE_LEGACY_INSTANCE_SCRIPTS') !== 'I_REVIEWED_THE_SOURCE') { fwrite(STDERR, "STOP: Historical instance-bound script. Read LEGACY_OPS.md before enabling.\n"); exit(78); }

if (PHP_SAPI !== 'cli' || !in_array('--run-own-pilot', $argv, true) || !is_file(getcwd().'/lib/base.php')) {
    fwrite(STDERR, "STOPP: Im Nextcloud-Hauptordner per PHP CLI mit --run-own-pilot ausführen.\n");
    exit(1);
}
define('OC_CONSOLE', true);

const NF_PILOT_TITLE = 'NOVAFORGE Schreibschutz-Pilot 2026-10-03 / 0.1.1';
const NF_PILOT_USER = 'ChatGPT';

function nfAssert(bool $value, string $code): void {
    if (!$value) throw new RuntimeException($code);
}
function nfReleaseResult($result): void {
    if ($result instanceof \OCP\DB\IResult) $result->closeCursor();
    elseif ($result instanceof \Doctrine\DBAL\Result) $result->free();
    else throw new RuntimeException('UNSUPPORTED_DB_RESULT');
}
function nfAll($db, string $sql, array $params = []): array {
    $result = $db->executeQuery($sql, $params);
    try { return $result->fetchAllAssociative(); }
    finally { nfReleaseResult($result); }
}
function nfOne($db, string $sql, array $params = []) {
    $result = $db->executeQuery($sql, $params);
    try { return $result->fetchOne(); }
    finally { nfReleaseResult($result); }
}
function nfQuoted(string $identifier): string {
    nfAssert((bool)preg_match('/^[a-zA-Z0-9_]+$/D', $identifier), 'UNSAFE_IDENTIFIER');
    return '`'.$identifier.'`';
}
function nfRollback($db): void {
    if ($db && $db->inTransaction()) $db->rollBack();
}
function nfBegin($db): void {
    nfAssert(!$db->inTransaction() && $db->getTransactionNestingLevel() === 0, 'NESTED_TRANSACTION');
    // No SESSION/GLOBAL change. This setting applies to this next transaction only.
    $db->executeStatement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $db->beginTransaction();
    nfAssert($db->getTransactionNestingLevel() === 1, 'TRANSACTION_NOT_STARTED');
}
function nfSnapshot($db, array $names, array $indexes, int $tableId, int $rowId, bool $lock): array {
    $suffix = $lock ? ' FOR UPDATE' : '';
    // First reads are locking current reads. Do not create an earlier MVCC read view.
    $table = nfAll($db, 'SELECT * FROM '.$names['tables_tables'].' WHERE id = ?'.$suffix, [$tableId]);
    nfAssert(count($table) === 1 && $table[0]['ownership'] === NF_PILOT_USER
        && $table[0]['title'] === NF_PILOT_TITLE, 'NOT_OWN_PILOT');
    $columns = nfAll($db, 'SELECT * FROM '.$names['tables_columns'].' WHERE table_id = ? ORDER BY id'.$suffix, [$tableId]);
    nfAssert(count($columns) === 3, 'PILOT_STRUCTURE_CHANGED');
    foreach ($columns as $column) nfAssert($column['type'] === 'text' && $column['subtype'] === 'line', 'UNSUPPORTED_PILOT_COLUMN');
    $sleeves = nfAll($db, 'SELECT * FROM '.$names['tables_row_sleeves'].' WHERE id = ? AND table_id = ?'.$suffix, [$rowId, $tableId]);
    nfAssert(count($sleeves) === 1, 'ROW_TABLE_MISMATCH');
    $cells = [];
    foreach (['text','number','datetime','selection','usergroup'] as $type) {
        $key = 'tables_row_cells_'.$type;
        $cells[$type] = [];
        foreach ($columns as $column) {
            $rows = nfAll($db, 'SELECT * FROM '.$names[$key].' FORCE INDEX ('.$indexes[$key].')'
                .' WHERE column_id = ? AND row_id = ? ORDER BY id'.$suffix, [(int)$column['id'], $rowId]);
            // The pilot is deliberately text-only: any other storage or duplicate is rejected.
            nfAssert(($type === 'text' && count($rows) <= 1) || ($type !== 'text' && count($rows) === 0), 'AMBIGUOUS_CELL_STORAGE');
            $cells[$type][(string)$column['id']] = $rows;
        }
    }
    return ['account'=>NF_PILOT_USER, 'table'=>$table[0], 'columns'=>$columns, 'sleeve'=>$sleeves[0], 'cells'=>$cells];
}
function nfVersion(array $snapshot): string {
    return hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}
function nfReadVersion($db, array $names, array $indexes, int $tableId, int $rowId): string {
    nfBegin($db);
    try { return nfVersion(nfSnapshot($db, $names, $indexes, $tableId, $rowId, true)); }
    finally { nfRollback($db); }
}
function nfGuardedUpdate($db, $rows, array $names, array $indexes, int $tableId, int $rowId,
    string $expected, array $data, bool $forceRollback = false): string {
    nfAssert((bool)preg_match('/^[a-f0-9]{64}$/D', $expected), 'INVALID_EXPECTED_VERSION');
    nfBegin($db);
    try {
        $before = nfSnapshot($db, $names, $indexes, $tableId, $rowId, true);
        nfAssert(hash_equals($expected, nfVersion($before)), 'VERSION_CONFLICT');
        $ids = array_map(fn($c)=>(int)$c['id'], $before['columns']);
        $seen = [];
        foreach ($data as $cell) {
            nfAssert(isset($cell['columnId'], $cell['value']) && is_int($cell['columnId'])
                && in_array($cell['columnId'], $ids, true) && !isset($seen[$cell['columnId']])
                && is_string($cell['value']) && strlen($cell['value']) <= 200, 'INVALID_PILOT_PATCH');
            $seen[$cell['columnId']] = true;
        }
        nfAssert(count($data) > 0, 'EMPTY_PATCH');
        // Each pilot row is updated at most once by this RowService instance (request cache).
        $rows->updateSet($rowId, null, $data, NF_PILOT_USER, $tableId);
        nfAssert($db->getTransactionNestingLevel() === 1, 'TRANSACTION_ESCAPED');
        $after = nfSnapshot($db, $names, $indexes, $tableId, $rowId, true);
        foreach ($data as $cell) {
            $stored = $after['cells']['text'][(string)$cell['columnId']];
            nfAssert(count($stored) === 1 && $stored[0]['value'] === $cell['value'], 'WRITE_READBACK_MISMATCH');
        }
        foreach ($before['cells']['text'] as $columnId=>$previous) {
            if (!isset($seen[(int)$columnId])) nfAssert($after['cells']['text'][$columnId] === $previous, 'UNTOUCHED_CELL_CHANGED');
        }
        if ($forceRollback) throw new RuntimeException('INJECTED_ROLLBACK');
        $version = nfVersion($after);
        $db->commit();
        nfAssert(!$db->inTransaction(), 'COMMIT_NOT_COMPLETE');
        nfAssert(hash_equals($version, nfReadVersion($db, $names, $indexes, $tableId, $rowId)), 'POST_COMMIT_CHANGED');
        return $version;
    } catch (Throwable $e) { nfRollback($db); throw $e; }
}
function nfNative(int $tableId, int $rowId, int $columnId, string $value): array {
    nfAssert(function_exists('proc_open'), 'CHILD_PROCESS_UNAVAILABLE');
    $input = json_encode([$tableId,$rowId,$columnId,$value], JSON_THROW_ON_ERROR);
    $code = <<<'CHILD'
define('OC_CONSOLE', true); require getcwd().'/lib/base.php';
try {
    $x = json_decode($argv[1], true, 512, JSON_THROW_ON_ERROR);
    $user = \OC::$server->get(\OCP\IUserManager::class)->get('ChatGPT');
    if (!$user) throw new RuntimeException('NO_USER');
    \OC::$server->get(\OCP\IUserSession::class)->setUser($user);
    \OC_App::loadApp('tables');
    $c = (new \OCA\Tables\AppInfo\Application())->getContainer();
    $table = $c->get(\OCA\Tables\Service\TableService::class)->find($x[0], false, 'ChatGPT');
    if ($table->getOwnership() !== 'ChatGPT' || $table->getTitle() !== 'NOVAFORGE Schreibschutz-Pilot 2026-10-03 / 0.1.1') throw new RuntimeException('NOT_PILOT');
    \OC::$server->get(\OCP\IDBConnection::class)->executeStatement('SET SESSION innodb_lock_wait_timeout = 1');
    $row = $c->get(\OCA\Tables\Service\RowService::class)->updateSet($x[1], null, [['columnId'=>$x[2], 'value'=>$x[3]]], 'ChatGPT', $x[0]);
    echo json_encode(['ok'=>true,'rowId'=>$row->getId()]);
} catch (Throwable $e) {
    $timeout = false;
    for ($n=0; $e && $n<12; $n++, $e=$e->getPrevious()) {
        if (preg_match('/lock wait timeout|1205/i', $e->getMessage())) $timeout = true;
    }
    echo json_encode(['ok'=>false,'reason'=>$timeout?'lock_timeout':'native_error']);
}
CHILD;
    $pipes = [];
    $process = proc_open([PHP_BINARY, '-r', $code, $input], [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes, getcwd());
    nfAssert(is_resource($process), 'CHILD_START_FAILED');
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $output = ''; $bytes = 0; $deadline = microtime(true)+15; $exit = null;
    try {
        do {
            $output .= stream_get_contents($pipes[1]);
            $bytes += strlen(stream_get_contents($pipes[2])); // never expose native diagnostics/credentials
            nfAssert(strlen($output)<8192 && $bytes<32768, 'CHILD_OUTPUT_LIMIT');
            $status = proc_get_status($process);
            if (!$status['running']) { $exit = $status['exitcode']; break; }
            nfAssert(microtime(true)<$deadline, 'CHILD_TIME_LIMIT');
            usleep(20000);
        } while (true);
        $output .= stream_get_contents($pipes[1]);
    } catch (Throwable $e) { proc_terminate($process); throw $e; }
    finally { fclose($pipes[1]); fclose($pipes[2]); proc_close($process); }
    nfAssert($exit === 0, 'CHILD_EXIT_FAILED');
    $result = json_decode($output, true, 32, JSON_THROW_ON_ERROR);
    nfAssert(is_array($result) && isset($result['ok']), 'CHILD_RESPONSE_INVALID');
    return $result;
}

$db = null; $second = null; $previousUser = null; $userSession = null; $tableId = null; $exitStatus = 0; $step = 'Nextcloud-Bootstrap';
try {
    require getcwd().'/lib/base.php';
    echo "PILOT 0.1.1: API-Korrektur; einmaliger Test nur in eigener Pilotanlage.\n";
    $step = 'Vorprüfung: App-Version und Quellhashes';
    $apps = \OC::$server->get(\OCP\App\IAppManager::class);
    $config = \OC::$server->get(\OCP\IConfig::class);
    nfAssert($apps->getAppVersion('tables') === '2.3.1' && $config->getSystemValue('dbtype','') === 'mysql', 'UNSUPPORTED_SERVER');
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
    ];
    foreach ($expectedHashes as $file=>$hash) nfAssert(hash_equals($hash, hash_file('sha256', $apps->getAppPath('tables').'/'.$file) ?: ''), 'SOURCE_CHANGED:'.$file);
    $step = 'Vorprüfung: Hauptverbindung';
    $dbAdapter = \OC::$server->get(\OCP\IDBConnection::class);
    nfAssert($dbAdapter instanceof \OC\DB\ConnectionAdapter, 'UNSUPPORTED_DB_ADAPTER');
    // The same underlying connection used by native Tables mappers, not a new connection.
    $db = $dbAdapter->getInner();
    nfAssert($db instanceof \OC\DB\Connection, 'UNSUPPORTED_INNER_CONNECTION');
    nfAssert(!$db->inTransaction(), 'ACTIVE_OUTER_TRANSACTION');
    nfAssert($db->getTransactionNestingLevel() === 0, 'ACTIVE_TRANSACTION_NESTING');
    $step = 'Vorprüfung: Datenbank-Version und Isolation';
    $version = (string)nfOne($db, 'SELECT VERSION()');
    nfAssert((bool)preg_match('/^10\.11\./', $version) && str_contains($version, 'MariaDB'), 'UNSUPPORTED_DB_VERSION');
    $baselineIsolation = nfOne($db, 'SELECT @@session.tx_isolation');
    $prefix = $config->getSystemValue('dbtableprefix','oc_');
    $schema = $config->getSystemValue('dbname','');
    nfAssert(is_string($prefix) && is_string($schema) && $schema !== '', 'DB_CONFIG_UNCLEAR');
    $step = 'Vorprüfung: Engines und Zellindizes';
    $logical = ['tables_tables','tables_columns','tables_row_sleeves','tables_row_cells_text','tables_row_cells_number','tables_row_cells_datetime','tables_row_cells_selection','tables_row_cells_usergroup'];
    $names = []; $indexes = [];
    foreach ($logical as $name) {
        $physical = $prefix.$name; $names[$name] = nfQuoted($physical);
        nfAssert(strcasecmp((string)nfOne($db, 'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [$schema,$physical]), 'InnoDB') === 0, 'ENGINE_CHANGED');
        if (str_starts_with($name, 'tables_row_cells_')) {
            $available = nfAll($db, 'SELECT INDEX_NAME AS name, SEQ_IN_INDEX AS seq, COLUMN_NAME AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX', [$schema,$physical]);
            $grouped = [];
            foreach ($available as $entry) $grouped[$entry['name']][(int)$entry['seq']] = $entry['col'];
            foreach ($grouped as $index=>$parts) if (count($parts) === 2 && ($parts[1]??null) === 'column_id' && ($parts[2]??null) === 'row_id') { $indexes[$name] = nfQuoted($index); break; }
            nfAssert(isset($indexes[$name]), 'CELL_INDEX_MISSING');
        }
    }
    $step = 'Vorprüfung: Zweite Verbindung';
    $second = \OC::$server->get(\OC\DB\ConnectionFactory::class)->getConnection('mysql', ['persistent'=>false]);
    nfAssert(nfOne($db,'SELECT CONNECTION_ID()') !== nfOne($second,'SELECT CONNECTION_ID()'), 'CONNECTIONS_NOT_INDEPENDENT');
    nfAssert(nfOne($db,'SELECT DATABASE()') === nfOne($second,'SELECT DATABASE()'), 'DATABASE_MISMATCH');
    $second->executeStatement('SET SESSION innodb_lock_wait_timeout = 1');
    $step = 'Vorprüfung: Konto und Tables-Dienste';
    $userSession = \OC::$server->get(\OCP\IUserSession::class);
    $previousUser = $userSession->getUser();
    $user = \OC::$server->get(\OCP\IUserManager::class)->get(NF_PILOT_USER);
    nfAssert($user !== null && $apps->isEnabledForUser('tables',$user), 'USER_APP_UNAVAILABLE');
    $userSession->setUser($user); \OC_App::loadApp('tables');
    $container = (new \OCA\Tables\AppInfo\Application())->getContainer();
    $tables = $container->get(\OCA\Tables\Service\TableService::class);
    $columns = $container->get(\OCA\Tables\Service\ColumnService::class);
    $rows = $container->get(\OCA\Tables\Service\RowService::class);
    $step = 'Vorprüfung: Keine vorhandene Pilotanlage';
    foreach ($tables->findAll(NF_PILOT_USER, false, false, false) as $existing) {
        nfAssert(!str_starts_with($existing->getTitle(), 'NOVAFORGE Schreibschutz-Pilot 2026-10-03 / '), 'PILOT_ALREADY_EXISTS:'.$existing->getId());
    }

    $step = 'Eigene Pilotanlage';
    $db->beginTransaction();
    try {
        $table = $tables->create(NF_PILOT_TITLE, 'custom', null, 'Nur synthetische technische Testdaten; keine Akten. Nicht erneut ausführen.', NF_PILOT_USER);
        $tableId = $table->getId();
        $ids = [];
        foreach (['Wert A','Fehlende Zelle B','Unverändert C'] as $title) {
            $dto = new \OCA\Tables\Dto\Column(title:$title,type:'text',subtype:'line',mandatory:false,textMaxLength:200,textUnique:false);
            $ids[] = $columns->create(NF_PILOT_USER, $tableId, null, $dto)->getId();
        }
        $pilotRows = [];
        for ($i=0;$i<6;$i++) $pilotRows[] = $rows->create($tableId,null,[['columnId'=>$ids[0],'value'=>'Start'],['columnId'=>$ids[2],'value'=>'Unberührt']],NF_PILOT_USER)->getId();
        nfAssert($db->getTransactionNestingLevel() === 1, 'SETUP_TRANSACTION_ESCAPED');
        $db->commit();
    } catch (Throwable $e) { nfRollback($db); throw $e; }
    printf("PILOT ANGELEGT: Konto ChatGPT; Tabellen-ID %d; Spalten %s; Datensätze %s\n", $tableId, implode(',',$ids), implode(',',$pilotRows));
    echo "Pilot bleibt zur Rückprüfung erhalten. Keine bestehende Tabelle verändert.\n";

    $step = 'Bedingtes Schreiben';
    $token = nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[0]);
    nfGuardedUpdate($db,$rows,$names,$indexes,$tableId,$pilotRows[0],$token,[['columnId'=>$ids[0],'value'=>'Geschützt'],['columnId'=>$ids[1],'value'=>'Neu']]);
    echo "PASS 1: Bedingtes Schreiben, neue Zelle und vollständiges Rücklesen; C unverändert.\n";

    $step = 'Veraltete Version nach nativem Schreiben';
    $token = nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[1]);
    nfAssert(nfNative($tableId,$pilotRows[1],$ids[0],'Nativ geändert')['ok'] === true,'NATIVE_WRITE_FAILED');
    $nativeToken = nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[1]);
    $rejected = false;
    try { nfGuardedUpdate($db,$rows,$names,$indexes,$tableId,$pilotRows[1],$token,[['columnId'=>$ids[0],'value'=>'Darf nicht speichern']]); }
    catch (RuntimeException $e) { $rejected = $e->getMessage() === 'VERSION_CONFLICT'; }
    nfAssert($rejected && hash_equals($nativeToken,nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[1])),'STALE_WRITE_NOT_REJECTED');
    echo "PASS 2: Veraltete Version nach eigenständigem nativen RowService-Aufruf abgelehnt; native Werte erhalten.\n";

    $step = 'Native Paralleländerung';
    $token = nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[2]);
    nfBegin($db);
    try {
        nfSnapshot($db,$names,$indexes,$tableId,$pilotRows[2],true);
        $attempt = nfNative($tableId,$pilotRows[2],$ids[0],'Parallel nativ');
        nfAssert($attempt['ok'] === false && ($attempt['reason']??'') === 'lock_timeout','NATIVE_WRITE_NOT_BLOCKED');
    } finally { nfRollback($db); }
    nfAssert(hash_equals($token,nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[2])),'BLOCKED_NATIVE_CHANGED_ROW');
    nfAssert(nfNative($tableId,$pilotRows[2],$ids[0],'Nach Freigabe')['ok'] === true,'NATIVE_AFTER_UNLOCK_FAILED');
    echo "PASS 3: Native Paralleländerung während Sperre abgewiesen; nach Freigabe möglich.\n";

    $step = 'Fehlende Zelle und Lückensperre';
    $token = nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[3]);
    $insert = 'INSERT INTO '.$names['tables_row_cells_text'].' (row_id,column_id,value,last_edit_by,last_edit_at) VALUES (?,?,?,?,?)';
    $params = [$pilotRows[3],$ids[1],'Separate Zelle',NF_PILOT_USER,'2026-10-03 00:00:00'];
    nfBegin($db);
    try {
        nfSnapshot($db,$names,$indexes,$tableId,$pilotRows[3],true);
        $blocked = false;
        try { $second->executeStatement($insert,$params); }
        catch (Throwable $e) { $blocked = (bool)preg_match('/lock wait timeout|1205/i',$e->getMessage()); }
        nfAssert($blocked,'MISSING_CELL_NOT_LOCKED');
    } finally { nfRollback($db); }
    nfAssert(hash_equals($token,nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[3])),'BLOCKED_INSERT_CHANGED_ROW');
    $second->executeStatement($insert,$params);
    nfAssert(!hash_equals($token,nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[3])),'CELL_CHANGE_NOT_IN_VERSION');
    echo "PASS 4: Fehlende Zelle auch ohne Sleeve-Änderung gesperrt; neue Zellversion erkannt.\n";

    $step = 'Rollback nach nativem Schreiben';
    $token = nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[4]);
    $rolledBack = false;
    try { nfGuardedUpdate($db,$rows,$names,$indexes,$tableId,$pilotRows[4],$token,[['columnId'=>$ids[0],'value'=>'Zurückrollen'],['columnId'=>$ids[1],'value'=>'Zurückrollen']],true); }
    catch (RuntimeException $e) { $rolledBack = $e->getMessage() === 'INJECTED_ROLLBACK'; }
    nfAssert($rolledBack && hash_equals($token,nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[4])),'ROLLBACK_INCOMPLETE');
    echo "PASS 5: Native Werte/Metadaten und neue Zelle bei erzwungenem Fehler vollständig zurückgerollt.\n";

    $step = 'Fremde Spalte und doppelte Zelle';
    $token = nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[5]);
    $rejected = false;
    try { nfGuardedUpdate($db,$rows,$names,$indexes,$tableId,$pilotRows[5],$token,[['columnId'=>max($ids)+1000000,'value'=>'Ungültig']]); }
    catch (RuntimeException $e) { $rejected = $e->getMessage() === 'INVALID_PILOT_PATCH'; }
    nfAssert($rejected && hash_equals($token,nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[5])),'INVALID_COLUMN_WRITTEN');
    $params[0] = $pilotRows[5]; $second->executeStatement($insert,$params);
    $second->executeStatement($insert,$params);
    $duplicateRejected = false;
    try { nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[5]); }
    catch (RuntimeException $e) { $duplicateRejected = $e->getMessage() === 'AMBIGUOUS_CELL_STORAGE'; }
    nfAssert($duplicateRejected,'DUPLICATE_CELL_ACCEPTED');
    $duplicates = nfAll($second, 'SELECT id FROM '.$names['tables_row_cells_text'].' WHERE row_id = ? AND column_id = ? ORDER BY id', [$pilotRows[5],$ids[1]]);
    nfAssert(count($duplicates) === 2, 'PILOT_DUPLICATE_COUNT_UNCLEAR');
    nfAssert($second->executeStatement('DELETE FROM '.$names['tables_row_cells_text'].' WHERE id = ? AND row_id = ? AND column_id = ?', [(int)$duplicates[1]['id'],$pilotRows[5],$ids[1]]) === 1, 'PILOT_DUPLICATE_CLEANUP_FAILED');
    nfReadVersion($db,$names,$indexes,$tableId,$pilotRows[5]);
    echo "PASS 6: Fremde Spalte ohne Schreiben abgelehnt; eigene doppelte Zelle erkannt, nur eigene zusätzliche Testzelle entfernt und Rücklesen bestätigt.\n";

    $step = 'Sitzungseinstellung und offene Transaktionen';
    nfAssert(nfOne($db,'SELECT @@session.tx_isolation') === $baselineIsolation,'SESSION_ISOLATION_CHANGED');
    nfAssert(!$db->inTransaction() && !$second->inTransaction(),'TRANSACTION_LEFT_OPEN');
    echo "PASS 7: Sitzungseinstellung erhalten; keine offene Transaktion.\n";
    printf("ENDE: 7 Pilotgruppen bestanden. Tabelle %d bleibt mit 3 Spalten und 6 eigenen Testdatensätzen erhalten.\n",$tableId);
    echo "GRENZE: Kein MCP-Schreibwerkzeug, keine produktive Registerfreigabe; Text-Line-Pilot, keine pauschale Freigabe anderer Spaltentypen/Sharing.\n";
} catch (Throwable $e) {
    nfRollback($db); nfRollback($second);
    $message = $e instanceof RuntimeException ? $e->getMessage() : 'NATIVE_RUNTIME_FAILURE';
    if (!preg_match('/^[A-Z0-9_:a-z\/.]+$/D',$message)) $message = 'NATIVE_RUNTIME_FAILURE';
    fwrite(STDERR,"STOPP bei ".$step.": ".$message.". Nicht blind wiederholen.\n");
    // No raw native message, SQL, trace arguments or configuration values.
    for ($cause = $e, $depth = 0; $cause && $depth < 4; $cause = $cause->getPrevious(), $depth++) {
        fprintf(STDERR, "FEHLERSTELLE %d: Klasse=%s; Datei=%s; Zeile=%d\n",
            $depth, get_class($cause), basename($cause->getFile()), $cause->getLine());
    }
    if ($tableId !== null) fwrite(STDERR,"Eigene Pilot-ID: ".$tableId."; Zustand nachprüfen, keine neue Pilotanlage.\n");
    $exitStatus = 1;
} finally {
    if ($userSession) $userSession->setUser($previousUser);
    if ($second) $second->close();
}
exit($exitStatus);
