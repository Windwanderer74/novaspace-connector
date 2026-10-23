<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);

namespace OCP {
    class Server { public static array $services=[]; public static function get(string $id): mixed { if(!array_key_exists($id,self::$services)){throw new \LogicException('Unregistered fixture service: '.$id);} return self::$services[$id]; } }
    interface IUserManager {}
    interface IUserSession {}
    interface IL10N {}
}
namespace OCP\Lock { interface ILockingProvider { public const LOCK_EXCLUSIVE = 1; } }
namespace OCP\AppFramework\Db { class DoesNotExistException extends \RuntimeException {} }
namespace Psr\Log { interface LoggerInterface {} }
namespace OCA\DeckGithubSync\Db {
    class BoardMap {
        public const DIR_BOTH = 'both';
        public const DIR_TO_GITHUB = 'deck_to_github';
        public const DIR_TO_DECK = 'github_to_deck';
        public array $values;
        public function __construct(array $fields, string $direction) {
            $this->values = ['id'=>13,'userId'=>'FixtureOwner','deckBoardId'=>11,
                'githubProjectId'=>'fixture-project','githubRepository'=>'','direction'=>$direction,
                'fieldMap'=>$fields,'lastSync'=>time(),'cooldownUntil'=>0,
                'statusFieldId'=>'status-field','dateFieldId'=>'','startFieldId'=>''];
        }
        public function __call(string $method, array $args): mixed {
            $key = lcfirst(substr($method, 3));
            if (str_starts_with($method, 'get') && array_key_exists($key, $this->values)) { return $this->values[$key]; }
            if (str_starts_with($method, 'set') && count($args) === 1) { $this->values[$key] = $args[0]; return null; }
            throw new \LogicException('Unexpected mapping method: '.$method);
        }
    }
    class ItemMap {
        public array $values = ['id'=>17,'mapId'=>13,'deckCardId'=>7,'githubItemId'=>'item-1',
            'githubContentId'=>'draft-1','contentType'=>'DraftIssue','deckHash'=>'','githubHash'=>'','syncHash'=>''];
        public function __call(string $method, array $args): mixed {
            $key = lcfirst(substr($method, 3));
            if (str_starts_with($method, 'get') && array_key_exists($key, $this->values)) { return $this->values[$key]; }
            if (str_starts_with($method, 'set') && count($args) === 1) { $this->values[$key] = $args[0]; return null; }
            throw new \LogicException('Unexpected item-map method: '.$method);
        }
    }
    class BoardMapMapper {
        public int $updates = 0;
        public function __construct(public BoardMap $map) {}
        public function update(BoardMap $map): void { ++$this->updates; }
        public function findById(int $id): BoardMap { return $this->map; }
    }
    class ItemMapMapper {
        public int $updates = 0;
        public function __construct(public array $links) {}
        public function findByMap(int $id): array { return $this->links; }
        public function update(ItemMap $link): void { ++$this->updates; }
        public function __call(string $name, array $args): never { throw new \LogicException('Unexpected link mutation: '.$name); }
    }
    class UserMapMapper { public function findByMap(int $id): array { return []; } }
}
namespace OCA\DeckGithubSync\Service {
    class GithubRateLimitException extends \RuntimeException { public function getRetryAt(): int { return time()+60; } }
    class DeckService {
        public array $card;
        public array $stacks = [['id'=>9,'title'=>'Pilot']];
        public array $patches = [];
        public int $stackAttempts = 0;
        public bool $allowStackCreation = false;
        public function __construct(string $body) {
            $this->card = ['id'=>7,'title'=>'Fixture draft','description'=>$body,'stackId'=>9,
                'lastModified'=>time()-30,'done'=>false,'archived'=>false,'duedate'=>null,
                'startdate'=>null,'labels'=>[],'assignedUsers'=>[]];
        }
        public function assertAvailable(): void {}
        public function getCards(string $owner, int $board): array { return [$this->card]; }
        public function getStacks(string $owner, int $board): array { return $this->stacks; }
        public function createStack(string $owner, int $board, string $title, int $order): int {
            ++$this->stackAttempts;
            if (!$this->allowStackCreation) { throw new \RuntimeException('Permission denied'); }
            $id = 100+$this->stackAttempts; $this->stacks[] = ['id'=>$id,'title'=>$title]; return $id;
        }
        public function updateCard(string $owner, int $cardId, array $patch): void {
            if ($cardId !== 7) { throw new \LogicException('Wrong card'); }
            $this->patches[] = $patch; $this->card = array_replace($this->card, $patch);
        }
        public static function normalizeDue(mixed $date): ?string { return $date; }
        public function __call(string $name, array $args): never {
            throw new \LogicException('Unexpected Deck operation: '.$name);
        }
    }
    class GithubClientService {
        public array $createdFields=[];
        public function __construct(public string $body) {}
        public function graphql(string $owner,string $query,array $variables): array {
            if(!str_contains($query,'createProjectV2Field')){throw new \LogicException('Unexpected fixture GraphQL');}
            $this->createdFields[]=$variables['name'];
            return ['data'=>['createProjectV2Field'=>['projectV2Field'=>['id'=>'field-'.count($this->createdFields)]]]];
        }
    }
    class GithubProjectService {
        public static ?self $lastInstance=null;
        public array $item;
        public array $filters = [];
        public int $statusOptionsWrites = 0;
        public int $draftWrites = 0;
        public bool $hasStatus = true;
        public bool $twoPages = false;
        public bool $missingItem = false;
        public function __construct(GithubClientService $client, \Psr\Log\LoggerInterface $logger) {
            self::$lastInstance=$this; $body=$client->body;
            $this->item = ['id'=>'item-1','updatedAt'=>gmdate('c'),
                'content'=>['__typename'=>'DraftIssue','id'=>'draft-1','title'=>'Fixture draft',
                    'body'=>$body,'updatedAt'=>gmdate('c')],'fieldValues'=>['nodes'=>[]]];
        }
        public function getFields(string $owner, string $project): array {
            return ['fields'=>$this->hasStatus ? [['id'=>'status-field']] : [],
                'statusFieldId'=>$this->hasStatus ? 'status-field' : '',
                'dateFieldId'=>'','startDateFieldId'=>'',
                'options'=>$this->hasStatus ? ['Todo'=>'todo','In progress'=>'progress','Done'=>'done'] : []];
        }
        public function listItems(string $owner, string $project, ?string $after=null, ?string $filter=null): array {
            $this->filters[] = $filter;
            // Replays the observed GitHub behavior: an updated-date query omits this draft.
            if ($filter !== null || $this->missingItem) { return ['items'=>[],'hasNext'=>false,'cursor'=>null]; }
            if ($this->twoPages && $after === null) { return ['items'=>[],'hasNext'=>true,'cursor'=>'page-2']; }
            return ['items'=>[$this->item],'hasNext'=>false,'cursor'=>null];
        }
        public function ensureDateFields(string $owner, string $project, string $start, string $due): array {
            return ['startDateFieldId'=>$start,'dateFieldId'=>$due];
        }
        public function ensureStatusOptions(string $owner, string $field, array $fields, array $stacks): array {
            ++$this->statusOptionsWrites; return ['todo'=>'todo','in progress'=>'progress','done'=>'done'];
        }
        public function updateDraft(string $owner, string $itemId, string $contentId, string $title, string $body): void {
            if ($itemId !== 'item-1' || $contentId !== 'draft-1') { throw new \LogicException('Wrong draft'); }
            ++$this->draftWrites; $this->item['content']['title']=$title; $this->item['content']['body']=$body;
        }
        public static function statusOf(array $item, ?string $field=null): string { return ''; }
        public static function labelsOf(array $item): array { return []; }
        public static function assigneesOf(array $item): array { return []; }
        public static function dateOf(array $item, string $field): ?string { return null; }
        public function __call(string $name, array $args): never {
            throw new \LogicException('Unexpected GitHub operation: '.$name);
        }
    }
}
namespace {
    use OCA\DeckGithubSync\Db\{BoardMap,BoardMapMapper,ItemMap,ItemMapMapper,UserMapMapper};
    use OCA\DeckGithubSync\Service\{SyncService,DeckService,GithubProjectService};
    final class FixtureUsers implements \OCP\IUserManager {
        public function get(string $uid): object { return new class($uid) {
            public function __construct(private string $uid) {}
            public function getUID(): string { return $this->uid; }
        }; }
    }
    final class FixtureSession implements \OCP\IUserSession {
        private ?object $user = null;
        public function getUser(): ?object { return $this->user; }
        public function setUser(?object $user): void { $this->user=$user; }
    }
    final class FixtureLogger implements \Psr\Log\LoggerInterface {
        public function __call(string $name, array $args): void {}
    }
    final class FixtureL10n implements \OCP\IL10N {
        public function t(string $message, array $args=[]): string { return $args === [] ? $message : vsprintf($message, $args); }
    }
    final class FixtureLocks implements \OCP\Lock\ILockingProvider {
        public int $acquired=0; public int $released=0;
        public function acquireLock(string $path, int $kind): void { ++$this->acquired; }
        public function releaseLock(string $path, int $kind): void { ++$this->released; }
    }
    if ($argc !== 3 || !in_array($argv[2], ['baseline','fixed'], true)) { throw new \InvalidArgumentException('Expected source path and baseline|fixed'); }
    require $argv[1];
    require __DIR__ . '/../bridge/GithubSyncProjectAdapter.php';
    $checks = 0;
    function check(bool $condition, string $message): void {
        global $checks;
        if (!$condition) { throw new \RuntimeException($message); }
        ++$checks;
    }
    function body(string $variant): string {
        return "<!-- nf-mindmap:{\"version\":1,\"path\":\"/Fixture.km\",\"fileId\":\"fixture-file\",\"nodeId\":\"fixture-node\",\"checklistId\":\"fixture\"} -->\n"
            ."Text: ".$variant.".\n<!-- nf-checklist:fixture:start -->\n"
            ."- [ ] Synthetic condition. <!-- nf-task:fixture-condition -->\n<!-- nf-checklist:fixture:end -->\n";
    }
    function fixture(string $direction='github_to_deck', array $overrides=[]): array {
        $fields = array_fill_keys(['title','description','status','done','labels','assignees','due','start','comments'], 'off');
        $fields['title']=$direction; $fields['description']=$direction;
        $fields=array_replace($fields,$overrides);
        $map=new BoardMap($fields,$direction); $link=new ItemMap();
        $deck=new DeckService(body('Alpha')); $client=new \OCA\DeckGithubSync\Service\GithubClientService(body('Beta'));
        $maps=new BoardMapMapper($map); $items=new ItemMapMapper([$link]); $locks=new FixtureLocks();
        $session=new FixtureSession(); $logger=new FixtureLogger();
        $source=dirname(realpath($GLOBALS['argv'][1]),3);
        \OCP\Server::$services=[
            'OCP\App\IAppManager'=>new class($source){public function __construct(public string $path){}public function getAppPath(string $id,bool $enabled=true): string {if($id!=='deckgithubsync'){throw new \LogicException('Wrong app');}return $this->path;}},
            BoardMapMapper::class=>$maps,ItemMapMapper::class=>$items,UserMapMapper::class=>new UserMapMapper(),
            DeckService::class=>$deck,'OCA\DeckGithubSync\Service\GithubClientService'=>$client,
            'OCP\IUserManager'=>new FixtureUsers(),'OCP\IUserSession'=>$session,
            'Psr\Log\LoggerInterface'=>$logger,'OCP\Lock\ILockingProvider'=>$locks,
            'OCP\L10N\IFactory'=>new class {public function get(string $app): FixtureL10n {return new FixtureL10n();}}
        ];
        $service=\OCA\NovaspacePlatform\Service\GithubSyncProjectAdapter::forMapping($map);
        $github=GithubProjectService::$lastInstance;
        $link->setDeckHash($service->hashDeck($deck->card));
        $old=$github->item; $old['content']['body']=body('Alpha'); $link->setGithubHash($service->hashGithub($old));
        return compact('map','link','deck','github','maps','items','locks','session','service','client');
    }
    $f=fixture(); $result=$f['service']->syncBoard($f['map']);
    if ($argv[2] === 'baseline') {
        check($f['github']->filters === ['updated:>@today-1d'], 'Baseline must reproduce the incremental draft filter');
        check($f['deck']->card['description'] === body('Alpha'), 'Baseline must reproduce the missed draft body');
        check($f['deck']->stackAttempts === 3 && count($result['warnings']) === 3, 'Baseline must reproduce disabled-status stack attempts');
        echo "Baseline defects reproduced: $checks checks\n"; exit(0);
    }
    check($result['errors'] === [], 'Reverse errors');
    check($f['github']->filters === [null], 'Reverse must fetch drafts without updated-date filtering');
    check($f['deck']->card['description'] === body('Beta'), 'Complete body with hidden task identifiers must return unchanged');
    check($f['deck']->stackAttempts === 0 && $result['warnings'] === [], 'Disabled status must not create Deck lists');
    check($f['deck']->card['stackId'] === 9 && !$f['deck']->card['done'] && !$f['deck']->card['archived'], 'Unselected state must be preserved');
    check($result['github_to_deck'] === 1 && count($f['deck']->patches) === 1, 'Exactly one existing card updated');
    check($f['locks']->acquired === $f['locks']->released && $f['session']->getUser() === null, 'Lock and user-session cleanup');
    $repeat=$f['service']->syncBoard($f['map']);
    check($repeat['github_to_deck'] === 0 && count($f['deck']->patches) === 1 && count($f['items']->links) === 1, 'Unchanged repeat must not create or rewrite cards');

