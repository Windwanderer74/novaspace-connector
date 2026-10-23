<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaforgeTables\Service;
use RuntimeException;
final class GeneralWriteService {
    public const USER='ChatGPT';
    private ?\OC\DB\Connection $db=null;
    private array $names=[],$indexes=[];
    private $rows,$permissions,$tables,$columns,$shares,$columnHelper;
    private float $deadline=0;
    private string $baselineIsolation='';
    public function __construct(private \OCP\IDBConnection $adapter,private \OCP\App\IAppManager $apps,private \OCP\IConfig $config,private \OCP\IUserSession $users) {}
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
    private function initialize(): void {
        if ($this->db !== null) return;
        $user = $this->users->getUser();
        $this->check($user !== null && $this->apps->isEnabledForUser('tables',$user), 'TABLES_UNAVAILABLE');
        $this->check($this->apps->getAppVersion('tables') === '2.3.1'
            && $this->config->getSystemValue('dbtype','') === 'mysql', 'SERVER_VERSION_UNSUPPORTED');
        $expectedHashes = [
        'lib/Service/ValueObject/ShareCreate.php' => 'fc02dea336b4b7b5c9c5e8f80868d7f591a1173242a47e00eec823766b6140e3',
        'lib/Service/ShareService.php' => '0aa24616a4665295be9b617a06897ce2856e375adc441e9d6702d42aa9d6c0c2',
        'lib/Service/ColumnService.php' => '55fdca263e25c9eb45dddbe881de11521537ccca3f9338633d79808a0e3b2822',
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
        foreach (['tables_tables','tables_columns','tables_row_sleeves','tables_row_cells_text','tables_row_cells_number','tables_row_cells_datetime','tables_row_cells_selection','tables_row_cells_usergroup','tables_shares','novaforge_tables_requests'] as $name) {
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
        \OC_App::loadApp('tables');
        $container = (new \OCA\Tables\AppInfo\Application())->getContainer();
        $this->tables=$container->get(\OCA\Tables\Service\TableService::class);
        $this->columns=$container->get(\OCA\Tables\Service\ColumnService::class);
        $this->columnHelper=$container->get(\OCA\Tables\Helper\ColumnsHelper::class);
        $this->shares=$container->get(\OCA\Tables\Service\ShareService::class);
        $this->rows = $container->get(\OCA\Tables\Service\RowService::class);
        $this->permissions = $container->get(\OCA\Tables\Service\PermissionsService::class);
    }

    private function base(): array { return ['account'=>self::USER,'bridgeVersion'=>'0.3.0','protocol'=>1,'generalTables'=>true]; }
    private function scope(): void {
        $u=$this->users->getUser();$this->check($u!==null,'AUTH_REQUIRED');$this->check($u->getUID()===self::USER,'ACCOUNT_DENIED');
    }
    private function protectedTable(int $id): void {
        $schema=json_decode($this->config->getAppValue('novaforge_tables','register_schema','{}'),true);
        $this->check($id>0 && $id!==6 && $id!==($schema['tableId']??7),'PROTECTED_TABLE');
    }
    private function structureSnapshot(int $id): array {
        $this->protectedTable($id);
        $t=$this->all($this->db,'SELECT * FROM '.$this->names['tables_tables'].' WHERE id = ? FOR UPDATE WAIT 1',[$id]);
        $this->check(count($t)===1,'TABLE_NOT_FOUND');
        $c=$this->all($this->db,'SELECT * FROM '.$this->names['tables_columns'].' WHERE table_id = ? ORDER BY id LIMIT 201 FOR UPDATE WAIT 1',[$id]);
        $this->check(count($c)<=200,'COLUMN_LIMIT');
        $shares=$this->all($this->db,'SELECT * FROM '.$this->names['tables_shares']." WHERE node_id = ? AND node_type = 'table' ORDER BY id FOR UPDATE WAIT 1",[$id]);
        // Direct table ownership/shares only: context/view-only grants expose fewer rows/columns.
        $direct=$t[0]['ownership']===self::USER;
        foreach($shares as $s)if(($s['receiver']??null)===self::USER && ($s['receiver_type']??null)===\OCA\Tables\Constants\ShareReceiverType::USER && ($s['permission_read']??false))$direct=true;
        $this->check($direct,'DIRECT_TABLE_ACCESS_REQUIRED');
        $this->check($this->permissions->canReadRowsByElementId($id,'table',self::USER) && $this->permissions->canReadColumnsByTableId($id,self::USER),'READ_DENIED');
        return ['table'=>$t[0],'columns'=>$c,'shares'=>$shares];
    }
    private function snapshot(int $tableId,int $rowId): array {
        $s=$this->structureSnapshot($tableId);
        $r=$this->all($this->db,'SELECT * FROM '.$this->names['tables_row_sleeves'].' WHERE id = ? AND table_id = ? FOR UPDATE WAIT 1',[$rowId,$tableId]);
        $this->check(count($r)===1,'ROW_TABLE_MISMATCH');$s['sleeve']=$r[0];$s['cells']=[];
        foreach(['text','number','datetime','selection','usergroup'] as $type){
            $key='tables_row_cells_'.$type;$s['cells'][$type]=[];
            foreach($s['columns'] as $c){
                $this->check(in_array($c['type'],['text','number','datetime','selection','usergroup'],true),'UNSUPPORTED_COLUMN_TYPE');
                $stored=$this->all($this->db,'SELECT * FROM '.$this->names[$key].' FORCE INDEX ('.$this->indexes[$key].') WHERE column_id = ? AND row_id = ? ORDER BY id FOR UPDATE WAIT 1',[(int)$c['id'],$rowId]);
                $this->check(count($stored)<=1 && (!$stored || $c['type']===$type),'AMBIGUOUS_CELL_STORAGE');
                $s['cells'][$type][(string)$c['id']]=$stored;
            }
        }return $s;
    }
    private function versionOf(array $s): string { return hash('sha256',json_encode($s,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)); }
    private function isolationUnchanged(): void {
        $this->check(!$this->db->inTransaction() && $this->db->getTransactionNestingLevel()===0,'TRANSACTION_LEFT_OPEN');
        $this->check($this->one($this->db,'SELECT @@session.tx_isolation')===$this->baselineIsolation,'SESSION_ISOLATION_CHANGED');
    }
    private function rowReply(array $s): array {
        $row=$this->rows->find((int)$s['sleeve']['id'])->jsonSerialize();
        $this->check($row['tableId']===(int)$s['table']['id'],'ROW_TABLE_MISMATCH');
        return array_merge($this->base(),['tableId'=>(int)$s['table']['id'],'row'=>$row,'serverVersion'=>$this->versionOf($s),'versionKind'=>'server-locked-raw-state']);
    }
    private function structureReply(array $s): array {
        // Raw server metadata makes the token sensitive to ownership, schema and direct rights.
        return array_merge($this->base(),['tableId'=>(int)$s['table']['id'],'table'=>$s['table'],'columns'=>$s['columns'],'serverVersion'=>$this->versionOf($s),'versionKind'=>'server-locked-raw-state']);
    }
    public function status(): array {
        $this->scope();$this->initialize();$this->isolationUnchanged();
        return array_merge($this->base(),['writeEnabled'=>$this->config->getAppValue('novaforge_tables','general_http_enabled','0')==='1','hostSelftestPassed'=>$this->config->getAppValue('novaforge_tables','general_selftest_passed','0')==='1','protectedTableIds'=>[6,json_decode($this->config->getAppValue('novaforge_tables','register_schema','{}'),true)['tableId']??7],'newTableShare'=>['receiver'=>'Soul','read'=>true,'create'=>true,'update'=>true,'delete'=>false,'manage'=>false]]);
    }
    public function read(int $tableId,?int $rowId=null): array {
        $this->scope();$this->initialize();$this->begin($this->db);
        try{$s=$rowId===null?$this->structureSnapshot($tableId):$this->snapshot($tableId,$rowId);$r=$rowId===null?$this->structureReply($s):$this->rowReply($s);}
        finally{$this->rollback($this->db);}$this->isolationUnchanged();return $r;
    }
    public function operation(string $requestId): array {
        $this->scope();$this->uuid($requestId);$this->initialize();
        $r=$this->all($this->db,'SELECT result_json FROM '.$this->names['novaforge_tables_requests'].' WHERE request_id = ?',[$requestId]);
        if(!$r)return array_merge($this->base(),['requestId'=>$requestId,'found'=>false]);
        $saved=json_decode($r[0]['result_json'],true,512,JSON_THROW_ON_ERROR);
        return array_merge($this->base(),['requestId'=>$requestId,'found'=>true,'result'=>$saved]);
    }
    private function uuid(string $v): void { $this->check((bool)preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$v),'INVALID_REQUEST_ID'); }
    private function text($v,int $max,bool $empty=true): void { $this->check(is_string($v) && strlen($v)<=$max && mb_check_encoding($v,'UTF-8') && !str_contains($v,"\0") && ($empty || trim($v)!==''),'INVALID_TEXT'); }
    private function keys(array $v,array $allowed): void {foreach(array_keys($v) as $k)$this->check(in_array($k,$allowed,true),'UNKNOWN_PARAMETER');}
    private function columnDto(array $c): \OCA\Tables\Dto\Column {
        $this->keys($c,['title','type','subtype','description','mandatory','textMaxLength','numberDecimals','numberMin','numberMax','selectionOptions']);
        $this->text($c['title']??null,200,false);$this->check(in_array($c['type']??null,['text','number','datetime','selection'],true),'INVALID_COLUMN');
        $sub=$c['subtype']??'';$allowed=['text'=>['','line'],'number'=>[''],'datetime'=>['','date','time'],'selection'=>['','check','selection-multi']];
        $this->check(in_array($sub,$allowed[$c['type']],true),'INVALID_COLUMN');
        if(isset($c['description']))$this->text($c['description'],2048);
        if(isset($c['mandatory']))$this->check(is_bool($c['mandatory']),'INVALID_COLUMN');
        if(isset($c['textMaxLength']))$this->check(is_int($c['textMaxLength']) && $c['textMaxLength']>0 && $c['textMaxLength']<=20000,'INVALID_COLUMN');
        if(isset($c['numberDecimals']))$this->check(is_int($c['numberDecimals']) && $c['numberDecimals']>=0 && $c['numberDecimals']<=10,'INVALID_COLUMN');
        foreach(['numberMin','numberMax'] as $k)if(isset($c[$k]))$this->check(is_int($c[$k]) || (is_float($c[$k]) && is_finite($c[$k])),'INVALID_COLUMN');
        if(isset($c['selectionOptions'])){
            $this->check(is_array($c['selectionOptions']) && array_is_list($c['selectionOptions']) && count($c['selectionOptions'])<=100,'INVALID_COLUMN');$seen=[];
            foreach($c['selectionOptions'] as $option){$this->check(is_array($option),'INVALID_COLUMN');$this->keys($option,['id','label']);$this->check(is_int($option['id']??null) && $option['id']>0 && !isset($seen[$option['id']]),'INVALID_COLUMN');$seen[$option['id']]=true;$this->text($option['label']??null,200,false);}
        }
        return \OCA\Tables\Dto\Column::createFromArray($c+['subtype'=>$sub,'mandatory'=>false]);
    }
    private function data(array $data,array $columns): array {
        $this->check(array_is_list($data) && count($data)<=200,'INVALID_PATCH');$ids=array_map(fn($c)=>(int)$c['id'],$columns);$seen=[];
        foreach($data as $cell){$this->check(is_array($cell),'INVALID_PATCH');$this->keys($cell,['columnId','value']);$id=$cell['columnId']??null;
            $this->check(is_int($id) && in_array($id,$ids,true) && !isset($seen[$id]) && array_key_exists('value',$cell),'INVALID_PATCH');$seen[$id]=true;
            $this->check(strlen(json_encode($cell['value'],JSON_THROW_ON_ERROR))<=20000,'INVALID_PATCH');
        }return $data;
    }
    private function normalized(int $tableId,array $data): array {
        $columns=[];foreach($this->columns->findAllByTable($tableId,self::USER) as $c)$columns[$c->getId()]=$c;
        $out=[];foreach($data as $cell){$c=$columns[$cell['columnId']]??null;$this->check($c!==null,'INVALID_PATCH');$business=$this->columnHelper->getColumnBusinessObject($c);$this->check($business->canBeParsed($cell['value'],$c),'UNPARSABLE_CELL');$out[$cell['columnId']]=json_decode($business->parseValue($cell['value'],$c),true,512,JSON_THROW_ON_ERROR);}return $out;
    }
    private function verifyValues(int $rowId,array $expected): void {
        $cells=array_column($this->rows->find($rowId)->jsonSerialize()['data'],'value','columnId');
        foreach($expected as $id=>$value)$this->check(array_key_exists($id,$cells) && $cells[$id]===$value,'WRITE_READBACK_MISMATCH');
    }
    private function soulShare(int $tableId): void {
        $this->check($this->permissions->canManageTableById($tableId,self::USER),'MANAGE_DENIED');
        $found=false;foreach($this->shares->findAll('table',$tableId,self::USER,false) as $share)if($share->getReceiver()==='Soul' && $share->getReceiverType()===\OCA\Tables\Constants\ShareReceiverType::USER){$this->check($share->getPermissionRead(),'EXISTING_SOUL_SHARE_REQUIRES_REVIEW');$found=true;}
        if(!$found)$this->shares->create(new \OCA\Tables\Service\ValueObject\ShareCreate(nodeId:$tableId,nodeType:'table',receiver:'Soul',receiverType:\OCA\Tables\Constants\ShareReceiverType::USER,permissionRead:true,permissionCreate:true,permissionUpdate:true,permissionDelete:false,permissionManage:false,displayMode:0));
        $this->check($this->permissions->canReadRowsByElementId($tableId,'table','Soul'),'SOUL_VISIBILITY_UNCONFIRMED');
    }
    private function expected(string $version,array $snapshot): void { $this->check((bool)preg_match('/^[a-f0-9]{64}$/D',$version),'INVALID_EXPECTED_VERSION');$this->check(hash_equals($version,$this->versionOf($snapshot)),'VERSION_CONFLICT'); }
    public function write(string $action,string $requestId,array $payload): array {
        $this->scope();$this->uuid($requestId);$this->check($this->config->getAppValue('novaforge_tables','general_http_enabled','0')==='1','WRITE_DISABLED');
        $this->check(in_array($action,['create_table','create_column','update_table','update_column','create_row','update_row','share_soul'],true),'INVALID_ACTION');
        $this->check(strlen(json_encode($payload,JSON_THROW_ON_ERROR))<=65536,'INVALID_PAYLOAD');
        $this->initialize();$this->begin($this->db);$attempted=false;$result=null;
        try {
            $hash=hash('sha256',json_encode([$action,$payload],JSON_THROW_ON_ERROR));
            $journal=$this->names['novaforge_tables_requests'];
            $old=$this->all($this->db,'SELECT * FROM '.$journal.' WHERE request_id = ? FOR UPDATE WAIT 1',[$requestId]);
            if($old){$this->check(hash_equals($old[0]['payload_hash'],$hash),'REQUEST_ID_CONFLICT');$result=json_decode($old[0]['result_json'],true,512,JSON_THROW_ON_ERROR);$this->rollback($this->db);$this->isolationUnchanged();return array_merge($result,['status'=>'already_committed','originalCommitted'=>true,'committed'=>false,'readbackVerified'=>false]);}
            $rowId=null;$tableId=null;$columnId=null;
            if($action==='create_table') {
                $this->keys($payload,['title','description','columns']);$this->text($payload['title']??null,200,false);$this->text($payload['description']??'',2048);
                $list=$payload['columns']??[];$this->check(is_array($list) && array_is_list($list) && count($list)<=50,'INVALID_COLUMN');$titles=[];$dtos=[];
                foreach($list as $c){$this->check(is_array($c),'INVALID_COLUMN');$dto=$this->columnDto($c);$key=mb_strtolower(trim($c['title']));$this->check(!isset($titles[$key]),'DUPLICATE_COLUMN_TITLE');$titles[$key]=true;$dtos[]=$dto;}
                $existing=$this->all($this->db,'SELECT id FROM '.$this->names['tables_tables'].' WHERE uuid = ? FOR UPDATE WAIT 1',[$requestId]);$this->check(!$existing,'TABLE_UUID_CONFLICT');
                $table=$this->tables->create($payload['title'],'custom',null,$payload['description']??'',self::USER,$requestId);$tableId=$table->getId();
                foreach($dtos as $dto)$this->columns->create(self::USER,$tableId,null,$dto);
                $this->soulShare($tableId);$s=$this->structureSnapshot($tableId);
            } else {
                $this->check(is_int($payload['tableId']??null),'INVALID_TABLE_ID');$tableId=$payload['tableId'];$s=$this->structureSnapshot($tableId);
                if($action==='update_row'){
                    $this->keys($payload,['tableId','rowId','expectedVersion','data']);$this->check(is_int($payload['rowId']??null),'INVALID_ROW_ID');$rowId=$payload['rowId'];$before=$this->snapshot($tableId,$rowId);$this->expected($payload['expectedVersion']??'',$before);
                    $this->check($this->permissions->canUpdateRowsByTableId($tableId,self::USER),'UPDATE_DENIED');$data=$this->data($payload['data']??[],$s['columns']);$this->check(count($data)>0,'INVALID_PATCH');$normalized=$this->normalized($tableId,$data);
                    $this->rows->updateSet($rowId,null,$data,self::USER,$tableId);$s=$this->snapshot($tableId,$rowId);$this->verifyValues($rowId,$normalized);$changed=array_column($data,'columnId');
                    foreach($before['cells'] as $type=>$cols)foreach($cols as $id=>$stored)if(!in_array((int)$id,$changed,true))$this->check($s['cells'][$type][$id]===$stored,'UNTOUCHED_CELL_CHANGED');
                } else {
                    $this->expected($payload['expectedVersion']??'',$s);
                    if($action==='create_row'){$this->keys($payload,['tableId','expectedVersion','data']);$data=$this->data($payload['data']??[],$s['columns']);$normalized=$this->normalized($tableId,$data);$row=$this->rows->create($tableId,null,$data,self::USER);$rowId=$row->getId();$s=$this->snapshot($tableId,$rowId);$this->verifyValues($rowId,$normalized);}
                    elseif($action==='create_column'){$this->keys($payload,['tableId','expectedVersion','column']);$this->check(count($s['columns'])<200 && is_array($payload['column']??null),'INVALID_COLUMN');$dto=$this->columnDto($payload['column']);foreach($s['columns'] as $c)$this->check(mb_strtolower(trim($c['title']))!==mb_strtolower(trim($payload['column']['title'])),'DUPLICATE_COLUMN_TITLE');$columnId=$this->columns->create(self::USER,$tableId,null,$dto)->getId();$s=$this->structureSnapshot($tableId);}
                    elseif($action==='update_table'){$this->keys($payload,['tableId','expectedVersion','title','description']);$this->check(isset($payload['title']) || isset($payload['description']),'INVALID_PATCH');if(isset($payload['title']))$this->text($payload['title'],200,false);if(isset($payload['description']))$this->text($payload['description'],2048);$this->tables->update($tableId,$payload['title']??null,null,$payload['description']??null,null,self::USER);$s=$this->structureSnapshot($tableId);}
                    elseif($action==='update_column'){$this->keys($payload,['tableId','columnId','expectedVersion','title','description']);$columnId=$payload['columnId']??null;$this->check(is_int($columnId) && in_array($columnId,array_map(fn($c)=>(int)$c['id'],$s['columns']),true),'INVALID_COLUMN');$this->check(isset($payload['title']) || isset($payload['description']),'INVALID_PATCH');if(isset($payload['title'])){$this->text($payload['title'],200,false);foreach($s['columns'] as $c)if((int)$c['id']!==$columnId)$this->check(mb_strtolower(trim($c['title']))!==mb_strtolower(trim($payload['title'])),'DUPLICATE_COLUMN_TITLE');}if(isset($payload['description']))$this->text($payload['description'],2048);$this->columns->update($columnId,self::USER,new \OCA\Tables\Dto\Column(title:$payload['title']??null,description:$payload['description']??null));$s=$this->structureSnapshot($tableId);}
                    elseif($action==='share_soul'){$this->keys($payload,['tableId','expectedVersion']);$this->soulShare($tableId);$s=$this->structureSnapshot($tableId);}
                }
            }
            $this->check($this->db->getTransactionNestingLevel()===1,'TRANSACTION_ESCAPED');
            $result=array_merge($rowId===null?$this->structureReply($s):$this->rowReply($s),['requestId'=>$requestId,'action'=>$action,'status'=>'committed','committed'=>true,'readbackVerified'=>false]);if($columnId!==null)$result['columnId']=$columnId;
            $encoded=json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);$this->check(strlen($encoded)<=240000,'RESULT_TOO_LARGE');
            $this->db->executeStatement('INSERT INTO '.$journal.' (request_id,payload_hash,result_json) VALUES (?,?,?)',[$requestId,$hash,$encoded]);
            $attempted=true;$this->db->commit();
        } catch(\Throwable $e){$clean=true;try{$this->rollback($this->db);$this->isolationUnchanged();}catch(\Throwable $x){$clean=false;}if($attempted || !$clean)return array_merge($this->base(),['requestId'=>$requestId,'status'=>'commit_unknown','committed'=>null,'readbackVerified'=>false]);throw $e;}
        try{$this->isolationUnchanged();$after=$this->read($result['tableId'],$result['row']['id']??null);$result['readbackVerified']=hash_equals($result['serverVersion'],$after['serverVersion']);if(!$result['readbackVerified'])$result['status']='committed_changed_afterwards';}
        catch(\Throwable $e){$result['status']='committed_readback_failed';}return $result;
    }
}
