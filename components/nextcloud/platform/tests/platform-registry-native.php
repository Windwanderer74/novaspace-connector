<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCP {
	interface IRequest { public function getParams(); public function getHeader($name); }
	interface IDBConnection { public function executeQuery(string $sql, array $params = [], $types = []); public function executeStatement($sql, array $params = [], array $types = []): int; public function beginTransaction(): void; public function inTransaction(): bool; public function commit(): void; public function rollBack(): void; }
	interface IConfig { public function getSystemValue($key, $default = ''); }
	interface IURLGenerator { public function linkToRouteAbsolute($route, array $params = []); public function linkToRoute($route, array $params = []); }
}
namespace OCP\AppFramework {
	class Controller { public function __construct($appName, protected \OCP\IRequest $request) {} }
	class OCSController extends Controller {}
}
namespace OCP\AppFramework\Http {
	class DataResponse { public function __construct(public $data, public $status = 200, public $headers = []) {} }
	class TemplateResponse { public function __construct(public $app, public $template, public $params, public $renderAs = 'user', public $status = 200, public $headers = []) {} }
	class RedirectResponse { public function __construct(public $url) {} }
}
namespace OCP\Security { interface ICrypto { public function encrypt(string $s, string $password = ''): string; public function decrypt(string $s, string $password = ''): string; } }
namespace OCP\Migration { interface IOutput {} class SimpleMigrationStep {} }
namespace {
	define('NATIVE_FIXTURES_ONLY', true);
	require __DIR__ . '/platform-native-access.php';
	require __DIR__ . '/../app/lib/Service/ConnectionStore.php';
	require __DIR__ . '/../app/lib/Service/ConnectionService.php';
	require __DIR__ . '/../app/lib/Migration/Version000200Date20261018030000.php';
	require __DIR__ . '/../app/lib/Controller/ConnectionsController.php';
	require __DIR__ . '/../app/lib/Controller/RegistryController.php';
	use OCA\NovaspacePlatform\Service\ConnectionStore as Store;
	use OCA\NovaspacePlatform\Service\ConnectionService as Service;
	use OCA\NovaspacePlatform\Service\GatewayVerifier as Verifier;
	use OCA\NovaspacePlatform\Service\PlatformDenied;