    $f=fixture('both'); $result=$f['service']->syncBoard($f['map']);
    check($result['errors'] === [] && $f['deck']->card['description'] === body('Beta'), 'Bidirectional newer GitHub draft must return');
    check($f['github']->filters === [null], 'Bidirectional runs also need complete draft discovery');
    check($f['github']->statusOptionsWrites === 0 && $f['deck']->stackAttempts === 0, 'Status off must suppress status schema writes in both directions');

    $f=fixture('both'); $f['deck']->card['description']=body('Gamma'); $f['deck']->card['lastModified']=time()+30;
    $result=$f['service']->syncBoard($f['map']);
    check($result['errors'] === [] && $f['deck']->card['description'] === body('Gamma') && $f['github']->item['content']['body'] === body('Gamma'), 'Existing newer-Deck conflict rule must remain intact');

    $f=fixture('github_to_deck',['status'=>'github_to_deck']); $f['deck']->allowStackCreation=true;
    $result=$f['service']->syncBoard($f['map']);
    check($result['errors'] === [] && $f['deck']->stackAttempts === 3, 'Explicit status-to-Deck direction retains list setup');
    $f=fixture('both',['status'=>'deck_to_github']); $result=$f['service']->syncBoard($f['map']);
    check($result['errors'] === [] && $f['github']->statusOptionsWrites === 1 && $f['deck']->stackAttempts === 0, 'Status-to-GitHub may only prepare GitHub options');

