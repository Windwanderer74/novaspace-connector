<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Controller;
use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCA\NovaspacePlatform\Service\InventoryDelegation;
use OCA\NovaspacePlatform\Service\PlatformDenied;

final class InventoryApiController extends OCSController {
	public function __construct(string $appName, IRequest $request, private InventoryDelegation $inventory) { parent::__construct($appName, $request); }
	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function execute(array $command): DataResponse {
		$h = ['Cache-Control' => 'no-store', 'Pragma' => 'no-cache', 'Referrer-Policy' => 'no-referrer'];
		foreach (array_keys($this->request->getParams()) as $k) {
			if (!in_array($k, ['command', 'format', '_route'], true)) { return new DataResponse(['error' => 'unsupported_parameter'], 400, $h); }
		}
		try {
			return new DataResponse($this->inventory->execute($this->request->getHeader('X-NovaSpace-Client'), $command), 200, $h);
		} catch (PlatformDenied $e) {
			$allowed = ['inventory_scope_required', 'inventory_grant_required', 'connection_unavailable', 'owner_conflict', 'version_conflict', 'request_conflict', 'reference_exists', 'item_not_found', 'inventory_source_changed', 'inventory_owner_unavailable', 'inventory_outcome_unconfirmed'];
			$code = in_array($e->getMessage(), $allowed, true) ? $e->getMessage() : 'inventory_access_unverified';
			$status = in_array($code, ['version_conflict', 'request_conflict', 'reference_exists'], true) ? 409 : ($code === 'inventory_outcome_unconfirmed' ? 503 : 403);
			return new DataResponse(['error' => $code], $status, $h);
		} catch (\Throwable) { return new DataResponse(['error' => 'inventory_outcome_unconfirmed'], 503, $h); }
	}
}