	class RegistryConfig implements \OCP\IConfig { public function getSystemValue($key, $default = '') { return $key === 'dbtableprefix' ? 'oc_' : $default; } }
	class SqlResult {
		public function __construct(private \PDOStatement $stmt) {}
		public function fetchAssociative() { return $this->stmt->fetch(\PDO::FETCH_ASSOC); }
		public function fetchAllAssociative() { return $this->stmt->fetchAll(\PDO::FETCH_ASSOC); }
		public function closeCursor(): bool { return $this->stmt->closeCursor(); }
	}
	class SqlDb implements \OCP\IDBConnection {
		public \PDO $pdo; public bool $failEvent = false; public bool $lostCommit = false; public bool $failCommit = false; public bool $failRead = false;
		public function __construct() {
			$this->pdo = new \PDO('sqlite::memory:'); $this->pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
			$this->pdo->exec('CREATE TABLE oc_ns_pf_connections (conn_id TEXT PRIMARY KEY,binding_hash TEXT NOT NULL UNIQUE,owner_uid TEXT COLLATE NOCASE NOT NULL,owner_key TEXT NOT NULL,native_uid TEXT NOT NULL,token_id INTEGER NOT NULL,issuer TEXT NOT NULL,subject_hash TEXT NOT NULL,client_hash TEXT NOT NULL,label TEXT NOT NULL,channel TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,revoked_at INTEGER NULL)');
			$this->pdo->exec('CREATE TABLE oc_ns_pf_events (event_id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,conn_id TEXT NOT NULL,owner_uid TEXT COLLATE NOCASE NOT NULL,owner_key TEXT NOT NULL,actor_uid TEXT NOT NULL,channel TEXT NOT NULL,verb TEXT NOT NULL,fields_json TEXT NOT NULL,occurred_at INTEGER NOT NULL)');
			$this->pdo->exec('CREATE TABLE oc_ns_pf_access (conn_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL,apps_json TEXT NOT NULL)');
		}
		public function executeQuery(string $sql, array $params = [], $types = []) { if ($this->failRead) throw new \RuntimeException('SECRET_READ'); $s=$this->pdo->prepare($sql); $s->execute($params); return new SqlResult($s); }
		public function executeStatement($sql, array $params = [], array $types = []): int { if ($this->failEvent && str_starts_with($sql,'INSERT INTO oc_ns_pf_events')) throw new \RuntimeException('SECRET_EVENT'); $s=$this->pdo->prepare($sql); $s->execute($params); return $s->rowCount(); }
		public function beginTransaction(): void { $this->pdo->beginTransaction(); }
		public function inTransaction(): bool { return $this->pdo->inTransaction(); }
		public function commit(): void { if ($this->failCommit) throw new \RuntimeException('SECRET_COMMIT'); $this->pdo->commit(); if ($this->lostCommit) { $this->lostCommit=false; throw new \RuntimeException('SECRET_LOST_REPLY'); } }
		public function rollBack(): void { $this->pdo->rollBack(); }
	}
	class TestSeal implements \OCP\Security\ICrypto {
		public array $values = [];
		public function encrypt(string $s, string $password = ''): string { $id='sealed-'.bin2hex(random_bytes(20)); $this->values[$id]=$s; return $id; }
		public function decrypt(string $s, string $password = ''): string { return $this->values[$s] ?? throw new \RuntimeException('SECRET_CRYPTO'); }
	}
	class RegistryUrls implements \OCP\IURLGenerator {
		public function linkToRouteAbsolute($route, array $params = []) { return 'https://native.test/index.php/apps/novaspace_platform/connections/new?' . http_build_query($params); }
		public function linkToRoute($route, array $params = []) { return '/native/' . $route . '?' . http_build_query($params); }
	}
	class RegistryRequest implements \OCP\IRequest {
		public function __construct(public array $params = [], public string $assertion = '') {}
		public function getParams() { return $this->params; }
		public function getHeader($name) { check($name === 'X-NovaSpace-Client'); return $this->assertion; }
	}
	$keyPath = getenv('NF_REGISTRY_TEST_KEY');
	if (!$keyPath) { throw new \RuntimeException('Run through run-platform-registry-native.mjs with an ephemeral test key.'); }
	$key = openssl_pkey_get_private(file_get_contents($keyPath));
	$public = openssl_pkey_get_details($key)['key'];
	$trust = ['kid'=>str_repeat('a',64),'issuer'=>'https://connector.test','audienceBase'=>'https://native.test/ocs/v2.php/apps/novaspace_platform/api/v1/registry','publicKey'=>$public,'label'=>'Test-Konnektor'];
	function enc(string $s): string { return rtrim(strtr(base64_encode($s),'+/','-_'),'='); }
	function assertion(string $purpose='status', array $patch=[], array $header=[]): string {
		global $key,$trust;
		$h=array_replace(['alg'=>'RS256','kid'=>$trust['kid'],'typ'=>'novaspace-client+jwt'],$header);
		$c=array_replace(['iss'=>$trust['issuer'],'aud'=>$trust['audienceBase'].'/'.$purpose,'sub'=>str_repeat('b',64),'client'=>str_repeat('c',64),'scope'=>['nextcloud:read'],'purpose'=>$purpose,'iat'=>time(),'exp'=>time()+30,'nonce'=>Store::id()],$patch);
		$input=enc(json_encode($h,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)).'.'.enc(json_encode($c,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
		openssl_sign($input,$sig,$key,OPENSSL_ALGO_SHA256); return $input.'.'.enc($sig);
	}
	function registryFixture(): object {
		global $trust;
		$f=fixture(); $f->db=new SqlDb(); $f->store=new Store($f->db,new RegistryConfig()); $f->seal=new TestSeal(); $f->verifier=new Verifier($trust);
		$f->service=new Service($f->users,$f->session,$f->provider,$f->seal,new RegistryUrls(),$f->store,$f->verifier);
		$f->client=['issuer'=>$trust['issuer'],'subjectHash'=>str_repeat('b',64),'clientHash'=>str_repeat('c',64),'nativeUid'=>'NativeActor','nativeTokenId'=>42];
		return $f;
	}
	function cloud(object $f): void { $f->users->user->uid=$f->token->uid='NativeActor';$f->token->type=\OCP\Authentication\Token\IToken::PERMANENT_TOKEN;$f->session->app='secret-app-token'; }
	function web(object $f,string $uid='Owner'): void { $f->users->user->uid=$f->token->uid=$uid;$f->token->type=\OCP\Authentication\Token\IToken::TEMPORARY_TOKEN;$f->session->app=null; }
	function registryDenied(callable $run, ?string $code=null): void {
		try { $run(); } catch (PlatformDenied $e) { check(!str_contains((string)$e,'SECRET')); if ($code!==null) check($e->getMessage()===$code); return; }
		throw new \RuntimeException('Unauthorized operation succeeded');
	}
	$registryTests=0;
	function rt(string $name,callable $run): void { global $registryTests;$run(registryFixture());$registryTests++;echo "OK: $name\n"; }
	rt('Valid gateway proof verifies with real RSA',fn($f)=>check($f->verifier->verify(assertion(),'status')['sub']===str_repeat('b',64)));
	rt('Signature tampering rejected',function($f){$a=assertion();$p=explode('.',$a);$p[2][0]=$p[2][0]==='a'?'b':'a';registryDenied(fn()=>$f->verifier->verify(implode('.',$p),'status'));});
	rt('Wrong issuer audience purpose key or algorithm rejected',function($f){foreach([['iss'=>'https://evil.test'],['aud'=>'https://evil.test'],['purpose'=>'status'],['sub'=>'Owner'],['client'=>'forged'],['nonce'=>'bad'],['scope'=>['other']]] as $p)registryDenied(fn()=>$f->verifier->verify(assertion('setup',$p),'setup'));foreach([['kid'=>'wrong'],['alg'=>'none'],['typ'=>'access']]as$h)registryDenied(fn()=>$f->verifier->verify(assertion('status',[],$h),'status'));});
	rt('Expired future and overlong assertions rejected',function($f){foreach([['iat'=>time()-100,'exp'=>time()-1],['iat'=>time()+20,'exp'=>time()+30],['exp'=>time()+120],['exp'=>time()]]as$p)registryDenied(fn()=>$f->verifier->verify(assertion('status',$p),'status'));});
	rt('Status permits narrow existing scopes while setup requires its read permission',function($f){check($f->verifier->verify(assertion('status',['scope'=>['deck:read']]),'status')['scope']===['deck:read']);registryDenied(fn()=>$f->verifier->verify(assertion('setup',['scope'=>['deck:read']]),'setup'));});
	rt('Native web session cannot act as the signed cloud client',function($f){registryDenied(fn()=>$f->service->status(assertion()),'app_password_required');});
	rt('Setup link creation writes no registry or history row',function($f){cloud($f);$r=$f->service->setup(assertion('setup'));check($r['registeredByThisCall']===false&&$r['clientDisplay']===str_repeat('c',12));check((int)$f->db->pdo->query('SELECT COUNT(*) FROM oc_ns_pf_connections')->fetchColumn()===0);});
	rt('App password cannot approve or revoke as the web owner',function($f){cloud($f);registryDenied(fn()=>$f->service->approve('x','Test'),'web_session_required');registryDenied(fn()=>$f->service->revoke(Store::id(),1,Store::id()),'web_session_required');});
	rt('Owner can approve the exact cloud proposal and receives native-bound connection',function($f){cloud($f);$r=$f->service->setup(assertion('setup'));parse_str(parse_url($r['setupUrl'],PHP_URL_QUERY),$q);web($f);$p=$f->service->preview($q['ticket']);check($p['ownerUid']==='Owner'&&$p['nativeUid']==='NativeActor');$a=$f->service->approve($q['ticket'],'Mein NativeActor');check($a['committed']&&$a['connection']['ownerUid']==='Owner');cloud($f);$s=$f->service->status(assertion());check($s['connection']['active']&&$s['ownerDelegationEnabled']===false);});
	rt('Forged or expired setup ticket cannot create a connection',function($f){registryDenied(fn()=>$f->service->approve('forged','Name'),'setup_link_invalid_or_expired');cloud($f);$r=$f->service->setup(assertion('setup'));parse_str(parse_url($r['setupUrl'],PHP_URL_QUERY),$q);$raw=$f->seal->values[$q['ticket']];$d=json_decode(substr($raw,strlen("novaspace.connection.setup.v1\0")),true);$d['issuedAt']=time()-700;$d['expiresAt']=time()-100;$f->seal->values[$q['ticket']]="novaspace.connection.setup.v1\0".json_encode($d);web($f);registryDenied(fn()=>$f->service->approve($q['ticket'],'Name'),'setup_link_invalid_or_expired');check($f->store->owned('Owner')===[]);});
	rt('Approval and journal are committed together',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'Name');check($a['committed']&&count($f->store->history('Owner'))===1&&$f->store->history('Owner')[0]['action']==='connection.created');});
	rt('Repeated proposal creates neither second connection nor event',function($f){$n=Store::id();$a=$f->store->approve('Owner',$f->client,$n,'Name');$b=$f->store->approve('Owner',$f->client,$n,'Name');check($b['replayed']&&$a['connection']['connectionId']===$b['connection']['connectionId']&&count($f->store->history('Owner'))===1);});
	rt('Changed intent under the same approval nonce is a conflict',function($f){$n=Store::id();$f->store->approve('Owner',$f->client,$n,'Name');registryDenied(fn()=>$f->store->approve('Owner',$f->client,$n,'Other'),'request_conflict');check(count($f->store->history('Owner'))===1);});
	rt('Another owner cannot take over a registered client',function($f){$f->store->approve('Owner',$f->client,Store::id(),'Name');registryDenied(fn()=>$f->store->approve('OtherOwner',$f->client,Store::id(),'Name'),'client_belongs_to_another_user');check($f->store->owned('OtherOwner')===[]);});
	rt('Consumed proposal cannot be replayed by another owner',function($f){$n=Store::id();$f->store->approve('Owner',$f->client,$n,'Name');registryDenied(fn()=>$f->store->approve('OtherOwner',$f->client,$n,'Name'),'approval_already_used');});
	rt('Owner filtering is exact despite case-insensitive UID columns',function($f){$f->store->approve('Owner',$f->client,Store::id(),'Name');check($f->store->owned('owner')===[]&&$f->store->history('owner')===[]);});
	rt('History omits credentials tickets OAuth subject and client hashes',function($f){$f->store->approve('Owner',$f->client,Store::id(),'Name');$j=json_encode($f->store->history('Owner'));check(!str_contains($j,'token')&&!str_contains($j,'subject')&&!str_contains($j,'client_hash')&&!str_contains($j,str_repeat('b',64)));});
	rt('A journal failure rolls back the connection mutation',function($f){$f->db->failEvent=true;registryDenied(fn()=>$f->store->approve('Owner',$f->client,Store::id(),'Name'),'registry_outcome_unconfirmed');check($f->store->owned('Owner')===[]&&$f->store->history('Owner')===[]);});
	rt('Definite failed commit rolls back both records',function($f){$f->db->failCommit=true;registryDenied(fn()=>$f->store->approve('Owner',$f->client,Store::id(),'Name'),'registry_outcome_unconfirmed');check($f->store->owned('Owner')===[]);});
	rt('Lost commit reply stays unknown and identical retry reads one committed result',function($f){$n=Store::id();$f->db->lostCommit=true;registryDenied(fn()=>$f->store->approve('Owner',$f->client,$n,'Name'),'registry_outcome_unconfirmed');$a=$f->store->approve('Owner',$f->client,$n,'Name');check($a['committed']&&$a['replayed']&&count($f->store->owned('Owner'))===1&&count($f->store->history('Owner'))===1);});
	rt('Revocation immediately changes subsequent signed status',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'Name')['connection'];$r=$f->store->revoke('Owner',$a['connectionId'],$a['revision'],Store::id());check($r['committed']&&!$f->store->status($f->client)['active']&&$f->store->status($f->client)['reason']==='revoked');});
	rt('Foreign owner cannot revoke by guessing connection ID',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'Name')['connection'];registryDenied(fn()=>$f->store->revoke('OtherOwner',$a['connectionId'],1,Store::id()),'connection_not_found');check($f->store->status($f->client)['active']);});
	rt('Native credential rotation cannot bypass a revoked cloud client',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'Name')['connection'];$f->store->revoke('Owner',$a['connectionId'],1,Store::id());$f->client['nativeTokenId']=99;check($f->store->status($f->client)['reason']==='revoked');});
	rt('Changed native credential on active binding is denied until explicit approval',function($f){$f->store->approve('Owner',$f->client,Store::id(),'Name');$f->client['nativeTokenId']=99;check($f->store->status($f->client)['reason']==='credential_changed');$f->store->approve('Owner',$f->client,Store::id(),'New');check($f->store->status($f->client)['active']);});
	rt('Consumed old ticket does not reactivate a revoked connection',function($f){$n=Store::id();$a=$f->store->approve('Owner',$f->client,$n,'Name')['connection'];$f->store->revoke('Owner',$a['connectionId'],1,Store::id());$b=$f->store->approve('Owner',$f->client,$n,'Name');check($b['replayed']&&$b['connection']['revokedAt']!==null);});
	rt('Fresh explicit approval reuses connection ID and increments revision',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'Name')['connection'];$f->store->revoke('Owner',$a['connectionId'],1,Store::id());$b=$f->store->approve('Owner',$f->client,Store::id(),'Name')['connection'];check($a['connectionId']===$b['connectionId']&&$b['revision']===3&&$b['revokedAt']===null);});
	rt('Stale revocation form cannot revoke a renewed grant',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'Name')['connection'];$f->store->revoke('Owner',$a['connectionId'],1,Store::id());$f->store->approve('Owner',$f->client,Store::id(),'Name');registryDenied(fn()=>$f->store->revoke('Owner',$a['connectionId'],1,Store::id()),'version_conflict');check($f->store->status($f->client)['active']);});
	rt('Duplicate revocation request does not append another event',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'Name')['connection'];$id=Store::id();$f->store->revoke('Owner',$a['connectionId'],1,$id);$f->store->revoke('Owner',$a['connectionId'],1,$id);check(count($f->store->history('Owner'))===2);});
	rt('Reused revocation ID cannot target another connection',function($f){$a=$f->store->approve('Owner',$f->client,Store::id(),'One')['connection'];$f->client['clientHash']=str_repeat('d',64);$b=$f->store->approve('Owner',$f->client,Store::id(),'Two')['connection'];$n=Store::id();$f->store->revoke('Owner',$a['connectionId'],1,$n);registryDenied(fn()=>$f->store->revoke('Owner',$b['connectionId'],1,$n),'request_conflict');});
	rt('Control characters and invalid labels cannot create registry entries',function($f){foreach(['',"bad\nname",str_repeat('a',81)]as$l)registryDenied(fn()=>$f->store->approve('Owner',$f->client,Store::id(),$l),'invalid_approval');check($f->store->owned('Owner')===[]);});
	class SchemaTable { public array $columns=[],$unique=[],$indexes=[]; public array $primary=[];public function addColumn($n,$t,$o){$this->columns[$n]=[$t,$o];}public function setPrimaryKey($k){$this->primary=$k;}public function addUniqueIndex($k,$n){$this->unique[$n]=$k;}public function addIndex($k,$n){$this->indexes[$n]=$k;} }
	class SchemaFixture {public array $tables=[];public function hasTable($n){return isset($this->tables[$n]);}public function createTable($n){return $this->tables[$n]=new SchemaTable();}}
	rt('Native migration creates two bounded tables with unique identity and request keys',function($f){$s=new SchemaFixture();$m=new \OCA\NovaspacePlatform\Migration\Version000200Date20261018030000();$out=new class implements \OCP\Migration\IOutput {};$m->changeSchema($out,fn()=>$s,[]);check(count($s->tables)===2&&$s->tables['ns_pf_connections']->unique['ns_pf_binding_unique']===['binding_hash']&&$s->tables['ns_pf_events']->unique['ns_pf_event_key_unique']===['event_key']);check(isset($s->tables['ns_pf_connections']->columns['owner_key'])&&$s->tables['ns_pf_connections']->columns['revoked_at'][1]['notnull']===false);try{$m->changeSchema($out,fn()=>$s,[]);}catch(\RuntimeException){return;}throw new \RuntimeException('Unexpected prior table overwritten');});
	function webController($f, array $params = []) { return new \OCA\NovaspacePlatform\Controller\ConnectionsController('novaspace_platform',new RegistryRequest($params),$f->service,new RegistryUrls()); }
	rt('Native write routes retain CSRF and authenticated access requirements',function($f){
		$routes=require __DIR__.'/../app/appinfo/routes.php';
		foreach(['approve','revoke']as$method){$m=new ReflectionMethod(\OCA\NovaspacePlatform\Controller\ConnectionsController::class,$method);$attrs=array_map(fn($a)=>$a->getName(),$m->getAttributes());check($attrs===['OCP\\AppFramework\\Http\\Attribute\\NoAdminRequired']);$matched=array_values(array_filter($routes['routes'],fn($r)=>$r['name']==='connections#'.$method));check(count($matched)===1&&$matched[0]['verb']==='POST');}
	});
	rt('Web controller confirms once and redirects to own list without granting device writes',function($f){cloud($f);$s=$f->service->setup(assertion('setup'));parse_str(parse_url($s['setupUrl'],PHP_URL_QUERY),$q);web($f);$r=webController($f,['ticket'=>$q['ticket'],'label'=>'Test','requesttoken'=>'framework'])->approve($q['ticket'],'Test');check($r instanceof \OCP\AppFramework\Http\RedirectResponse);$list=webController($f)->index();check($list->status===200&&count($list->params['connections'])===1&&$list->params['ownerUid']==='Owner'&&$list->headers['Cache-Control']==='no-store');});
	rt('Forged owner parameters cannot alter confirmation or create a journal entry',function($f){$r=webController($f,['ownerUid'=>'Other'])->approve('forged','Test');check($r->status===409&&$f->store->owned('Owner')===[]&&$f->store->history('Owner')===[]);});
	rt('Technical app password cannot use native owner list',function($f){cloud($f);$r=webController($f)->index();check($r->status===503&&!str_contains(json_encode($r->params),'secret-'));});
	rt('Registry controller uses signed header, rejects overrides and removes upstream errors',function($f){$c=fn($params,$proof)=>new \OCA\NovaspacePlatform\Controller\RegistryController('novaspace_platform',new RegistryRequest($params,$proof),$f->service);check($c([],assertion())->status()->status===503);cloud($f);check($c(['format'=>'json'],assertion())->status()->status===200);check($c(['ownerUid'=>'Owner'],assertion())->status()->status===400);$r=$c([],'SECRET')->status();check($r->status===503&&!str_contains(json_encode($r->data),'SECRET'));});
	function style($app,$name) { check($app==='novaspace_platform'&&in_array($name,['connections','connections-scroll'],true)); }
	function p($value) { echo htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
	rt('Rendered native form escapes identity label ticket and CSRF fields',function($f){
		$_=['error'=>null,'preview'=>['ownerUid'=>'Owner','label'=>'<script>alert(1)</script>','clientDisplay'=>'123','nativeUid'=>'NativeActor','ticket'=>'\"<ticket>'],'approveUrl'=>'/approve','homeUrl'=>'/home','requesttoken'=>'\"<csrf>'];
		ob_start();include __DIR__.'/../app/templates/connections.php';$html=ob_get_clean();
		check(!str_contains($html,'<script>')&&!str_contains($html,'<ticket>')&&!str_contains($html,'<csrf>')&&str_contains($html,'name="requesttoken"')&&str_contains($html,'method="post"'));
	});
	if (defined('NF_ACCESS_TESTS')) { require __DIR__ . '/platform-access-cases.php'; }
	echo "PASS: $registryTests registry/RSA/SQLite/native-boundary tests. No MariaDB or HTTP acceptance.\n";
}
