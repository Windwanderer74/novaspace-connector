<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Controller;
use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCA\NovaspacePlatform\Service\ConnectionService;

final class RegistryController extends OCSController {
	public function __construct(string $appName, IRequest $request, private ConnectionService $connections) { parent::__construct($appName, $request); }
	private function invoke(string $method): DataResponse {
		$headers = ['Cache-Control' => 'no-store', 'Pragma' => 'no-cache', 'Referrer-Policy' => 'no-referrer'];
		foreach (array_keys($this->request->getParams()) as $key) {
			if (!in_array($key, ['format', '_route'], true)) { return new DataResponse(['error' => 'unsupported_parameter'], 400, $headers); }
		}
		try { return new DataResponse($this->connections->$method($this->request->getHeader('X-NovaSpace-Client')), 200, $headers); }
		catch (\Throwable) { return new DataResponse(['error' => 'registry_access_unverified'], 503, $headers); }
	}
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function status(): DataResponse { return $this->invoke('status'); }
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function setup(): DataResponse { return $this->invoke('setup'); }
}
