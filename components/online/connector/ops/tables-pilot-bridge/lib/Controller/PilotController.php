<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaforgeTables\Controller;

use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\App\IAppManager;
use OCA\NovaforgeTables\Service\PilotWriteService;

final class PilotController extends OCSController {
    public function __construct(string $appName, IRequest $request,
        private IDBConnection $db, private IAppManager $apps,
        private IConfig $config, private IUserSession $users) {
        parent::__construct($appName,$request);
    }
    private function service(): PilotWriteService {
        return new PilotWriteService($this->db,$this->apps,$this->config,$this->users);
    }
    private function response(array $data, int $status = 200): DataResponse {
        return new DataResponse($data,$status,['Cache-Control'=>'no-store']);
    }
    private function parameters(array $allowed): void {
        foreach (array_keys($this->request->getParams()) as $key) {
            if (!in_array($key,array_merge($allowed,['format','_route']),true)) throw new \RuntimeException('UNKNOWN_PARAMETER');
        }
    }
    private function failure(\Throwable $e): DataResponse {
        $code = $e instanceof \RuntimeException ? $e->getMessage() : 'PILOT_RUNTIME_FAILURE';
        $known = ['AUTH_REQUIRED','PILOT_ACCOUNT_DENIED','PILOT_SCOPE_DENIED','PILOT_WRITE_DISABLED',
            'READ_DENIED','UPDATE_DENIED','INVALID_PATCH','INVALID_EXPECTED_VERSION',
            'VERSION_CONFLICT','UNKNOWN_PARAMETER','JSON_REQUIRED','TABLES_SOURCE_CHANGED',
            'NOT_OWN_PILOT','PILOT_STRUCTURE_CHANGED','UNSUPPORTED_PILOT_COLUMN',
            'ROW_TABLE_MISMATCH','AMBIGUOUS_CELL_STORAGE'];
        if (!in_array($code,$known,true)) $code = 'PILOT_RUNTIME_FAILURE';
        for ($cause=$e,$depth=0;$cause && $depth<8;$cause=$cause->getPrevious(),$depth++) {
            if (preg_match('/lock wait timeout|1205/i',$cause->getMessage())) $code = 'LOCK_TIMEOUT';
        }
        $status = match ($code) {
            'AUTH_REQUIRED'=>401,
            'PILOT_ACCOUNT_DENIED','PILOT_SCOPE_DENIED','READ_DENIED','UPDATE_DENIED','PILOT_WRITE_DISABLED'=>403,
            'INVALID_PATCH','INVALID_EXPECTED_VERSION','UNKNOWN_PARAMETER','JSON_REQUIRED'=>400,
            'VERSION_CONFLICT'=>409,
            'LOCK_TIMEOUT'=>423,
            default=>503,
        };
        return $this->response(['error'=>$code,'pilotOnly'=>true,'committed'=>false],$status);
    }
    // Preserve Nextcloud's authentication, two-factor and OCS CSRF middleware.
    // API clients must send OCS-APIRequest: true. No PublicPage/CORS/NoCSRFRequired.
    #[NoAdminRequired]
    public function version(int $tableId, int $rowId): DataResponse {
        try {
            $this->parameters(['tableId','rowId']);
            return $this->response($this->service()->read($tableId,$rowId));
        } catch (\Throwable $e) { return $this->failure($e); }
    }
    #[NoAdminRequired]
    public function update(int $tableId, int $rowId, string $expectedVersion, array $data): DataResponse {
        try {
            $this->parameters(['tableId','rowId','expectedVersion','data']);
            if (!preg_match('~^application/json(?:\s*;|$)~i',$this->request->getHeader('Content-Type'))) throw new \RuntimeException('JSON_REQUIRED');
            $result = $this->service()->update($tableId,$rowId,$expectedVersion,$data);
            return $this->response($result,$result['committed'] === null ? 503 : 200);
        } catch (\Throwable $e) { return $this->failure($e); }
    }
}
