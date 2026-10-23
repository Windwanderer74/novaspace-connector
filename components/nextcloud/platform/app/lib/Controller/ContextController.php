<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Controller;

use NovaSpace\Platform\NativeAccessResolver;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\OCSController;
use OCP\Authentication\Token\IProvider;
use OCP\IRequest;
use OCP\ISession;
use OCP\IUserSession;

require_once __DIR__ . '/../Native/NativeAccessResolver.php';

final class ContextController extends OCSController {
	public function __construct(
		string $appName,
		IRequest $request,
		private IUserSession $users,
		private ISession $session,
		private IProvider $tokens,
	) {
		parent::__construct($appName, $request);
	}

	#[NoAdminRequired]
	#[NoCSRFRequired]
	public function show(): DataResponse {
		$headers = ['Cache-Control' => 'no-store', 'Pragma' => 'no-cache'];
		foreach (array_keys($this->request->getParams()) as $key) {
			if (!in_array($key, ['format', '_route'], true)) {
				return new DataResponse(['error' => 'unsupported_parameter'], 400, $headers);
			}
		}
		try {
			$proof = (new NativeAccessResolver($this->users, $this->session, $this->tokens))->resolve();
			return new DataResponse([
				'appVersion' => '0.4.0',
				'nativeUid' => $proof->nativeUid,
				'authentication' => $proof->authentication,
				'nativeTokenVerified' => true,
				'connectionRegistered' => false,
				'connectionId' => null,
				'actingForUser' => null,
				'writesEnabled' => false,
				'journalActive' => false,
			], 200, $headers);
		} catch (\Throwable) {
			return new DataResponse(['error' => 'native_access_unverified'], 403, $headers);
		}
	}
}