    $f=fixture(); $f['github']->hasStatus=false; $f['map']->setStatusFieldId('');
    $result=$f['service']->syncBoard($f['map']);
    check($result['errors'] === [] && $result['warnings'] === [] && $f['deck']->card['description'] === body('Beta'), 'Missing disabled status is not a failure');

    $f=fixture('deck_to_github'); $result=$f['service']->syncBoard($f['map']);
    check($f['github']->filters === ['updated:>@today-1d'] && $f['deck']->patches === [] && $result['errors'] === [], 'Unchanged forward-only behavior stays incremental');
    check($f['github']->statusOptionsWrites === 0, 'Disabled forward status must not prepare options');

    $f=fixture(); $f['github']->twoPages=true; $result=$f['service']->syncBoard($f['map']);
    check($f['github']->filters === [null,null] && $f['deck']->card['description'] === body('Beta') && $result['errors'] === [], 'Complete reverse fetch must retain pagination');
    $f=fixture(); $f['github']->missingItem=true; $result=$f['service']->syncBoard($f['map']);
    check($f['deck']->card['description'] === body('Alpha') && $f['deck']->patches === [] && count($f['items']->links) === 1, 'Missing GitHub item must not delete or archive Deck');

    $f=fixture('github_to_deck',['description'=>'off']); $f['github']->item['content']['title']='Changed title';
    $result=$f['service']->syncBoard($f['map']);
    check($result['errors'] === [] && $f['deck']->card['title'] === 'Changed title' && $f['deck']->card['description'] === body('Alpha'), 'Disabled description must remain unchanged');

