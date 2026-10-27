<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCP { interface IRequest { public function getHeader(string $key): string; } }
namespace OCP\AppFramework { class Controller { public function __construct(string $app, protected \OCP\IRequest $request) {} } }
namespace OCP\AppFramework\Http {
    class DataResponse {
        public array $headers = [];
        public function __construct(public array $data, public int $status = 200) {}
        public function addHeader(string $key, string $value): void { $this->headers[$key] = $value; }
    }
}
namespace OCP\AppFramework\Http\Attribute {
    #[\Attribute(\Attribute::TARGET_METHOD)] class NoAdminRequired {}
    #[\Attribute(\Attribute::TARGET_METHOD)] class NoCSRFRequired {}
}
namespace OCA\NovaspaceCapsules\Service {
    class CapsuleService { public static function failureCode(\Throwable $e): string { return preg_match('/^[A-Z_]+$/D', $e->getMessage()) ? $e->getMessage() : 'RUNTIME_ERROR'; } }
    class ProjectCreationService {
        public array $calls = [];
        public string $uid = 'ChatGPT', $authorization = '', $proof = '';
        public bool $fail = false;
        public function apiContext(): array {
            $this->calls[] = 'context';
            if (!CapsuleCore::apiAllowed($this->uid, $this->authorization !== '', $this->proof)) { throw new \RuntimeException('PROJECT_ACCESS'); }
            return ['account'=>$this->uid];
        }
        public function folders(string $path): array { $this->calls[] = ['folders', $path]; return ['path'=>$path, 'parent'=>null, 'creatable'=>true, 'folders'=>[]]; }
        public function status(string $id): array { $this->calls[] = ['status', $id]; return ['state'=>'not-found', 'creationId'=>$id]; }
        public function create(...$args): array {
            $this->calls[] = ['create', $args];
            if ($this->fail) { throw new \RuntimeException('untrusted native error includes credentials'); }
            if ($args[6] !== $this->uid) { throw new \RuntimeException('PROJECT_ACCOUNT_CHANGED'); }
            return ['state'=>'complete', 'creationId'=>$args[0], 'boardId'=>77, 'fileId'=>99, 'verified'=>true];
        }
    }
}
namespace {
require __DIR__.'/../app/lib/Service/CapsuleCore.php';
require __DIR__.'/../update-0.2.9/lib/Service/ProjectCreation.php';
require __DIR__.'/../update-0.2.12/lib/Controller/CreationController.php';
$checks=0;
$ok=static function(bool $pass,string $name)use(&$checks):void{if(!$pass)throw new \RuntimeException('CONNECTOR_ENTRY_TEST:'.$name);++$checks;};
$make=static function(string $authorization='Basic fixture',string $proof='files-read-write-v1'):array{
    $request=new class($authorization) implements \OCP\IRequest { public function __construct(private string $value){} public function getHeader(string $key):string{return $key==='Authorization'?$this->value:'';} };
    $service=new \OCA\NovaspaceCapsules\Service\ProjectCreationService();$service->authorization=$authorization;$service->proof=$proof;
    return [new \OCA\NovaspaceCapsules\Controller\CreationController($request,$service),$service];
};
$id=str_repeat('b',32);
foreach(['','Bearer fixture','Cookie fixture']as$authorization){
    [$c,$s]=$make($authorization);$out=$c->apiInfo();$ok($out->status===403&&$s->calls===[],'non-basic-no-service-call');
    $ok(($out->headers['Cache-Control']??'')==='private, no-store','denial-not-cacheable');
}
[$c,$s]=$make('Basic fixture','');$out=$c->apiInfo();$ok($out->status===403&&$out->data['state']==='unavailable'&&$out->data['code']==='PROJECT_ACCESS'&&$s->calls===['context'],'missing-file-proof-stops-before-work');
[$c,$s]=$make();$out=$c->apiInfo();$ok($out->status===200&&$out->data['account']==='ChatGPT'&&$out->data['projectCreationApiVersion']===1,'native-account-and-api-version');
$ok($out->data['matrix']===\OCA\NovaspaceCapsules\Service\ProjectCreation::MATRIX&&$out->data['folderModes']===['auto','custom'],'existing-matrix-and-folder-modes');
$ok($s->calls===['context']&&$out->data['readOnly']===true,'info-does-not-enumerate-or-create');
[$c,$s]=$make();$out=$c->apiFolders('/Existing');$ok($out->data['path']==='/Existing'&&$s->calls===['context',['folders','/Existing']],'folder-get-delegates-existing-service');
[$c,$s]=$make();$out=$c->apiStatus($id);$ok($out->data['state']==='not-found'&&$out->data['creationId']===$id&&$s->calls===['context',['status',$id]],'status-keeps-known-id-and-does-not-create');
[$c,$s]=$make();$out=$c->apiCreate($id,'Projekt','Beschreibung','/','343434','Neu','ChatGPT','auto');
$ok($out->status===200&&$out->data['verified']===true&&$out->data['account']==='ChatGPT','create-keeps-confirmed-native-result');
$ok($s->calls===['context',['create',[$id,'Projekt','Beschreibung','/','343434','Neu','ChatGPT','auto']]],'all-inputs-forwarded-once-no-second-generator');
[$c,$s]=$make();$out=$c->apiCreate($id,'Projekt','','/Existing','343434','Neu','ChatGPT');$ok($s->calls[1][1][7]==='custom','legacy-custom-default-preserved');
[$c,$s]=$make();$out=$c->apiCreate($id,'Projekt','','/','343434','Neu','Soul','auto');$ok($out->status===409&&$out->data['code']==='PROJECT_ACCOUNT_CHANGED','soul-association-is-not-ownership-delegation');
[$c,$s]=$make();$s->fail=true;$out=$c->apiCreate($id,'Projekt','','/','343434','Neu','ChatGPT','auto');
$ok($out->status===409&&$out->data['state']==='unconfirmed'&&$out->data['code']==='RUNTIME_ERROR','uncertain-write-is-explicit');
$ok(count($s->calls)===2&&!str_contains(json_encode($out->data),'credentials'),'failed-write-not-retried-or-exposed');
$reflection=new \ReflectionClass(\OCA\NovaspaceCapsules\Controller\CreationController::class);
$attribute=\OCP\AppFramework\Http\Attribute\NoCSRFRequired::class;
$ok($reflection->getMethod('create')->getAttributes($attribute)===[],'browser-create-retains-csrf');
foreach(['apiInfo','apiFolders','apiStatus','apiCreate']as$method){$ok(count($reflection->getMethod($method)->getAttributes($attribute))===1,'api-only-csrf-exception');}
$before=require __DIR__.'/../update-0.2.8/appinfo/routes.php';$after=require __DIR__.'/../update-0.2.12/appinfo/routes.php';
$ok(array_slice($after['routes'],4)===$before['routes'],'every-existing-route-preserved');
$ok(array_column(array_slice($after['routes'],0,4),'verb')===['GET','GET','GET','POST'],'only-create-is-write-route');
echo 'NovaSpace Connector-Projektanlage-Einstieg: '.$checks." Prüfungen bestanden.\n";
}
