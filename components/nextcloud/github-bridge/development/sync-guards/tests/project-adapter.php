<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace Psr\Log { interface LoggerInterface {} }
namespace OCA\DeckGithubSync\Db {
    class BoardMap {
        public const DIR_BOTH='both', DIR_TO_GITHUB='deck_to_github', DIR_TO_DECK='github_to_deck';
        public function __construct(private string $direction, private array $fields) {}
        public function getUserId(): string { return 'FixtureOwner'; }
        public function getGithubProjectId(): string { return 'fixture-project'; }
        public function getDirection(): string { return $this->direction; }
        public function getFieldMap(): array { return $this->fields; }
    }
}
namespace OCA\DeckGithubSync\Service {
    class GithubClientService {
        public array $calls=[];
        public function graphql(string $owner,string $query,array $variables): array {
            $this->calls[]=[$owner,$query,$variables];
            if(str_contains($query,'createProjectV2Field')) {
                return ['data'=>['createProjectV2Field'=>['projectV2Field'=>['id'=>'date-new']]]];
            }
            if(str_contains($query,'updateProjectV2Field')) {
                return ['data'=>['updateProjectV2Field'=>['projectV2Field'=>['options'=>[['id'=>'todo','name'=>'Todo'],['id'=>'pilot','name'=>'Pilot']]]]]];
            }
            if(str_contains($query,'items(first:50')) {
                return ['data'=>['node'=>['items'=>['nodes'=>[['id'=>'item-1','content'=>['__typename'=>'DraftIssue','body'=>'Beta']]],'pageInfo'=>['hasNextPage'=>false,'endCursor'=>null]]]]];
            }
            if(str_contains($query,'fields(first:100')) {
                return ['data'=>['node'=>['fields'=>['nodes'=>[['id'=>'status','name'=>'Status','options'=>[['id'=>'todo','name'=>'Todo','color'=>'GRAY','description'=>'']]]]]]]];
            }
            throw new \LogicException('Unexpected GraphQL query');
        }
    }
}
namespace {
    require __DIR__.'/../upstream/lib/Service/GithubProjectService.php';
    require __DIR__.'/../bridge/GithubSyncProjectAdapter.php';
    use OCA\NovaspacePlatform\Service\GithubSyncProjectAdapter;
    use OCA\DeckGithubSync\Db\BoardMap;
    use OCA\DeckGithubSync\Service\GithubClientService;
    $checks=0;
    function adapterCheck(bool $v,string $message): void {global $checks;if(!$v){throw new RuntimeException($message);}++$checks;}
    function adapterFixture(string $direction='github_to_deck',array $patch=[]): array {
        $fields=array_fill_keys(['title','description','status','done','labels','assignees','due','start','comments'],'off');
        $fields['title']=$direction;$fields['description']=$direction;$fields=array_replace($fields,$patch);
        $client=new GithubClientService();$logger=new class implements \Psr\Log\LoggerInterface {};
        return [new GithubSyncProjectAdapter($client,$logger,new BoardMap($direction,$fields)),$client];
    }
    foreach(['github_to_deck','both']as$direction){
        [$adapter,$client]=adapterFixture($direction);
        $items=$adapter->listItems('FixtureOwner','fixture-project','page-2','updated:>@today-1d');
        adapterCheck($client->calls[0][2]['filter']==='','Reverse query must remove the date filter in the real project service');
        adapterCheck($client->calls[0][2]['after']==='page-2'&&$items['items'][0]['id']==='item-1','Cursor and item decoding retained');
    }
    [$adapter,$client]=adapterFixture('deck_to_github');
    $adapter->listItems('FixtureOwner','fixture-project',null,'updated:>@today-1d');
    adapterCheck($client->calls[0][2]['filter']==='updated:>@today-1d','Forward-only query retained');
    [$adapter,$client]=adapterFixture('both');
    $fields=$adapter->getFields('FixtureOwner','fixture-project');
    adapterCheck($fields['options']===[]&&$fields['statusFieldId']==='status','Suppress Deck list input without replacing stored status ID');
    $options=$adapter->ensureStatusOptions('FixtureOwner','status',$fields['fields'],['Pilot']);
    adapterCheck($options===['todo'=>'todo']&&count($client->calls)===1,'Disabled status must not issue a mutation');
    $dates=$adapter->ensureDateFields('FixtureOwner','fixture-project','','');
    adapterCheck($dates===['startDateFieldId'=>'','dateFieldId'=>'']&&count($client->calls)===1,'Disabled dates must not issue a mutation');
    [$adapter,$client]=adapterFixture('both',['status'=>'github_to_deck']);
    $fields=$adapter->getFields('FixtureOwner','fixture-project');
    adapterCheck($fields['options']===['Todo'=>'todo'],'Explicit inbound status retains list names');
    $adapter->ensureStatusOptions('FixtureOwner','status',$fields['fields'],['Pilot']);
    adapterCheck(count($client->calls)===1,'Inbound-only status forbids outbound option changes');
    [$adapter,$client]=adapterFixture('both',['status'=>'deck_to_github']);
    $fields=$adapter->getFields('FixtureOwner','fixture-project');
    $options=$adapter->ensureStatusOptions('FixtureOwner','status',$fields['fields'],['Pilot']);
    adapterCheck($fields['options']===[]&&$options===['todo'=>'todo','pilot'=>'pilot'],'Outbound status retains authorized options without inbound list names');
    adapterCheck(count($client->calls)===2&&str_contains($client->calls[1][1],'updateProjectV2Field'),'One authorized status mutation');
    foreach(['due'=>'Due date','start'=>'Start date']as$field=>$name){
        [$adapter,$client]=adapterFixture('both',[$field=>'deck_to_github']);
        $adapter->ensureDateFields('FixtureOwner','fixture-project','','');
        adapterCheck(count($client->calls)===1&&$client->calls[0][2]['name']===$name,'Only the selected date field is created');
    }
    [$adapter,$client]=adapterFixture('both',['due'=>'deck_to_github','start'=>'deck_to_github']);
    $adapter->ensureDateFields('FixtureOwner','fixture-project','start-existing','due-existing');
    adapterCheck($client->calls===[],'Existing date IDs must not be recreated');
    foreach(['wrong-owner','wrong-project']as$case){
        [$adapter,$client]=adapterFixture();
        try{$adapter->listItems($case==='wrong-owner'?'Other':'FixtureOwner',$case==='wrong-project'?'other-project':'fixture-project');adapterCheck(false,'Wrong target accepted');}
        catch(RuntimeException $e){adapterCheck($e->getMessage()==='sync_adapter_target_conflict','Adapter target conflict');}
        adapterCheck($client->calls===[],'No request on target conflict');
    }
    echo "Real project service with bridge adapter: $checks checks passed\n";
}
