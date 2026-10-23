<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
require __DIR__ . '/platform-registry-native.php';
require __DIR__ . '/../app/lib/Service/InventoryRepository.php';
require __DIR__ . '/../app/lib/Service/InventoryDelegation.php';
require __DIR__ . '/../app/lib/Migration/Version000300Date20261018060000.php';
require __DIR__ . '/../app/lib/Controller/InventoryController.php';
require __DIR__ . '/../app/lib/Controller/InventoryApiController.php';
use OCA\NovaspacePlatform\Service\InventoryDelegation;
use OCA\NovaspacePlatform\Service\InventoryRepository;
use OCA\NovaspacePlatform\Service\ConnectionStore;
use OCA\NovaspacePlatform\Service\PlatformDenied;
class ItemEntity {
 public function __construct(public array $d) {}
 public function __call($method,$a) { $key=lcfirst(substr($method,3)); if(str_starts_with($method,'get'))return $this->d[$key]; $this->d[$key]=$a[0]; }
}
class InventoryDb extends SqlDb {
 public bool $failAction=false;
 public function getDatabaseProvider(bool $strict=false): string {return 'sqlite';}
 public function __construct() {
  parent::__construct();
  $this->pdo->exec('CREATE TABLE oc_ns_pf_owners(owner_key TEXT PRIMARY KEY)');
  $this->pdo->exec('CREATE TABLE oc_ns_pf_grants(conn_id TEXT PRIMARY KEY,mode TEXT,grant_revision INTEGER,conn_revision INTEGER,changed_by TEXT,changed_at INTEGER)');
  $this->pdo->exec('CREATE TABLE oc_ns_pf_actions(action_id TEXT PRIMARY KEY,request_key TEXT UNIQUE,request_hash TEXT,owner_key TEXT,owner_uid TEXT COLLATE NOCASE,actor_uid TEXT,channel TEXT,conn_id TEXT,verb TEXT,object_id INTEGER,occurred_at INTEGER,before_json TEXT,after_json TEXT,result_json TEXT)');
  $this->pdo->exec('CREATE TABLE oc_invtry_items(id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT COLLATE NOCASE,data TEXT)');
 }
 public function executeStatement($sql,array $params=[],array $types=[]):int {
  if($this->failAction && str_starts_with($sql,'INSERT INTO oc_ns_pf_actions'))throw new RuntimeException('SECRET_ACTION');
  return parent::executeStatement($sql,$params,$types);
 }
}
// Persistence adapter boundary only. Authentication, transactions, registry, validation,
// idempotency and journal use production code + real SQLite; this does not simulate MariaDB/HTTP.
class InventoryRecords extends InventoryRepository {
 public bool $disabled=false;
 public function __construct(private InventoryDb $db) {}
 public function ready(string $owner):void {if($this->disabled)throw new PlatformDenied('inventory_owner_unavailable');}
 public function list(string $owner):array {
  $s=$this->db->pdo->prepare('SELECT * FROM oc_invtry_items WHERE uid=?');$s->execute([$owner]);
  return array_map(fn($r)=>new ItemEntity(json_decode($r['data'],true)+['id'=>(int)$r['id']]),$s->fetchAll(PDO::FETCH_ASSOC));
 }
 public function get(string $owner,int $id):object {
  $s=$this->db->pdo->prepare('SELECT * FROM oc_invtry_items WHERE uid=? AND id=?');$s->execute([$owner,$id]);$r=$s->fetch(PDO::FETCH_ASSOC);
  if(!$r||$r['uid']!==$owner)throw new PlatformDenied('item_not_found');return new ItemEntity(json_decode($r['data'],true)+['id'=>(int)$r['id']]);
 }
 public function create(string $owner,array $d):object {
  $d['itemNumber']=$d['reference'];unset($d['reference']);$d+=['uid'=>$owner,'gtin'=>'','type'=>-1,'path'=>'','folderid'=>-1];
  $this->db->executeStatement('INSERT INTO oc_invtry_items(uid,data) VALUES (?,?)',[$owner,json_encode($d)]);
  return $this->get($owner,(int)$this->db->pdo->lastInsertId());
 }
 public function update(object $e,array $patch):object {
  $e->d=array_replace($e->d,$patch);$this->db->executeStatement('UPDATE oc_invtry_items SET data=? WHERE id=?',[json_encode($e->d),$e->getId()]);return $e;
 }
}
function inf():object {
 global $trust;
 $f=registryFixture();$f->db=new InventoryDb();$f->store=new ConnectionStore($f->db,new RegistryConfig());$f->records=new InventoryRecords($f->db);
 $f->delegation=new InventoryDelegation($f->users,$f->session,$f->provider,$f->db,new RegistryConfig(),$f->verifier,$f->records,$f->store);
 $f->c=$f->store->approve('Owner',$f->client,ConnectionStore::id(),'Test')['connection'];return $f;
}
function grantInventory($f,string $mode='write'):array {web($f);$matches=array_values(array_filter($f->delegation->page()['connections'],fn($c)=>$c['connectionId']===$f->c['connectionId']));$g=$matches[0]['grant'];return $f->delegation->setGrant($f->c['connectionId'],$f->c['revision'],$g['revision'],$mode,ConnectionStore::id());}
function cmd($f,array $c,array $claims=[]):array {
 cloud($f);$raw=InventoryDelegation::envelope($c);
 return $f->delegation->execute(assertion('inventory',array_replace(['scope'=>['inventory:read','inventory:write'],'bodyHash'=>hash('sha256',$raw)],$claims)),$c);
}
function createCommand(string $reference='SN-TEST'):array {return ['operation'=>'create','requestId'=>ConnectionStore::id(),'expectedAccount'=>'Owner','data'=>['reference'=>$reference,'name'=>'Test TV','maker'=>'LG','description'=>'Unbekannter Kaufpreis','link'=>'','details'=>'','comment'=>'']];}
$inventoryTests=0;
function it(string $name,callable $run):void {global $inventoryTests;$run(inf());$inventoryTests++;echo "OK: $name\n";}
it('Status before any grant reports none and performs no device write',function($f){$r=cmd($f,['operation'=>'status']);check($r['account']==='Owner'&&$r['grant']['mode']==='none'&&$f->records->list('Owner')===[]);});
it('No grant cannot read or write',function($f){registryDenied(fn()=>cmd($f,createCommand()),'inventory_grant_required');registryDenied(fn()=>cmd($f,['operation'=>'list']),'inventory_grant_required');});
it('Only native web owner can grant device rights',function($f){cloud($f);registryDenied(fn()=>$f->delegation->setGrant($f->c['connectionId'],1,0,'write',ConnectionStore::id()),'web_session_required');web($f,'OtherOwner');registryDenied(fn()=>$f->delegation->setGrant($f->c['connectionId'],1,0,'write',ConnectionStore::id()),'connection_not_found');});
it('Grant and native web audit are committed together',function($f){grantInventory($f);$p=$f->delegation->page();check($p['connections'][0]['grant']['mode']==='write'&&count($p['actions'])===1&&$p['actions'][0]['actorUid']==='Owner'&&$p['actions'][0]['channel']==='web');});
it('Read grant does not permit creation',function($f){grantInventory($f,'read');check(cmd($f,['operation'=>'list'])['items']===[]);registryDenied(fn()=>cmd($f,createCommand()),'inventory_grant_required');});
it('Original OAuth inventory read and write scopes remain necessary',function($f){grantInventory($f);foreach([['nextcloud:read'],['inventory:read'],['inventory:write']]as$scopes)registryDenied(fn()=>cmd($f,createCommand(),['scope'=>$scopes]),'inventory_scope_required');});
it('Exact body signature prevents field substitution',function($f){grantInventory($f);registryDenied(fn()=>cmd($f,createCommand(),['bodyHash'=>str_repeat('0',64)]),'assertion_invalid');});
it('Web sessions cannot use the delegated command API',function($f){grantInventory($f);$c=['operation'=>'status'];$raw=InventoryDelegation::envelope($c);registryDenied(fn()=>$f->delegation->execute(assertion('inventory',['bodyHash'=>hash('sha256',$raw)]),$c),'app_password_required');});
it('Wrong expected owner cannot create under technical account',function($f){grantInventory($f);$c=createCommand();$c['expectedAccount']='NativeActor';registryDenied(fn()=>cmd($f,$c),'owner_conflict');check($f->records->list('Owner')===[]&&$f->records->list('NativeActor')===[]);});
it('Create belongs to Owner and carries technical AI actor in same transaction',function($f){grantInventory($f);$r=cmd($f,createCommand());check($r['committed']&&$r['item']['uid']==='Owner'&&$r['item']['id']===1);web($f);$a=array_values(array_filter($f->delegation->page()['actions'],fn($a)=>$a['action']==='inventory.create'))[0];check($a['actorUid']==='NativeActor'&&$a['ownerUid']==='Owner'&&$a['channel']==='cloud_connector'&&$a['before']===null&&$a['after']['name']==='Test TV');});
it('Same request replay yields exactly one item and audit record',function($f){grantInventory($f);$c=createCommand();$a=cmd($f,$c);$b=cmd($f,$c);check($b['replayed']&&$a['actionId']===$b['actionId']&&count($f->records->list('Owner'))===1&&(int)$f->db->pdo->query('SELECT count(*) FROM oc_ns_pf_actions')->fetchColumn()===2);});
it('Changed intent cannot reuse request ID',function($f){grantInventory($f);$c=createCommand();cmd($f,$c);$c['data']['name']='Other';registryDenied(fn()=>cmd($f,$c),'request_conflict');});
it('Same native reference cannot create second item under different request',function($f){grantInventory($f);cmd($f,createCommand());registryDenied(fn()=>cmd($f,createCommand()),'reference_exists');check(count($f->records->list('Owner'))===1);});
it('A second client for same owner also cannot duplicate reference',function($f){grantInventory($f);cmd($f,createCommand());web($f);$f->client['clientHash']=str_repeat('d',64);$f->c=$f->store->approve('Owner',$f->client,ConnectionStore::id(),'Second')['connection'];grantInventory($f);registryDenied(fn()=>cmd($f,createCommand(),['client'=>str_repeat('d',64)]),'reference_exists');});
it('Journal failure rolls item and audit back',function($f){grantInventory($f);$f->db->failAction=true;registryDenied(fn()=>cmd($f,createCommand()),'inventory_outcome_unconfirmed');check($f->records->list('Owner')===[]);});
it('Failed grant journal leaves rights absent',function($f){$f->db->failAction=true;registryDenied(fn()=>grantInventory($f),'inventory_outcome_unconfirmed');$f->db->failAction=false;check(cmd($f,['operation'=>'status'])['grant']['mode']==='none');});
it('Failed commit rolls back item',function($f){grantInventory($f);$f->db->failCommit=true;registryDenied(fn()=>cmd($f,createCommand()),'inventory_outcome_unconfirmed');check($f->records->list('Owner')===[]);});
it('Lost commit reply can be recovered with same request, never duplicates',function($f){grantInventory($f);$c=createCommand();$f->db->lostCommit=true;registryDenied(fn()=>cmd($f,$c),'inventory_outcome_unconfirmed');$r=cmd($f,$c);check($r['replayed']&&count($f->records->list('Owner'))===1);});
it('Update uses version and logs before/after while preserving identity fields',function($f){grantInventory($f);$a=cmd($f,createCommand())['item'];$r=cmd($f,['operation'=>'update','requestId'=>ConnectionStore::id(),'expectedAccount'=>'Owner','itemId'=>$a['id'],'expectedVersion'=>$a['version'],'patch'=>['comment'=>'Checked']]);check($r['item']['comment']==='Checked'&&$r['item']['version']!==$a['version']&&$r['item']['itemNumber']===$a['itemNumber']&&$r['item']['folderid']===-1);web($f);$e=array_values(array_filter($f->delegation->page()['actions'],fn($a)=>$a['action']==='inventory.update'))[0];check($e['changedFields']===['comment']&&$e['before']['comment']===''&&$e['after']['comment']==='Checked');});
it('Stale version cannot overwrite intervening native change',function($f){grantInventory($f);$a=cmd($f,createCommand())['item'];$f->records->update($f->records->get('Owner',$a['id']),['comment'=>'Native user edit']);registryDenied(fn()=>cmd($f,['operation'=>'update','requestId'=>ConnectionStore::id(),'expectedAccount'=>'Owner','itemId'=>$a['id'],'expectedVersion'=>$a['version'],'patch'=>['comment'=>'Overwrite']]),'version_conflict');check($f->records->get('Owner',$a['id'])->getComment()==='Native user edit');});
it('Foreign native item cannot be read or updated',function($f){grantInventory($f);$e=$f->records->create('OtherOwner',createCommand()['data']);registryDenied(fn()=>cmd($f,['operation'=>'get','itemId'=>$e->getId()]),'item_not_found');registryDenied(fn()=>cmd($f,['operation'=>'update','requestId'=>ConnectionStore::id(),'expectedAccount'=>'Owner','itemId'=>$e->getId(),'expectedVersion'=>str_repeat('a',64),'patch'=>['name'=>'bad']]),'item_not_found');});
it('Unknown operation, UID, reference change, deletion, sharing fields rejected',function($f){grantInventory($f);foreach([['operation'=>'delete','itemId'=>1],['operation'=>'list','ownerUid'=>'Other'],['operation'=>'update','requestId'=>ConnectionStore::id(),'expectedAccount'=>'Owner','itemId'=>1,'expectedVersion'=>str_repeat('a',64),'patch'=>['uid'=>'Other']]]as$c)registryDenied(fn()=>cmd($f,$c));});
it('Revocation blocks reads, writes and previous write replay',function($f){grantInventory($f);$c=createCommand();cmd($f,$c);$f->store->revoke('Owner',$f->c['connectionId'],1,ConnectionStore::id());registryDenied(fn()=>cmd($f,$c),'connection_unavailable');registryDenied(fn()=>cmd($f,['operation'=>'list']),'connection_unavailable');});
it('Revoked inventory grant blocks reads and does not revive through replay',function($f){$g=grantInventory($f);$c=createCommand();cmd($f,$c);grantInventory($f,'none');registryDenied(fn()=>cmd($f,$c),'inventory_grant_required');});
it('Reapproval after connection revocation invalidates previous inventory grant',function($f){grantInventory($f);$f->store->revoke('Owner',$f->c['connectionId'],1,ConnectionStore::id());$f->c=$f->store->approve('Owner',$f->client,ConnectionStore::id(),'Test')['connection'];check(cmd($f,['operation'=>'status'])['grant']['mode']==='none');registryDenied(fn()=>cmd($f,createCommand()),'inventory_grant_required');});
it('Case-insensitive UID storage cannot disclose another exact owner history',function($f){grantInventory($f);web($f,'owner');check($f->delegation->page()['connections']===[]&&$f->delegation->page()['actions']===[]);});
it('Native migration reserves unique request key and mediumtext snapshots',function($f){$s=new SchemaFixture();$m=new OCA\NovaspacePlatform\Migration\Version000300Date20261018060000();$m->changeSchema(new class implements OCP\Migration\IOutput{},fn()=>$s,[]);check(count($s->tables)===3&&$s->tables['ns_pf_actions']->unique['ns_pf_action_request_unique']===['request_key']&&$s->tables['ns_pf_actions']->columns['before_json'][1]['length']===16777215);});
it('Grant POST keeps CSRF and no public attribute; API requires signed app password proof',function($f){$r=new ReflectionMethod(OCA\NovaspacePlatform\Controller\InventoryController::class,'grant');check(array_map(fn($a)=>$a->getName(),$r->getAttributes())===['OCP\\AppFramework\\Http\\Attribute\\NoAdminRequired']);$routes=require __DIR__.'/../app/appinfo/routes.php';check(count(array_filter($routes['routes'],fn($r)=>$r['name']==='inventory#grant'&&$r['verb']==='POST'))===1);});
it('Native API uses public parsed parameters and rejects injected owner before execution',function($f){
 cloud($f);$c=['operation'=>'status'];$a=assertion('inventory',['scope'=>['inventory:read'],'bodyHash'=>hash('sha256',InventoryDelegation::envelope($c))]);
 $controller=new OCA\NovaspacePlatform\Controller\InventoryApiController('novaspace_platform',new RegistryRequest(['command'=>$c,'format'=>'json'],$a),$f->delegation);
 $r=$controller->execute($c);check($r->status===200&&$r->data['account']==='Owner'&&$r->headers['Cache-Control']==='no-store');
 $bad=new OCA\NovaspacePlatform\Controller\InventoryApiController('novaspace_platform',new RegistryRequest(['command'=>$c,'ownerUid'=>'Other'],$a),$f->delegation);check($bad->execute($c)->status===400);
});
it('Rendered Inventory grant form and snapshots escape untrusted fields',function($f){
 grantInventory($f);$c=createCommand();$c['data']['name']='<script>bad</script>';cmd($f,$c);web($f);$_=$f->delegation->page()+['error'=>null,'requesttoken'=>'\"<csrf>','forms'=>[$f->c['connectionId']=>['url'=>'/grant','requestId'=>ConnectionStore::id()]]];
 ob_start();include __DIR__.'/../app/templates/inventory.php';$h=ob_get_clean();check(!str_contains($h,'<script>')&&!str_contains($h,'<csrf>')&&str_contains($h,'name="requesttoken"')&&str_contains($h,'name="grantRevision"')&&str_contains($h,'method="post"'));
});
echo "PASS: $inventoryTests inventory-delegation/RSA/SQLite tests. No MariaDB or HTTP acceptance.\n";
