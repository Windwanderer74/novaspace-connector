<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;
use OCP\IDBConnection;
use OCP\IConfig;

require_once __DIR__ . '/GatewayVerifier.php';
require_once __DIR__ . '/ConnectionPolicy.php';

final class ConnectionStore {
	private string $connections;
	private string $events;
	private string $access;
	public function __construct(private IDBConnection $db, IConfig $config) {
		$p = $config->getSystemValue('dbtableprefix', 'oc_');
		if (!is_string($p) || !preg_match('/^[A-Za-z0-9_]{0,64}$/D', $p)) { throw new PlatformDenied('configuration_invalid'); }
		$this->connections = $p . 'ns_pf_connections'; $this->events = $p . 'ns_pf_events';
		$this->access = $p . 'ns_pf_access';
	}
	private function one(string $sql, array $params): ?array {
		$r = $this->db->executeQuery($sql, $params);
		try { $row = $r->fetchAssociative(); return $row === false ? null : $row; }
		finally { $r->closeCursor(); }
	}
	private function all(string $sql, array $params): array {
		$r = $this->db->executeQuery($sql, $params);
		try { return $r->fetchAllAssociative(); } finally { $r->closeCursor(); }
	}
	public static function id(): string {
		$b = random_bytes(16); $b[6] = chr((ord($b[6]) & 15) | 64); $b[8] = chr((ord($b[8]) & 63) | 128);
		$h = bin2hex($b); return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
	}
	public static function binding(array $client): string {
		// Identity is stable across native token rotation; credential binding is checked separately.
		return hash('sha256', json_encode([$client['issuer'], $client['subjectHash'], $client['clientHash']], JSON_THROW_ON_ERROR));
	}
	public static function summary(array $r): array {
		return ['connectionId' => $r['conn_id'], 'ownerUid' => $r['owner_uid'], 'nativeUid' => $r['native_uid'],
			'label' => $r['label'], 'channel' => $r['channel'], 'revision' => (int)$r['revision'],
			'createdAt' => (int)$r['created_at'], 'updatedAt' => (int)$r['updated_at'],
			'revokedAt' => $r['revoked_at'] === null ? null : (int)$r['revoked_at'], 'scopes' => ['platform:read']];
	}
	public function status(array $client): array {
		$r = $this->one('SELECT * FROM ' . $this->connections . ' WHERE binding_hash = ?', [self::binding($client)]);
		if ($r === null) { return ['registered' => false, 'active' => false, 'reason' => 'not_registered']; }
		$reason = $r['revoked_at'] !== null ? 'revoked' : (($r['native_uid'] !== $client['nativeUid']
			|| (int)$r['token_id'] !== $client['nativeTokenId']) ? 'credential_changed' : 'active');
		return ['registered' => true, 'active' => $reason === 'active', 'reason' => $reason, 'connection' => self::summary($r), 'accessPolicy' => $this->policy($r['conn_id'])];
	}
	public function policy(string $id): array {
		$r = $this->one('SELECT enabled, apps_json FROM ' . $this->access . ' WHERE conn_id = ?', [$id]);
		if ($r === null) { return ConnectionPolicy::defaults(); }
		if (!in_array((string)$r['enabled'], ['0', '1'], true)) { throw new PlatformDenied('permission_state_unverified'); }
		return ['version' => 1, 'configured' => true, 'enabled' => (int)$r['enabled'] === 1,
			'apps' => ConnectionPolicy::modes(json_decode($r['apps_json'], true, 16, JSON_THROW_ON_ERROR))];
	}
	public function owned(string $owner): array {
		return array_map(fn($r) => self::summary($r) + ['accessPolicy' => $this->policy($r['conn_id'])], $this->all('SELECT * FROM ' . $this->connections . ' WHERE owner_key = ? ORDER BY created_at DESC, conn_id', [hash('sha256', $owner)]));
	}
	public function history(string $owner, int $limit = 50): array {
		$limit = max(1, min(100, $limit));
		$rows = $this->all('SELECT event_id, conn_id, actor_uid, channel, verb, fields_json, occurred_at FROM '
			. $this->events . ' WHERE owner_key = ? ORDER BY occurred_at DESC, event_id DESC LIMIT ' . $limit, [hash('sha256', $owner)]);
		return array_map(fn($r) => ['eventId' => $r['event_id'], 'connectionId' => $r['conn_id'], 'actorUid' => $r['actor_uid'],
			'channel' => $r['channel'], 'action' => $r['verb'], 'changedFields' => json_decode($r['fields_json'], true, 16, JSON_THROW_ON_ERROR),
			'occurredAt' => (int)$r['occurred_at']], $rows);
	}
	private function event(string $key): ?array {
		return $this->one('SELECT * FROM ' . $this->events . ' WHERE event_key = ?', [$key]);
	}
	private function eventInsert(string $key, string $requestHash, string $conn, string $owner, string $verb, array $fields): void {
		$this->db->executeStatement('INSERT INTO ' . $this->events
			. ' (event_id,event_key,request_hash,conn_id,owner_uid,owner_key,actor_uid,channel,verb,fields_json,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
			[self::id(), $key, $requestHash, $conn, $owner, hash('sha256', $owner), $owner, 'web', $verb, json_encode($fields, JSON_THROW_ON_ERROR), time()]);
	}
	private function connection(string $id, string $owner): array {
		$r = $this->one('SELECT * FROM ' . $this->connections . ' WHERE conn_id = ? AND owner_key = ?', [$id, hash('sha256', $owner)]);
		if ($r === null) { throw new PlatformDenied('connection_not_found'); } return $r;
	}
	private function transaction(callable $work): array {
		if ($this->db->inTransaction()) { throw new PlatformDenied('nested_transaction_unsupported'); }
		try {
			$this->db->beginTransaction(); $result = $work(); $this->db->commit(); return $result;
		} catch (\Throwable $e) {
			try { if ($this->db->inTransaction()) { $this->db->rollBack(); } } catch (\Throwable) {}
			if ($e instanceof PlatformDenied) { throw $e; }
			throw new PlatformDenied('registry_outcome_unconfirmed');
		}
	}
	public function approve(string $owner, array $client, string $nonce, string $label): array {
		if (!GatewayVerifier::uuid($nonce) || $owner === '' || mb_strlen($owner) > 255
			|| !preg_match('/^[^\x00-\x1f\x7f]{1,80}$/uD', $label)) { throw new PlatformDenied('invalid_approval'); }
		$key = hash('sha256', 'approve:' . $nonce);
		$requestHash = hash('sha256', json_encode([$owner, $client, $label], JSON_THROW_ON_ERROR));
		$result = $this->transaction(function () use ($owner, $client, $key, $label, $requestHash) {
			$event = $this->event($key);
			if ($event !== null) {
				if ($event['owner_uid'] !== $owner) { throw new PlatformDenied('approval_already_used'); }
				if ($event['request_hash'] !== $requestHash) { throw new PlatformDenied('request_conflict'); }
				return ['connectionId' => $event['conn_id'], 'replayed' => true];
			}
			$binding = self::binding($client);
			$r = $this->one('SELECT * FROM ' . $this->connections . ' WHERE binding_hash = ?', [$binding]);
			$now = time(); $verb = 'connection.created'; $fields = ['owner', 'credential', 'label'];
			if ($r === null) {
				$id = self::id();
				$this->db->executeStatement('INSERT INTO ' . $this->connections
					. ' (conn_id,binding_hash,owner_uid,owner_key,native_uid,token_id,issuer,subject_hash,client_hash,label,channel,revision,created_at,updated_at,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)',
					[$id, $binding, $owner, hash('sha256', $owner), $client['nativeUid'], $client['nativeTokenId'], $client['issuer'], $client['subjectHash'], $client['clientHash'], $label, 'cloud_connector', 1, $now, $now]);
			} else {
				if ($r['owner_uid'] !== $owner) { throw new PlatformDenied('client_belongs_to_another_user'); }
				$id = $r['conn_id']; $verb = 'connection.confirmed'; $fields = [];
				$reauthorize = $r['revoked_at'] !== null || $r['native_uid'] !== $client['nativeUid'] || (int)$r['token_id'] !== $client['nativeTokenId'];
				if ($reauthorize || $r['label'] !== $label) {
					$count = $this->db->executeStatement('UPDATE ' . $this->connections
						. ' SET native_uid=?,token_id=?,label=?,revision=revision+1,updated_at=?,revoked_at=NULL WHERE conn_id=? AND owner_uid=? AND revision=?',
						[$client['nativeUid'], $client['nativeTokenId'], $label, $now, $id, $owner, (int)$r['revision']]);
					if ($count !== 1) { throw new PlatformDenied('version_conflict'); }
					$verb = $reauthorize ? 'connection.reauthorized' : 'connection.renamed';
					$fields = $reauthorize ? ['credential', 'label', 'revocation'] : ['label'];
				}
			}
			$this->eventInsert($key, $requestHash, $id, $owner, $verb, $fields);
			return ['connectionId' => $id, 'replayed' => false];
		});
		try {
			$event = $this->event($key); $row = $this->connection($result['connectionId'], $owner);
			if ($event === null || $event['owner_uid'] !== $owner || $event['conn_id'] !== $row['conn_id']) { throw new \RuntimeException(); }
			return ['committed' => true, 'replayed' => $result['replayed'], 'connection' => self::summary($row)];
		} catch (\Throwable) { throw new PlatformDenied('registry_outcome_unconfirmed'); }
	}
	public function revoke(string $owner, string $id, int $revision, string $requestId): array {
		if (!GatewayVerifier::uuid($id) || !GatewayVerifier::uuid($requestId) || $revision < 1) { throw new PlatformDenied('invalid_revocation'); }
		$key = hash('sha256', 'revoke:' . $requestId);
		$requestHash = hash('sha256', json_encode([$owner, $id, $revision], JSON_THROW_ON_ERROR));
		$this->transaction(function () use ($owner, $id, $revision, $key, $requestHash) {
			$event = $this->event($key);
			if ($event !== null) {
				if ($event['owner_uid'] !== $owner || $event['conn_id'] !== $id || $event['request_hash'] !== $requestHash) { throw new PlatformDenied('request_conflict'); } return [];
			}
			$r = $this->connection($id, $owner);
			if ((int)$r['revision'] !== $revision) { throw new PlatformDenied('version_conflict'); }
			if ($r['revoked_at'] === null) {
				$now = time();
				$count = $this->db->executeStatement('UPDATE ' . $this->connections . ' SET revoked_at=?,updated_at=?,revision=revision+1 WHERE conn_id=? AND owner_uid=? AND revision=?', [$now, $now, $id, $owner, $revision]);
				if ($count !== 1) { throw new PlatformDenied('version_conflict'); }
			}
			$this->eventInsert($key, $requestHash, $id, $owner, 'connection.revoked', ['revocation']); return [];
		});
		try {
			$r = $this->connection($id, $owner);
			if ($this->event($key) === null || $r['revoked_at'] === null) { throw new \RuntimeException(); }
			return ['committed' => true, 'connection' => self::summary($r)];
		} catch (\Throwable) { throw new PlatformDenied('registry_outcome_unconfirmed'); }
	}
	public function saveAccess(string $owner, string $id, int $revision, string $requestId, bool $enabled, array $apps): array {
		if (!GatewayVerifier::uuid($id) || !GatewayVerifier::uuid($requestId) || $revision < 1) { throw new PlatformDenied('invalid_permission_request'); }
		$apps = ConnectionPolicy::modes($apps);
		$key = hash('sha256', 'access:' . $requestId);
		$hash = hash('sha256', json_encode([$owner, $id, $revision, $enabled, $apps], JSON_THROW_ON_ERROR));
		$this->transaction(function () use ($owner, $id, $revision, $key, $hash, $enabled, $apps) {
			$e = $this->event($key);
			if ($e !== null) {
				if ($e['owner_uid'] !== $owner || $e['conn_id'] !== $id || $e['request_hash'] !== $hash) { throw new PlatformDenied('request_conflict'); }
				return [];
			}
			$r = $this->connection($id, $owner);
			if ((int)$r['revision'] !== $revision || $r['revoked_at'] !== null) { throw new PlatformDenied('version_conflict'); }
			$before = $this->policy($id);
			$count = $this->db->executeStatement('UPDATE ' . $this->connections . ' SET revision=revision+1,updated_at=? WHERE conn_id=? AND owner_uid=? AND revision=?', [time(), $id, $owner, $revision]);
			if ($count !== 1) { throw new PlatformDenied('version_conflict'); }
			$json = json_encode($apps, JSON_THROW_ON_ERROR);
			if ($before['configured']) { $this->db->executeStatement('UPDATE ' . $this->access . ' SET enabled=?,apps_json=? WHERE conn_id=?', [(int)$enabled, $json, $id]); }
			else { $this->db->executeStatement('INSERT INTO ' . $this->access . ' (conn_id,enabled,apps_json) VALUES (?,?,?)', [$id, (int)$enabled, $json]); }
			$changes = ['main:' . (int)$before['enabled'] . '>' . (int)$enabled];
			foreach ($apps as $app => $mode) { if ($before['apps'][$app] !== $mode) { $changes[] = $app . ':' . $before['apps'][$app] . '>' . $mode; } }
			$this->eventInsert($key, $hash, $id, $owner, 'connection.access_changed', $changes);
			return [];
		});
		$e = $this->event($key); $after = $this->policy($id);
		if ($e === null || $after['enabled'] !== $enabled || $after['apps'] !== $apps) { throw new PlatformDenied('registry_outcome_unconfirmed'); }
		return ['committed' => true, 'accessPolicy' => $after];
	}
}
