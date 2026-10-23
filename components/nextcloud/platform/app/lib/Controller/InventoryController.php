<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Controller;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCA\NovaspacePlatform\Service\InventoryDelegation;
use OCA\NovaspacePlatform\Service\ConnectionStore;

final class InventoryController extends Controller {
	public function __construct(string $appName, IRequest $request, private InventoryDelegation $inventory, private IURLGenerator $urls) { parent::__construct($appName, $request); }
	private function view(?string $error = null, int $status = 200): TemplateResponse {
		$d = ['ownerUid' => '', 'connections' => [], 'actions' => [], 'error' => $error, 'forms' => []];
		try {
			$d = array_replace($d, $this->inventory->page());
			foreach ($d['connections'] as $c) {
				$d['forms'][$c['connectionId']] = ['url' => $this->urls->linkToRoute('novaspace_platform.inventory.grant', ['connectionId' => $c['connectionId']]), 'requestId' => ConnectionStore::id()];
			}
		} catch (\Throwable) { $d['error'] = 'Bitte die Gerätefreigaben in deiner eigenen Websitzung öffnen. Der Zugriff konnte nicht bestätigt werden.'; $status = 503; }
		return new TemplateResponse('novaspace_platform', 'inventory', $d, 'user', $status, ['Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer']);
	}
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse { return $this->view(); }
	#[NoAdminRequired]
	public function grant(string $connectionId, int $connectionRevision, int $grantRevision, string $mode, string $requestId) {
		try {
			foreach (array_keys($this->request->getParams()) as $k) {
				if (!in_array($k, ['connectionId', 'connectionRevision', 'grantRevision', 'mode', 'requestId', 'requesttoken', '_route'], true)) { throw new \RuntimeException(); }
			}
			$this->inventory->setGrant($connectionId, $connectionRevision, $grantRevision, $mode, $requestId);
			return new RedirectResponse($this->urls->linkToRoute('novaspace_platform.inventory.index'));
		} catch (\Throwable) { return $this->view('Die Änderung konnte nicht bestätigt werden. Bitte aktuellen Freigabestatus und Verlauf prüfen.', 409); }
	}
}
