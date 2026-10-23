<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaforgeTables\Controller;
use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCA\NovaforgeTables\Service\GeneralWriteService;
final class GeneralController extends OCSController {
    public function __construct(string $appName,\OCP\IRequest $request,private \OCP\IDBConnection $db,private \OCP\App\IAppManager $apps,private \OCP\IConfig $config,private \OCP\IUserSession $users){parent::__construct($appName,$request);}
    private function invoke(array $allowed,callable $fn,bool $write=false): DataResponse {
        try{
            foreach(array_keys($this->request->getParams()) as $k)if(!in_array($k,array_merge($allowed,['format','_route']),true))throw new \RuntimeException('UNKNOWN_PARAMETER');
            if($write && !preg_match('~^application/json(?:\s*;|$)~i',$this->request->getHeader('Content-Type')))throw new \RuntimeException('JSON_REQUIRED');
            $s=new GeneralWriteService($this->db,$this->apps,$this->config,$this->users);$data=$fn($s);$status=array_key_exists('committed',$data) && $data['committed']===null?503:200;
        }catch(\Throwable $e){
            $code=$e instanceof \RuntimeException?$e->getMessage():'NATIVE_VALIDATION_OR_RUNTIME_FAILURE';
            if(!preg_match('/^[A-Z0-9_]+$/D',$code))$code='NATIVE_VALIDATION_OR_RUNTIME_FAILURE';
            $status=match($code){'AUTH_REQUIRED'=>401,'ACCOUNT_DENIED','PROTECTED_TABLE','DIRECT_TABLE_ACCESS_REQUIRED','READ_DENIED','UPDATE_DENIED','MANAGE_DENIED','WRITE_DISABLED'=>403,'VERSION_CONFLICT','REQUEST_ID_CONFLICT','DUPLICATE_COLUMN_TITLE','EXISTING_SOUL_SHARE_REQUIRES_REVIEW'=>409,'UNKNOWN_PARAMETER','JSON_REQUIRED','INVALID_REQUEST_ID','INVALID_COLUMN','INVALID_PATCH','INVALID_EXPECTED_VERSION','INVALID_TEXT','INVALID_ACTION','INVALID_PAYLOAD','INVALID_TABLE_ID','INVALID_ROW_ID'=>400,default=>503};
            for($cause=$e,$i=0;$cause && $i<8;$cause=$cause->getPrevious(),$i++)if(preg_match('/lock wait timeout|deadlock|1205|1213/i',$cause->getMessage())){$code='LOCK_TIMEOUT';$status=423;}
            $data=['error'=>$code,'generalTables'=>true,'committed'=>false];
        }
        return new DataResponse($data,$status,['Cache-Control'=>'no-store']);
    }
    #[NoAdminRequired]
    public function status(): DataResponse{return $this->invoke([],fn($s)=>$s->status());}
    #[NoAdminRequired]
    public function structure(int $tableId): DataResponse{return $this->invoke(['tableId'],fn($s)=>$s->read($tableId));}
    #[NoAdminRequired]
    public function row(int $tableId,int $rowId): DataResponse{return $this->invoke(['tableId','rowId'],fn($s)=>$s->read($tableId,$rowId));}
    #[NoAdminRequired]
    public function operation(string $requestId): DataResponse{return $this->invoke(['requestId'],fn($s)=>$s->operation($requestId));}
    #[NoAdminRequired]
    public function write(string $action,string $requestId,array $payload): DataResponse{return $this->invoke(['action','requestId','payload'],fn($s)=>$s->write($action,$requestId,$payload),true);}
}
