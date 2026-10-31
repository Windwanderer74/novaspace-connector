<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Controller;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\RedirectResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCA\NovaspacePlatform\Service\ConnectionService;
use OCA\NovaspacePlatform\Service\ConnectionStore;
use OCA\NovaspacePlatform\Service\PlatformDenied;

final class ConnectionsController extends Controller {
	public function __construct(string $appName, IRequest $request, private ConnectionService $connections, private IURLGenerator $urls) { parent::__construct($appName, $request); }
	private function view(array $data, int $status = 200): TemplateResponse {
		return new TemplateResponse('novaspace_platform', 'connections', $data + [
			'inventoryUrl' => $this->urls->linkToRoute('novaspace_platform.inventory.index'),
			'homeUrl' => $this->urls->linkToRoute('novaspace_platform.connections.index'),
			'approveUrl' => $this->urls->linkToRoute('novaspace_platform.connections.approve'),
			'revokeUrls' => [], 'accessUrls' => [], 'accessAsyncUrls' => [], 'appCatalogue' => [], 'requestIds' => [], 'error' => null, 'preview' => null,
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
				$d['accessAsyncUrls'][$c['connectionId']] = $this->urls->linkToRoute('novaspace_platform.connections.saveAccessAsync', ['connectionId' => $c['connectionId']]);
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
	public function saveAccess(string $connectionId, int $revision, string $requestId, string $enabled, array $apps, ?string $catalogue = null, array $allowedTools = [], array $areas = []) {
		try {
			$this->allowed(['connectionId', 'revision', 'requestId', 'enabled', 'apps', 'catalogue', 'allowedTools', 'areas']);
			$this->connections->saveAccess($connectionId, $revision, $requestId, $enabled, $apps, $catalogue, $allowedTools, $areas);
			return new RedirectResponse($this->urls->linkToRoute('novaspace_platform.connections.index'));
		} catch (\Throwable) { return $this->view(['error' => 'Die App-Freigaben sind nicht bestätigt oder die Verbindung wurde inzwischen geändert. Bitte die aktuelle Verbindungsliste prüfen. Keine erneute Anmeldung erforderlich.'], 409); }
	}
	#[NoAdminRequired]
	public function saveAccessAsync(string $connectionId, int $revision, string $requestId, string $enabled, array $apps, ?string $catalogue = null, array $allowedTools = [], array $areas = []): DataResponse {
		$headers = ['Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer'];
		try {
			$this->allowed(['connectionId', 'revision', 'requestId', 'enabled', 'apps', 'catalogue', 'allowedTools', 'areas']);
			if ($catalogue === null) throw new PlatformDenied('function_catalogue_missing');
			$r = $this->connections->saveAccess($connectionId, $revision, $requestId, $enabled, $apps, $catalogue, $allowedTools, $areas);
			return new DataResponse(['committed' => true, 'connectionId' => $connectionId, 'requestId' => $requestId,
				'revision' => $r['revision'], 'nextRequestId' => ConnectionStore::id(), 'accessPolicy' => $r['accessPolicy']], 200, $headers);
		} catch (\Throwable $e) {
			$code = $e instanceof PlatformDenied ? $e->getMessage() : 'registry_outcome_unconfirmed';
			$conflict = in_array($code, ['version_conflict','request_conflict','function_catalogue_changed'], true);
			$denied = in_array($code, ['web_session_required','connection_not_found'], true);
			return new DataResponse(['committed' => false, 'outcome' => $conflict ? 'conflict' : ($denied ? 'denied' : 'unconfirmed'),
				'message' => $conflict ? 'Die Verbindung wurde inzwischen geändert. Seite neu laden und Auswahl prüfen.'
					: ($denied ? 'In deiner eigenen Websitzung öffnen und die Verbindung prüfen.' : 'Speichern nicht bestätigt. Erneut versuchen; die aktuelle Auswahl bleibt sichtbar.')], $conflict ? 409 : ($denied ? 403 : 503), $headers);
		}
	}
}
