<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaforgeTables\Controller;
use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\App\IAppManager;

final class TablesController extends OCSController {
    public function __construct(string $appName, IRequest $request,
        private IUserSession $users, private IAppManager $apps) { parent::__construct($appName, $request); }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function list(): DataResponse {
        $user = $this->users->getUser();
        if (!$user) return new DataResponse(['error'=>'AUTH_REQUIRED'], 401);
        if (!$this->apps->isEnabledForUser('tables', $user) || $this->apps->getAppVersion('tables') !== '2.3.1') {
            return new DataResponse(['error'=>'TABLES_VERSION_UNSUPPORTED'], 503);
        }
        try {
            $container = (new \OCA\Tables\AppInfo\Application())->getContainer();
            $service = $container->get(\OCA\Tables\Service\TableService::class);
            // Fourth argument explicitly disables automatic tutorial creation.
            $tables = $service->findAll($user->getUID(), false, false, false);
            if (count($tables) > 1000) return new DataResponse(['error'=>'TABLES_LIST_LIMIT'], 413);
            return new DataResponse(['account'=>$user->getUID(), 'bridgeVersion'=>'0.1.0',
                'protocol'=>1, 'tutorialCreation'=>false, 'tables'=>$service->formatTables($tables)]);
        } catch (\Throwable $e) {
            return new DataResponse(['error'=>'TABLES_READ_FAILED'], 503);
        }
    }
}
