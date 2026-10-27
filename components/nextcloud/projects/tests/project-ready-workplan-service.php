<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCP { interface IConfig {} interface IUserSession {} interface IRequest {} interface IURLGenerator {} interface IDBConnection {} final class Server { public static array $services=[]; public static function get(string $id): mixed { return self::$services[$id]; } } final class Util { public static mixed $hook; public static function connectHook(...$a): void { self::$hook=[$a[2],$a[3]]; } } }
namespace OCP\Files { interface IRootFolder {} interface Folder {} interface File {} }
namespace OCP\Lock { interface ILockingProvider { public const LOCK_EXCLUSIVE=2; } }
namespace OC\Files { class Filesystem { public static bool $loaded=true; public static function getRoot(): string { return '/Soul/files'; } public static function getView(): object { return new class { public function getRelativePath(string $p): string { return substr($p,strlen('/Soul/files')); } }; } } }
namespace OCA\Deck\Db {
    class Acl { public const PERMISSION_READ=0; public const PERMISSION_EDIT=1; }
    class BoardMapper { public function find(int $id): object { return \Fixture::$db['boards'][$id]; } }
    class StackMapper { public function find(int $id): object { return \Fixture::$db['stacks'][$id]; } }
}
namespace OCA\Deck\Service {
    class PermissionService { public function getPermissions(...$args): array { return [true,true]; } }
    class BoardService {
        public function getUserBoards(): array { return array_values(\Fixture::$db['boards']); }
        public function create(string $title,string $uid,string $color): object { $b=new \BoardRow(77,$title,$uid);\Fixture::$db['boards'][77]=$b;return $b; }
    }
    class StackService { public function create(string $title,int $boardId,int $order): object { if(\Fixture::$failStack && $order===2)throw new \RuntimeException('STACK_FAILED');$s=new \StackRow(88+$order,$boardId,$title,$order);\Fixture::$db['stacks'][88+$order]=$s;return $s; } }
}
namespace {
use OCA\NovaspaceCapsules\Service\ProjectCreationService as NativeCreate;
use OCA\NovaspaceCapsules\Service\CapsuleCore as NativeCore;
class BoardRow { public function __construct(private int $id,private string $title,private string $owner){} public function getId(): int{return $this->id;} public function getOwner(): string{return $this->owner;} public function getTitle(): string{return $this->title;} public function getDeletedAt(): int{return 0;} public function getArchived(): bool{return false;} }
class StackRow { public function __construct(private int $id,private int $boardId,public string $title,public int $order){} public function getTitle(): string{return $this->title;} public function getOrder(): int{return $this->order;} public function getId(): int{return $this->id;} public function getBoardId(): int{return $this->boardId;} public function getDeletedAt(): int{return 0;} }
class FileRow implements \OCP\Files\File { public function __construct(public string $text,public string $name){} public function getId(): int{return 99;} public function getName(): string{return $this->name;} public function getContent(): string{return $this->text;} public function isReadable(): bool{return true;} public function isUpdateable(): bool{return true;} }
class Home implements \OCP\Files\Folder {
    public bool $read=true,$create=true; public string $owner='Soul';
    public function __construct(public string $relative='',public int $id=5){}
    public function getId(): int{return $this->id;} public function getPath(): string{return '/Soul/files'.($this->relative===''?'':'/'.$this->relative);}
    public function getName(): string{return basename($this->relative);}
    public function getOwner(): object{return new class($this->owner){public function __construct(private string $uid){}public function getUID(): string{return $this->uid;}};}
    public function isReadable(): bool{return $this->read;} public function isCreatable(): bool{return $this->create;}
    private function key(string $name): string{return ($this->relative===''?'':$this->relative.'/').$name;}
    public function nodeExists(string $name): bool{$k=$this->key($name);return isset(Fixture::$files[$k])||isset(Fixture::$folders[$k]);}
    public function get(string $name): object{$k=$this->key($name);return Fixture::$files[$k]??Fixture::$folders[$k]??throw new \RuntimeException('NOT_FOUND');}
    public function getById(int $id): array{return array_values(array_filter(Fixture::$files,fn($f)=>$f->getId()===$id));}
    public function getRelativePath(string $path): ?string{return str_starts_with($path,'/Soul/files/')?substr($path,strlen('/Soul/files/')):null;}
    public function getDirectoryListing(): array{return array_values(array_filter([...Fixture::$folders,...Fixture::$files],fn($f)=>$f instanceof self && dirname('/'.$f->relative)===('/'.$this->relative)));}
    public function getStorage(): object{return new class {public function instanceOfStorage(string $class): bool{return true;}};}
    public function newFolder(string $name): Home {
        if($this->nodeExists($name)||!$this->create)throw new \RuntimeException('FOLDER_EXISTS');
        ++Fixture::$folderWrites;$k=$this->key($name);$dir=new Home($k,20+count(Fixture::$folders));Fixture::$folders[$k]=$dir;
        if(Fixture::$lostFolderResponse)throw new \RuntimeException('FOLDER_RESPONSE_LOST');return $dir;
    }
    public function newFile(string $name,string $text): object {
        $key=$this->key($name);if(Fixture::$race)Fixture::$files[$key]=new FileRow('foreign-content',$name);
        $run=true;$params=['path'=>'/'.$key,'run'=>&$run];(\OCP\Util::$hook)($params);
        if(!$run)throw new \RuntimeException('VETO');
        ++Fixture::$fileWrites;return Fixture::$files[$key]=new FileRow($text,$name);
    }
}
class Config implements \OCP\IConfig {
    public function getUserValue(string $uid,string $app,string $key,string $default=''): string{return Fixture::$db['user'][$uid][$key]??$default;}
    public function setUserValue(string $uid,string $app,string $key,string $value): void{Fixture::$db['user'][$uid][$key]=$value;}
    public function getAppValue(string $app,string $key,string $default=''): string{return Fixture::$db['app'][$key]??$default;}
    public function setAppValue(string $app,string $key,string $value): void{Fixture::$db['app'][$key]=$value;}
    public function getSystemValueBool(string $key,bool $default): bool{return $default;}
}
class Session implements \OCP\IUserSession {public function getUser(): object{return new class{public function getUID(): string{return Fixture::$uid;}};}}
class Request implements \OCP\IRequest {public function getHeader(string $header): string{return Fixture::$headers[$header]??'';}}
class Urls implements \OCP\IURLGenerator {public function getAbsoluteURL(string $path): string{return 'https://cloud.example'.$path;}}
class Root implements \OCP\Files\IRootFolder {public function getUserFolder(string $uid): Home{return new Home();}}
class Database implements \OCP\IDBConnection {private array $before=[];public function beginTransaction(): void{$this->before=unserialize(serialize(Fixture::$db));}public function commit(): void{}public function rollBack(): void{Fixture::$db=$this->before;}}
class Locks implements \OCP\Lock\ILockingProvider {public function acquireLock(...$args): void{}public function releaseLock(...$args): void{}}
class Fixture {
    public static array $db=[],$files=[],$headers=[],$folders=[];public static int $folderWrites=0;public static bool $lostFolderResponse=false;public static bool $failStack=false,$race=false;public static int $fileWrites=0;public static string $uid='Soul';
    public static function reset(): NativeCreate {
        self::$db=['boards'=>[],'stacks'=>[],'user'=>[],'app'=>['projects'=>'{"30":{"boardId":30,"fileId":8058,"rootId":"ns_connector_root","afterCardId":549,"enabled":true}}']];
        self::$files=[];self::$folders=[];self::$folderWrites=0;self::$lostFolderResponse=false;self::$headers=[];self::$failStack=false;self::$race=false;self::$fileWrites=0;self::$uid='Soul';
        foreach([\OCA\Deck\Db\BoardMapper::class,\OCA\Deck\Db\StackMapper::class,\OCA\Deck\Service\PermissionService::class,\OCA\Deck\Service\BoardService::class,\OCA\Deck\Service\StackService::class] as $c)\OCP\Server::$services[$c]=new $c();
        return new NativeCreate(new Config(),new Session(),new Request(),new Root(),new Urls(),new Database(),new Locks());
    }
}
require __DIR__.'/../app/lib/Service/CapsuleCore.php';
require __DIR__.'/../update-0.1.2/lib/Service/MapWriteGuard.php';
require __DIR__.'/../update-0.2.8/lib/Service/ProjectFolders.php';
require __DIR__.'/../update-0.2.9/lib/Service/ProjectCreation.php';
require __DIR__.'/../update-0.2.9/lib/Service/ProjectCreationService.php';
$checks=0;$ok=static function(bool $pass,string $name)use(&$checks):void{if(!$pass)throw new \RuntimeException('SERVICE_TEST:'.$name);++$checks;};
$fails=static function(callable $f,string $name)use($ok):void{try{$f();}catch(\Throwable){$ok(true,$name);return;}$ok(false,$name);};
$id=str_repeat('a',32);$call=static fn(NativeCreate $s)=>$s->create($id,'Projekt','Beschreibung','/','DDCB55','Neu','Soul');
$s=Fixture::reset();$legacy=Fixture::$db['app']['projects'];$out=$call($s);$ok($out['verified']&&$out['boardId']===77&&$out['fileId']===99,'native-adapter-success');
$ok(Fixture::$db['app']['projects']===$legacy&&isset(Fixture::$db['app']['project_77']),'pilot-registry-preserved');
$ok(count(Fixture::$db['stacks'])===4&&array_map(fn($s)=>[$s->getTitle(),$s->getOrder()],array_values(Fixture::$db['stacks']))===[['Neu',0],['Wartend',1],['In Arbeit',2],['Zu prüfen',3]],'exact-four-native-columns-in-order');
$ok($out['stackId']===88&&$out['framework']['stacks'][0]['id']===88,'neu-is-default-target');
$snapshot=serialize([Fixture::$db,Fixture::$files]);$call($s);$ok($snapshot===serialize([Fixture::$db,Fixture::$files])&&Fixture::$fileWrites===1,'native-repeat-preserves-everything');
$map=NativeCore::parse(Fixture::$files['Projekt.km']->text);$mapping=json_decode(Fixture::$db['app']['project_77'],true);
$linked=NativeCore::prepare($map,['boardId'=>77,'cardId'=>100,'title'=>'Eigene Aufgabe','description'=>'Original','done'=>null],$mapping,'/Projekt.km','https://cloud.example');
$ok($linked['state']==='pending'&&count($linked['map']['root']['children'])===2,'new-project-allows-native-work-capsules');
Fixture::$files['Projekt.km']->text='changed';$fails(fn()=>$s->status($id),'changed-project-map-refused');$ok(Fixture::$files['Projekt.km']->text==='changed','changed-map-not-replaced');
$s=Fixture::reset();Fixture::$files['Projekt.km']=new FileRow('original','Projekt.km');$fails(fn()=>$call($s),'existing-file-refused');$ok(Fixture::$db['boards']===[]&&Fixture::$files['Projekt.km']->text==='original','existing-file-preflight-preserves-data');
$s=Fixture::reset();Fixture::$failStack=true;$fails(fn()=>$call($s),'column-creation-failure');$ok(Fixture::$db['boards']===[]&&Fixture::$db['user']===[]&&Fixture::$files===[],'board-journal-transaction-rolled-back');
$s=Fixture::reset();Fixture::$race=true;$fails(fn()=>$call($s),'racing-file-vetoed');$ok(Fixture::$files['Projekt.km']->text==='foreign-content'&&Fixture::$fileWrites===0&&!isset(Fixture::$db['app']['project_77']),'foreign-file-never-overwritten');
$s=Fixture::reset();Fixture::$uid='ChatGPT';$fails(fn()=>$call($s),'technical-account-needs-file-proof');$ok(Fixture::$db['boards']===[],'technical-denial-writes-nothing');
$s=Fixture::reset();$fails(fn()=>$s->create($id,'Projekt','','/','DDCB55','Neu','Other'),'account-switch-refused');$ok(Fixture::$db['boards']===[],'account-switch-writes-nothing');
$s=Fixture::reset();$fails(fn()=>$s->create($id,'Projekt','','/','DDCB55','Andere','Soul'),'new-project-fixed-matrix-input');$ok(Fixture::$db['boards']===[],'matrix-input-rejection-writes-nothing');
$s=Fixture::reset();$out=$call($s);Fixture::$db['stacks'][89]->title='Geändert';$fails(fn()=>$s->status($id),'changed-created-column-detected');
$s=Fixture::reset();$out=$call($s);$state=json_decode(Fixture::$db['user']['Soul']['creation_'.$id],true);unset($state['frameworkVersion'],$state['stacks']);
Fixture::$db['user']['Soul']['creation_'.$id]=json_encode($state);Fixture::$db['app']['project_77']=json_encode(\OCA\NovaspaceCapsules\Service\ProjectCreation::mapping($state));
$legacyMap=\OCA\NovaspaceCapsules\Service\ProjectCreation::map($state['input'],77,88,'https://cloud.example');Fixture::$files['Projekt.km']->text=$legacyMap;
$before=serialize([Fixture::$db,Fixture::$files]);$ok($call($s)['framework']===[]&&serialize([Fixture::$db,Fixture::$files])===$before,'legacy-complete-project-not-migrated');
// Personal defaults and legacy custom requests share the existing guarded protocol.
$auto=static fn(NativeCreate $s)=>$s->create($id,'Sommerfest','Planung','','DDCB55','Neu','Soul','auto');
$s=Fixture::reset();$out=$auto($s);$key='Projekte/Sommerfest/Sommerfest.km';
$ok(isset(Fixture::$folders['Projekte'],Fixture::$folders['Projekte/Sommerfest'],Fixture::$files[$key])&&Fixture::$folderWrites===2,'personal-default-folders-and-map');
$ok(Fixture::$db['boards'][77]->getTitle()==='Sommerfest'&&NativeCore::parse(Fixture::$files[$key]->text)['root']['data']['text']==='Sommerfest','board-map-and-root-same-name');
$before=serialize([Fixture::$db,Fixture::$files,Fixture::$folders]);$auto($s);$ok($before===serialize([Fixture::$db,Fixture::$files,Fixture::$folders])&&Fixture::$fileWrites===1&&Fixture::$folderWrites===2,'default-retry-no-duplicates');
$ok($s->status($id)['verified']===true,'default-status-verifies-pair');
$s=Fixture::reset();$s->folders();$ok(Fixture::$folderWrites===0&&Fixture::$db['boards']===[],'chooser-read-never-creates-default');
Fixture::$folders['Ablage']=new Home('Ablage',40);Fixture::$folders['Ablage/Planung']=new Home('Ablage/Planung',41);
$listing=$s->folders('/');$ok($listing['folders']===[['name'=>'Ablage','path'=>'/Ablage']]&&$listing['parent']===null&&$listing['creatable'],'chooser-current-home-only');
$listing=$s->folders('/Ablage');$ok($listing['parent']==='/'&&$listing['folders']===[['name'=>'Planung','path'=>'/Ablage/Planung']],'chooser-native-subfolders');
Fixture::$folders['Ablage/Planung']->read=false;$ok($s->folders('/Ablage')['folders']===[],'unreadable-folders-excluded');
Fixture::$folders['Ablage']->create=false;$ok($s->folders('/Ablage')['creatable']===false,'readonly-folder-is-navigation-only');
$fails(fn()=>$s->create($id,'Projekt','','/Ablage','DDCB55','Neu','Soul','custom'),'custom-readonly-blocked');$ok(Fixture::$db['boards']===[],'readonly-no-board-created');
Fixture::$folders['Ablage']->create=true;$s->create($id,'Projekt','','/Ablage','DDCB55','Neu','Soul','custom');$ok(isset(Fixture::$files['Ablage/Projekt.km'])&&Fixture::$folderWrites===0,'chosen-existing-folder-no-subfolder');
$s=Fixture::reset();Fixture::$files['Projekte']=new FileRow('original','Projekte');$fails(fn()=>$auto($s),'default-name-file-conflict');$ok(Fixture::$files['Projekte']->text==='original'&&Fixture::$db['boards']===[]&&Fixture::$folderWrites===0,'default-conflict-preserves-file');
$s=Fixture::reset();Fixture::$folders['Projekte']=new Home('Projekte',40);Fixture::$folders['Projekte']->owner='Other';$fails(fn()=>$auto($s),'shared-default-folder-refused');$ok(Fixture::$db['boards']===[]&&Fixture::$folderWrites===0,'foreign-folder-no-side-effects');
$s=Fixture::reset();Fixture::$folders['Projekte']=new Home('Projekte',40);Fixture::$folders['Projekte']->create=false;$fails(fn()=>$auto($s),'unwritable-default-refused');$ok(Fixture::$folderWrites===0&&Fixture::$db['boards']===[],'unwritable-default-no-board');
$s=Fixture::reset();Fixture::$lostFolderResponse=true;$auto($s);$ok(Fixture::$folderWrites===2&&Fixture::$fileWrites===1,'lost-folder-response-adopts-proven-folder');
$s=Fixture::reset();Fixture::$failStack=true;$fails(fn()=>$auto($s),'auto-board-transaction-failure');$ok(Fixture::$db['boards']===[]&&Fixture::$db['user']===[]&&Fixture::$files===[]&&count(Fixture::$folders)===2,'failure-can-leave-empty-folders-only');
Fixture::$failStack=false;$auto($s);$ok(Fixture::$folderWrites===2&&Fixture::$fileWrites===1,'same-attempt-reuses-empty-folders');
$s=Fixture::reset();$auto($s);$old=Fixture::$files[$key];unset(Fixture::$files[$key]);$old->name='Umbenannt.km';Fixture::$files['Verschoben/Umbenannt.km']=$old;
$ok($s->status($id)['fileId']===99,'completed-project-file-move-and-rename-use-id');
$s=Fixture::reset();$auto($s);$state=json_decode(Fixture::$db['user']['Soul']['creation_'.$id],true);$state['phase']='map-creating';unset($state['fileId']);Fixture::$db['user']['Soul']['creation_'.$id]=json_encode($state);unset(Fixture::$files[$key]);
$fails(fn()=>$auto($s),'unclear-map-not-recreated');$ok(Fixture::$fileWrites===1,'unknown-map-no-second-write');
$s=Fixture::reset();$auto($s);$state=json_decode(Fixture::$db['user']['Soul']['creation_'.$id],true);$state['phase']='board-created';unset($state['fileId']);Fixture::$db['user']['Soul']['creation_'.$id]=json_encode($state);Fixture::$folders['Projekte/Sommerfest']->id=900;
$fails(fn()=>$auto($s),'replaced-pending-folder-refused');$ok(Fixture::$fileWrites===1,'replacement-folder-no-write');
$partial=$s->status($id);$ok($partial['input']['folderMode']==='auto'&&$partial['input']['folder']==='/Projekte/Sommerfest','partial-retains-default-choice');
$s=Fixture::reset();$s->create($id,'Projekt','','/','DDCB55','Neu','Soul');$state=json_decode(Fixture::$db['user']['Soul']['creation_'.$id],true);$state['phase']='board-created';unset($state['fileId']);Fixture::$db['user']['Soul']['creation_'.$id]=json_encode($state);
$ok($s->status($id)['input']['folderMode']==='custom'&&$s->create($id,'Projekt','','/','DDCB55','Neu','Soul','custom')['verified'],'old-partial-request-and-fingerprint-preserved');
$s=Fixture::reset();foreach(['/../Other','/a//b','/a/./b',"/a\\b"]as $bad)$fails(fn()=>$s->folders($bad),'invalid-chooser-path');
$fails(fn()=>$s->create($id,'Projekt','','/','DDCB55','Neu','Soul','unknown'),'invalid-mode');$ok(Fixture::$folderWrites===0&&Fixture::$db['boards']===[],'bad-input-writes-nothing');
Fixture::$uid='ChatGPT';$fails(fn()=>$s->folders('/'),'chooser-technical-account-denied');
$s=Fixture::reset();$out=$call($s);$state=json_decode(Fixture::$db['user']['Soul']['creation_'.$id],true);
$ok($state['workplanVersion']===1&&isset(NativeCore::parse(Fixture::$files['Projekt.km']->text)['root']['data']['nfDeckAggregate']),'new-journal-registers-ready-workplan');
unset($state['workplanVersion'],$state['fileId']);$state['phase']='map-creating';Fixture::$db['user']['Soul']['creation_'.$id]=json_encode($state);
$legacyText=\OCA\NovaspaceCapsules\Service\ProjectCreation::map($state['input'],77,88,'https://cloud.example',\OCA\NovaspaceCapsules\Service\ProjectCreation::framework($state),false);Fixture::$files['Projekt.km']->text=$legacyText;
$ok($call($s)['verified']&&Fixture::$files['Projekt.km']->text===$legacyText&&Fixture::$fileWrites===1,'legacy-uncertain-map-adopted-without-overwrite-or-second-write');
echo 'NovaSpace projektbereiter nativer Adapter: '.$checks." Prüfungen bestanden.\n";
}
