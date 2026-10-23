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
use OCA\NovaspacePlatform\Service\ConnectionService;
use OCA\NovaspacePlatform\Service\ConnectionStore;

final class ConnectionsController extends Controller {
	public function __construct(string $appName, IRequest $request, private ConnectionService $connections, private IURLGenerator $urls) { parent::__construct($appName, $request); }
	private function view(array $data, int $status = 200): TemplateResponse {
		return new TemplateResponse('novaspace_platform', 'connections', $data + [
			'inventoryUrl' => $this->urls->linkToRoute('novaspace_platform.inventory.index'),
			'homeUrl' => $this->urls->linkToRoute('novaspace_platform.connections.index'),
			'approveUrl' => $this->urls->linkToRoute('novaspace_platform.connections.approve'),
			'revokeUrls' => [], 'accessUrls' => [], 'appCatalogue' => [], 'requestIds' => [], 'error' => null, 'preview' => null,
		], 'user', $status, ['Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer']);
	}
	private function allowed(array $keys): void {
		foreach (array_keys($this->request->getParams()) as $key) {
			if (!in_array($key, array_merge($keys, ['_route', 'requesttoken']), true)) { throw new \RuntimeException(); }
		}
	}
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function index(): TemplateResponse {
		try {
			$d = $this->connections->page(); $d['revokeUrls'] = []; $d['requestIds'] = [];
			foreach ($d['connections'] as $c) {
				$d['accessUrls'][$c['connectionId']] = $this->urls->linkToRoute('novaspace_platform.connections.saveAccess', ['connectionId' => $c['connectionId']]);
				$d['revokeUrls'][$c['connectionId']] = $this->urls->linkToRoute('novaspace_platform.connections.revoke', ['connectionId' => $c['connectionId']]);
				$d['requestIds'][$c['connectionId']] = ConnectionStore::id();
			}
			return $this->view($d);
		} catch (\Throwable) { return $this->view(['error' => 'Die Verbindungsliste konnte nicht bestätigt werden. Bitte in deiner eigenen Websitzung öffnen.'], 503); }
	}
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function new(string $ticket = ''): TemplateResponse {
		try { return $this->view(['preview' => $this->connections->preview($ticket)]); }
		catch (\Throwable) { return $this->view(['error' => 'Dieser Einrichtungslink ist nicht mehr gültig oder gehört bereits zu einer anderen Zuordnung. Bitte im Konnektor einen neuen Link abrufen.'], 400); }
	}
	#[NoAdminRequired]
	public function approve(string $ticket = '', string $label = '') {
		try {
			$this->allowed(['ticket', 'label']); $this->connections->approve($ticket, $label);
			return new RedirectResponse($this->urls->linkToRoute('novaspace_platform.connections.index'));
		} catch (\Throwable) { return $this->view(['error' => 'Die Bestätigung ist nicht gesichert. Bitte zuerst die Verbindungsliste prüfen; bei Bedarf denselben Einrichtungslink erneut bestätigen.'], 409); }
	}
	#[NoAdminRequired]
	public function revoke(string $connectionId, int $revision, string $requestId) {
		try {
			$this->allowed(['connectionId', 'revision', 'requestId']); $this->connections->revoke($connectionId, $revision, $requestId);
			return new RedirectResponse($this->urls->linkToRoute('novaspace_platform.connections.index'));
		} catch (\Throwable) { return $this->view(['error' => 'Der Widerruf ist nicht gesichert oder die Verbindung wurde inzwischen geändert. Bitte die aktuelle Verbindungsliste prüfen.'], 409); }
	}
	#[NoAdminRequired]
	public function saveAccess(string $connectionId, int $revision, string $requestId, string $enabled, array $apps) {
		try {
			$this->allowed(['connectionId', 'revision', 'requestId', 'enabled', 'apps']);
			$this->connections->saveAccess($connectionId, $revision, $requestId, $enabled, $apps);
			return new RedirectResponse($this->urls->linkToRoute('novaspace_platform.connections.index'));
		} catch (\Throwable) { return $this->view(['error' => 'Die App-Freigaben sind nicht bestätigt oder die Verbindung wurde inzwischen geändert. Bitte die aktuelle Verbindungsliste prüfen. Keine erneute Anmeldung erforderlich.'], 409); }
	}
}
