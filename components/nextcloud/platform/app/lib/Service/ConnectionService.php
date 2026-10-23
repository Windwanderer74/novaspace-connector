<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;
use NovaSpace\Platform\NativeAccessResolver;
use OCP\IUserSession;
use OCP\ISession;
use OCP\Authentication\Token\IProvider;
use OCP\Security\ICrypto;
use OCP\IURLGenerator;
require_once __DIR__ . '/../Native/NativeAccessResolver.php';
require_once __DIR__ . '/GatewayVerifier.php';

final class ConnectionService {
	public function __construct(private IUserSession $users, private ISession $session, private IProvider $tokens,
		private ICrypto $crypto, private IURLGenerator $urls, private ConnectionStore $store, private GatewayVerifier $gateway) {}
	private function proof() { return (new NativeAccessResolver($this->users, $this->session, $this->tokens))->resolve(); }
	private function web(): string {
		$p = $this->proof(); if ($p->authentication !== 'web_session') { throw new PlatformDenied('web_session_required'); } return $p->nativeUid;
	}
	private function client(string $assertion, string $purpose): array {
		$p = $this->proof(); if ($p->authentication !== 'app_password') { throw new PlatformDenied('app_password_required'); }
		$c = $this->gateway->verify($assertion, $purpose);
		return ['issuer' => $c['iss'], 'subjectHash' => $c['sub'], 'clientHash' => $c['client'],
			'nativeUid' => $p->nativeUid, 'nativeTokenId' => $p->nativeTokenId];
	}
	public function status(string $assertion): array {
		$client = $this->client($assertion, 'status');
		return ['registryVersion' => '0.2.0', 'nativeUid' => $client['nativeUid'],
			'connection' => $this->store->status($client), 'ownerDelegationEnabled' => false, 'journalScope' => 'connection_configuration'];
	}
	public function setup(string $assertion): array {
		$client = $this->client($assertion, 'setup');
		$data = ['v' => 1, 'purpose' => 'connection_approval', 'issuedAt' => time(), 'expiresAt' => time() + 600,
			'nonce' => ConnectionStore::id(), 'client' => $client];
		$ticket = $this->crypto->encrypt("novaspace.connection.setup.v1\0" . json_encode($data, JSON_THROW_ON_ERROR));
		return ['registryVersion' => '0.2.0', 'expiresIn' => 600,
			'clientDisplay' => substr($client['clientHash'], 0, 12),
			'setupUrl' => $this->urls->linkToRouteAbsolute('novaspace_platform.connections.new', ['ticket' => $ticket]),
			'requiresWebApproval' => true, 'registeredByThisCall' => false];
	}
	private function ticket(string $ticket): array {
		try {
			if ($ticket === '' || strlen($ticket) > 12000) { throw new \RuntimeException(); }
			$raw = $this->crypto->decrypt($ticket);
			$prefix = "novaspace.connection.setup.v1\0";
			if (!str_starts_with($raw, $prefix)) { throw new \RuntimeException(); }
			$d = json_decode(substr($raw, strlen($prefix)), true, 32, JSON_THROW_ON_ERROR);
			if (!is_array($d) || ($d['v'] ?? null) !== 1 || ($d['purpose'] ?? null) !== 'connection_approval'
				|| !is_int($d['issuedAt'] ?? null) || !is_int($d['expiresAt'] ?? null)
				|| $d['issuedAt'] > time() + 5 || $d['expiresAt'] < time() || $d['expiresAt'] - $d['issuedAt'] !== 600
				|| !is_string($d['nonce'] ?? null) || !GatewayVerifier::uuid($d['nonce']) || !is_array($d['client'] ?? null)) { throw new \RuntimeException(); }
			$c = $d['client'];
			if (($c['issuer'] ?? null) !== $this->gateway->trust()['issuer']
				|| !is_string($c['subjectHash'] ?? null) || !preg_match('/^[0-9a-f]{64}$/D', $c['subjectHash'])
				|| !is_string($c['clientHash'] ?? null) || !preg_match('/^[0-9a-f]{64}$/D', $c['clientHash'])
				|| !is_string($c['nativeUid'] ?? null) || $c['nativeUid'] === '' || mb_strlen($c['nativeUid']) > 255
				|| !is_int($c['nativeTokenId'] ?? null) || $c['nativeTokenId'] < 1) { throw new \RuntimeException(); }
			return $d;
		} catch (\Throwable) { throw new PlatformDenied('setup_link_invalid_or_expired'); }
	}
	public function preview(string $ticket): array {
		$owner = $this->web(); $d = $this->ticket($ticket); $state = $this->store->status($d['client']);
		if ($state['registered'] && $state['connection']['ownerUid'] !== $owner) { throw new PlatformDenied('client_belongs_to_another_user'); }
		return ['ownerUid' => $owner, 'nativeUid' => $d['client']['nativeUid'], 'clientDisplay' => substr($d['client']['clientHash'], 0, 12),
			'label' => $this->gateway->trust()['label'], 'ticket' => $ticket, 'scopes' => ['platform:read']];
	}
	public function approve(string $ticket, string $label): array {
		$owner = $this->web(); $d = $this->ticket($ticket);
		return $this->store->approve($owner, $d['client'], $d['nonce'], trim($label));
	}
	public function revoke(string $id, int $revision, string $requestId): array {
		return $this->store->revoke($this->web(), $id, $revision, $requestId);
	}
	public function saveAccess(string $id, int $revision, string $requestId, string $enabled, array $apps): array {
		if (!in_array($enabled, ['0', '1'], true)) { throw new PlatformDenied('permission_main_invalid'); }
		return $this->store->saveAccess($this->web(), $id, $revision, $requestId, $enabled === '1', $apps);
	}
	public function page(): array {
		$owner = $this->web();
		return ['ownerUid' => $owner, 'connections' => $this->store->owned($owner), 'events' => $this->store->history($owner), 'appCatalogue' => ConnectionPolicy::APPS];
	}
}
