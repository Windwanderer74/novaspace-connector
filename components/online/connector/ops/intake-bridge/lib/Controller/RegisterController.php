<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaforgeTables\Controller;
use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCA\NovaforgeTables\Service\RegisterWriteService;
final class RegisterController extends OCSController {
    public function __construct(string $appName, \OCP\IRequest $request,
        private \OCP\IDBConnection $db, private \OCP\App\IAppManager $apps,
        private \OCP\IConfig $config, private \OCP\IUserSession $users) { parent::__construct($appName,$request); }
    private function service(): RegisterWriteService { return new RegisterWriteService($this->db,$this->apps,$this->config,$this->users); }
    private function invoke(array $allowed, callable $fn, bool $write=false): DataResponse {
        try {
            foreach(array_keys($this->request->getParams()) as $k) if(!in_array($k,array_merge($allowed,['format','_route']),true))throw new \RuntimeException('UNKNOWN_PARAMETER');
            if($write && !preg_match('~^application/json(?:\s*;|$)~i',$this->request->getHeader('Content-Type')))throw new \RuntimeException('JSON_REQUIRED');
            $data=$fn($this->service()); $status=(array_key_exists('committed',$data) && $data['committed']===null)?503:200;
        } catch(\Throwable $e) {
            $code=$e instanceof \RuntimeException?$e->getMessage():'REGISTER_RUNTIME_FAILURE';
            $status=match($code) {
                'AUTH_REQUIRED'=>401,
                'REGISTER_ACCOUNT_DENIED','REGISTER_SCOPE_DENIED','REGISTER_WRITE_DISABLED','READ_DENIED','UPDATE_DENIED'=>403,
                'INVALID_RECORD','INVALID_PATCH','INVALID_DOCUMENT_ID','INVALID_EXPECTED_VERSION','IMMUTABLE_SOURCE_FIELD','UNKNOWN_PARAMETER','JSON_REQUIRED'=>400,
                'VERSION_CONFLICT','DOCUMENT_ID_CONFLICT','DUPLICATE_DOCUMENT_ID'=>409,
                default=>503,
            };
            if($status===503 && !in_array($code,['REGISTER_NOT_INSTALLED','REGISTER_STRUCTURE_CHANGED','REGISTER_LIMIT','TABLES_SOURCE_CHANGED','NOT_OWN_REGISTER','ROW_TABLE_MISMATCH','AMBIGUOUS_CELL_STORAGE'],true))$code='REGISTER_RUNTIME_FAILURE';
            for($cause=$e,$i=0;$cause && $i<8;$cause=$cause->getPrevious(),$i++)if(preg_match('/lock wait timeout|1205/i',$cause->getMessage())){$code='LOCK_TIMEOUT';$status=423;}
            $data=['error'=>$code,'registerOnly'=>true,'committed'=>false];
        }
        return new DataResponse($data,$status,['Cache-Control'=>'no-store']);
    }
    #[NoAdminRequired]
    public function status(): DataResponse { return $this->invoke([],fn($s)=>$s->status()); }
    #[NoAdminRequired]
    public function find(string $documentId): DataResponse { return $this->invoke(['documentId'],fn($s)=>$s->find($documentId)); }
    #[NoAdminRequired]
    public function version(int $rowId): DataResponse { return $this->invoke(['rowId'],fn($s)=>$s->read($s->status()['tableId'],$rowId)); }
    #[NoAdminRequired]
    public function create(string $documentId,array $values): DataResponse { return $this->invoke(['documentId','values'],fn($s)=>$s->create($documentId,$values),true); }
    #[NoAdminRequired]
    public function update(int $rowId,string $expectedVersion,array $values): DataResponse {
        return $this->invoke(['rowId','expectedVersion','values'],function($s)use($rowId,$expectedVersion,$values){
            $schema=$s->status(); $data=[];
            foreach($values as $field=>$value){if(!isset($schema['columns'][$field]))throw new \RuntimeException('INVALID_PATCH');$data[]=['columnId'=>$schema['columns'][$field],'value'=>$value];}
            return $s->update($schema['tableId'],$rowId,$expectedVersion,$data);
        },true);
    }
}
