<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);

namespace NovaSpace\Platform;

use OCP\Authentication\Token\IProvider;
use OCP\Authentication\Token\IToken;
use OCP\ISession;
use OCP\IUserSession;

/** Internal evidence only: no logical owner, delegated authority or AI provider claim. */
final readonly class NativeAccessProof {
	public function __construct(
		public string $nativeUid,
		public int $nativeTokenId,
		public string $authentication,
	) {}
}

final class NativeAccessUnverified extends \RuntimeException {
	public function __construct() {
		// Do not chain provider exceptions: their arguments may contain credentials.
		parent::__construct('native_access_unverified');
	}
}

/**
 * Reads Nextcloud's already authenticated request; never performs a login.
 * The app_password / session-id contract is pinned to the checked NC 34 core.
 * A registry and native object ACL must still authorize any later operation.
 */
final class NativeAccessResolver {
	public function __construct(
		private IUserSession $users,
		private ISession $session,
		private IProvider $tokens,
	) {}

	public function resolve(): NativeAccessProof {
		try {
			$user = $this->users->getUser();
			if ($user === null || !$user->isEnabled()
				|| $this->users->getImpersonatingUserID() !== null) {
				throw new NativeAccessUnverified();
			}
			$uid = $user->getUID();
			if ($uid === '') {
				throw new NativeAccessUnverified();
			}
			$appPassword = $this->session->get('app_password');
			$isApp = $appPassword !== null;
			$credential = $isApp ? $appPassword : $this->session->getId();
			if (!is_string($credential) || $credential === '') {
				throw new NativeAccessUnverified();
			}
			$token = $this->tokens->getToken($credential);
			$expectedType = $isApp ? IToken::PERMANENT_TOKEN : IToken::TEMPORARY_TOKEN;
			if ($token->getUID() !== $uid || $token->getType() !== $expectedType
				|| $token->getId() <= 0) {
				throw new NativeAccessUnverified();
			}
			// Do not accept a changed core context during resolution; do not cache proof.
			$current = $this->users->getUser();
			$currentAppPassword = $this->session->get('app_password');
			$currentCredential = $currentAppPassword !== null
				? $currentAppPassword : $this->session->getId();
			if ($current === null || !$current->isEnabled() || $current->getUID() !== $uid
				|| $this->users->getImpersonatingUserID() !== null
				|| ($currentAppPassword !== null) !== $isApp
				|| $currentCredential !== $credential) {
				throw new NativeAccessUnverified();
			}
			unset($credential, $currentCredential, $appPassword, $currentAppPassword);
			return new NativeAccessProof($uid, $token->getId(), $isApp ? 'app_password' : 'web_session');
		} catch (\Throwable) {
			throw new NativeAccessUnverified();
		}
	}
}