    $f=fixture(); $f['map']->setCooldownUntil(time()+60); $result=$f['service']->syncBoard($f['map']);
    check(count($result['errors']) === 1 && $f['github']->filters === [] && $f['deck']->patches === [], 'Cooldown must still prevent all remote and Deck work');
    check($f['locks']->acquired === 1 && $f['locks']->released === 1, 'Cooldown releases lock');
    $f=fixture('both'); $f['service']->syncBoard($f['map']);
    check($f['client']->createdFields===[], 'Disabled dates must not create GitHub date fields');
    $f=fixture('both',['due'=>'deck_to_github']); $f['service']->syncBoard($f['map']);
    check($f['client']->createdFields===['Due date'], 'Only selected due field may be created');
    $f=fixture('both',['start'=>'deck_to_github']); $f['service']->syncBoard($f['map']);
    check($f['client']->createdFields===['Start date'], 'Only selected start field may be created');
    $f=fixture('github_to_deck',['due'=>'deck_to_github']); $f['service']->syncBoard($f['map']);
    check($f['client']->createdFields===[], 'Global reverse direction forbids outbound date setup');
    foreach([['AnotherOwner','fixture-project'],['FixtureOwner','another-project']] as [$owner,$project]){
        $f=fixture();
        try{$f['github']->listItems($owner,$project);check(false,'Wrong adapter target accepted');}
        catch(\RuntimeException $e){check($e->getMessage()==='sync_adapter_target_conflict','Adapter target guarded');}
        check($f['github']->filters===[], 'Wrong target makes no project request');
    }
    $f=fixture(); $before=$f['map']->values; $f['service']->syncBoard($f['map']); $after=$f['map']->values;
    unset($before['lastSync'],$before['cooldownUntil'],$after['lastSync'],$after['cooldownUntil']);
    check($before===$after, 'Adapter must not rewrite mapping direction, fields or stored status ID');
    $manager=\OCP\Server::$services['OCP\App\IAppManager']; $originalPath=$manager->path;
    $bad=sys_get_temp_dir().'/ns-source-guard-'.bin2hex(random_bytes(6));
    mkdir($bad.'/lib/Service',0700,true);
    foreach(['SyncService.php','DeckService.php','GithubProjectService.php'] as $file){copy($originalPath.'/lib/Service/'.$file,$bad.'/lib/Service/'.$file);}
    file_put_contents($bad.'/lib/Service/SyncService.php',"\n// unexpected modification\n",FILE_APPEND);
    $manager->path=$bad;
    try{\OCA\NovaspacePlatform\Service\GithubSyncProjectAdapter::forMapping($f['map']);check(false,'Changed upstream source accepted');}
    catch(\RuntimeException $e){check($e->getMessage()==='sync_source_changed','Source guard stops an unreviewed upstream version');}
    finally{foreach(glob($bad.'/lib/Service/*')as$file){unlink($file);}rmdir($bad.'/lib/Service');rmdir($bad.'/lib');rmdir($bad);}
    echo "Unmodified upstream with bridge adapter: $checks checks passed\n";
}
