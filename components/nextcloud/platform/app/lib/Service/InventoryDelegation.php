<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;
use NovaSpace\Platform\NativeAccessResolver;
use OCP\IUserSession;
use OCP\ISession;
use OCP\Authentication\Token\IProvider;
use OCP\IDBConnection;
use OCP\IConfig;
require_once __DIR__ . '/../Native/NativeAccessResolver.php';
require_once __DIR__ . '/GatewayVerifier.php';

/** Only registered personal Inventory access, never a general user impersonation API. */
final class InventoryDelegation {
	private string $prefix;
	public function __construct(private IUserSession $users, private ISession $session, private IProvider $tokens,
		private IDBConnection $db, IConfig $config, private GatewayVerifier $gateway, private InventoryRepository $items, private ConnectionStore $connections) {
		$p = $config->getSystemValue('dbtableprefix', 'oc_');
		if (!is_string($p) || !preg_match('/^[A-Za-z0-9_]{0,64}$/D', $p)) { throw new PlatformDenied('configuration_invalid'); } $this->prefix = $p;
	}
	private function proof() { return (new NativeAccessResolver($this->users, $this->session, $this->tokens))->resolve(); }
	private function table(string $name): string { return $this->prefix . 'ns_pf_' . $name; }
	private function one(string $sql, array $p = []): ?array {
		$r = $this->db->executeQuery($sql, $p); try { $v = $r->fetchAssociative(); return $v === false ? null : $v; } finally { $r->closeCursor(); }
	}
	private function rows(string $sql, array $p = []): array {
		$r = $this->db->executeQuery($sql, $p); try { return $r->fetchAllAssociative(); } finally { $r->closeCursor(); }
	}
	private function lock(): string {
		$provider = $this->db->getDatabaseProvider();
		if (!in_array($provider, ['mysql', 'mariadb', 'sqlite', 'postgres'], true)) { throw new PlatformDenied('database_provider_unsupported'); }
		return $provider === 'sqlite' ? '' : ' FOR UPDATE';
	}
	private function transaction(callable $work): array {
		if ($this->db->inTransaction()) { throw new PlatformDenied('nested_transaction_unsupported'); }
		try { $this->db->beginTransaction(); $r = $work(); $this->db->commit(); return $r; }
		catch (\Throwable $e) {
			try { if ($this->db->inTransaction()) { $this->db->rollBack(); } } catch (\Throwable) {}
			throw $e instanceof PlatformDenied ? $e : new PlatformDenied('inventory_outcome_unconfirmed');
		}
	}
	private static function canonical(array $v): string {
		$sort = function ($v) use (&$sort) { if (!is_array($v)) { return $v; } if (!array_is_list($v)) { ksort($v); } return array_map($sort, $v); };
		return json_encode($sort($v), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR);
	}
	private function ownerLock(string $owner, bool $initialize = false): void {
		$key = hash('sha256', $owner);
		$r = $this->one('SELECT owner_key FROM ' . $this->table('owners') . ' WHERE owner_key=?' . $this->lock(), [$key]);
		if ($r === null && $initialize) {
			$this->db->executeStatement('INSERT INTO ' . $this->table('owners') . ' (owner_key) VALUES (?)', [$key]);
		} elseif ($r === null) { throw new PlatformDenied('inventory_grant_required'); }
	}
	private function connection(string $id, string $owner): array {
		$c = $this->one('SELECT * FROM ' . $this->table('connections') . ' WHERE conn_id=? AND owner_key=?' . $this->lock(), [$id, hash('sha256', $owner)]);
		if ($c === null || $c['owner_uid'] !== $owner) { throw new PlatformDenied('connection_not_found'); } return $c;
	}
	private function grant(array $c): array {
		$g = $this->one('SELECT * FROM ' . $this->table('grants') . ' WHERE conn_id=?', [$c['conn_id']]);
		return ['mode' => $g !== null && (int)$g['conn_revision'] === (int)$c['revision'] && $c['revoked_at'] === null ? $g['mode'] : 'none',
			'revision' => $g === null ? 0 : (int)$g['grant_revision'], 'connectionRevision' => (int)$c['revision']];
	}
	private function event(string $key): ?array { return $this->one('SELECT * FROM ' . $this->table('actions') . ' WHERE request_key=?', [$key]); }
	private function append(string $key, string $hash, array $c, string $actor, string $channel, string $verb, ?array $before, array $after, array $result): array {
		$id = ConnectionStore::id(); $now = time();
		$result += ['actionId' => $id, 'occurredAt' => $now, 'committed' => true];
		$this->db->executeStatement('INSERT INTO ' . $this->table('actions') . ' (action_id,request_key,request_hash,owner_key,owner_uid,actor_uid,channel,conn_id,verb,object_id,occurred_at,before_json,after_json,result_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
			[$id, $key, $hash, hash('sha256', $c['owner_uid']), $c['owner_uid'], $actor, $channel, $c['conn_id'], $verb,
			$channel === 'cloud_connector' ? ($after['id'] ?? null) : null, $now, $before === null ? null : self::canonical($before), self::canonical($after), self::canonical($result)]);
		return $result;
	}
	private function replay(string $key, string $hash, array $c): ?array {
		$e = $this->event($key); if ($e === null) { return null; }
		if ($e['request_hash'] !== $hash || $e['owner_uid'] !== $c['owner_uid'] || $e['conn_id'] !== $c['conn_id']) { throw new PlatformDenied('request_conflict'); }
		$r = json_decode($e['result_json'], true, 32, JSON_THROW_ON_ERROR); $r['replayed'] = true; return $r;
	}
	public function page(): array {
		$p = $this->proof(); if ($p->authentication !== 'web_session') { throw new PlatformDenied('web_session_required'); }
		$list = $this->connections->owned($p->nativeUid);
		foreach ($list as &$c) {
			$c['grant'] = $this->grant(['conn_id' => $c['connectionId'], 'revision' => $c['revision'], 'revoked_at' => $c['revokedAt']]);
		}
		return ['ownerUid' => $p->nativeUid, 'connections' => $list, 'actions' => $this->history($p->nativeUid)];
	}
	public function setGrant(string $id, int $connectionRevision, int $grantRevision, string $mode, string $requestId): array {
		$p = $this->proof(); if ($p->authentication !== 'web_session') { throw new PlatformDenied('web_session_required'); }
		if (!GatewayVerifier::uuid($id) || !GatewayVerifier::uuid($requestId) || $connectionRevision < 1 || $grantRevision < 0
			|| !in_array($mode, ['none', 'read', 'write'], true)) { throw new PlatformDenied('invalid_grant'); }
		$key = hash('sha256', 'grant:' . $id . ':' . $requestId);
		$hash = hash('sha256', self::canonical([$p->nativeUid, $id, $connectionRevision, $grantRevision, $mode]));
		return $this->transaction(function () use ($p, $id, $connectionRevision, $grantRevision, $mode, $key, $hash) {
			$this->ownerLock($p->nativeUid, true); $c = $this->connection($id, $p->nativeUid);
			$old = $this->grant($c); $replay = $this->replay($key, $hash, $c);
			// Replay reports the current grant, never re-enables it.
			if ($replay !== null) { $replay['grant'] = $old; return $replay; }
			if ((int)$c['revision'] !== $connectionRevision || $old['revision'] !== $grantRevision) { throw new PlatformDenied('version_conflict'); }
			if ($mode !== 'none' && $c['revoked_at'] !== null) { throw new PlatformDenied('connection_unavailable'); }
			if ($mode !== 'none') { $this->items->ready($p->nativeUid); }
			$now = time(); $rev = $grantRevision + 1;
			if ($grantRevision === 0) {
				$this->db->executeStatement('INSERT INTO ' . $this->table('grants') . ' (conn_id,mode,grant_revision,conn_revision,changed_by,changed_at) VALUES (?,?,?,?,?,?)', [$id, $mode, $rev, $connectionRevision, $p->nativeUid, $now]);
			} else {
				$n = $this->db->executeStatement('UPDATE ' . $this->table('grants') . ' SET mode=?,grant_revision=?,conn_revision=?,changed_by=?,changed_at=? WHERE conn_id=? AND grant_revision=?', [$mode, $rev, $connectionRevision, $p->nativeUid, $now, $id, $grantRevision]);
				if ($n !== 1) { throw new PlatformDenied('version_conflict'); }
			}
			$g = $this->grant($c); return $this->append($key, $hash, $c, $p->nativeUid, 'web', 'inventory.grant.' . $mode, $old, $g, ['grant' => $g, 'replayed' => false]);
		});
	}
	private function history(string $owner): array {
		$rows = $this->rows('SELECT action_id,owner_uid,actor_uid,channel,conn_id,verb,object_id,occurred_at,before_json,after_json FROM ' . $this->table('actions') . ' WHERE owner_key=? ORDER BY occurred_at DESC,action_id DESC LIMIT 5', [hash('sha256', $owner)]);
		return array_map(function ($r) use ($owner) {
			if ($r['owner_uid'] !== $owner) { throw new PlatformDenied('foreign_history'); }
			$before = $r['before_json'] === null ? null : json_decode($r['before_json'], true, 32, JSON_THROW_ON_ERROR);
			$after = json_decode($r['after_json'], true, 32, JSON_THROW_ON_ERROR);
			$changed = array_keys(array_filter($after, fn($v, $k) => $k !== 'version' && ($before === null || !array_key_exists($k, $before) || $before[$k] !== $v), ARRAY_FILTER_USE_BOTH));
			return ['actionId' => $r['action_id'], 'ownerUid' => $owner, 'actorUid' => $r['actor_uid'], 'channel' => $r['channel'],
				'connectionId' => $r['conn_id'], 'action' => $r['verb'], 'itemId' => $r['object_id'] === null ? null : (int)$r['object_id'],
				'occurredAt' => (int)$r['occurred_at'], 'changedFields' => $changed, 'before' => $before, 'after' => $after];
		}, $rows);
	}
	private static function shape(array $c): void {
		$op = $c['operation'] ?? null;
		$keys = match ($op) {
			'status', 'list', 'history' => ['operation'], 'get' => ['operation', 'itemId'],
			'create' => ['operation', 'requestId', 'expectedAccount', 'data'],
			'update' => ['operation', 'requestId', 'expectedAccount', 'itemId', 'expectedVersion', 'patch'],
			default => throw new PlatformDenied('operation_unsupported'),
		};
		$a = array_keys($c); sort($a); sort($keys); if ($a !== $keys) { throw new PlatformDenied('unsupported_parameter'); }
		if (isset($c['itemId']) && (!is_int($c['itemId']) || $c['itemId'] < 1)) { throw new PlatformDenied('invalid_item_id'); }
		if (in_array($op, ['create', 'update'], true)) {
			if (!is_string($c['requestId']) || !GatewayVerifier::uuid($c['requestId']) || !is_string($c['expectedAccount'])) { throw new PlatformDenied('invalid_request'); }
			$d = $c[$op === 'create' ? 'data' : 'patch'];
			if (!is_array($d) || $d === [] || array_is_list($d)) { throw new PlatformDenied('invalid_fields'); }
			$limits = ['name' => 100, 'maker' => 100, 'description' => 20000, 'link' => 255, 'details' => 20000, 'comment' => 20000];
			if ($op === 'create') { $limits['reference'] = 100; $a = array_keys($d); sort($a); $k = array_keys($limits); sort($k); if ($a !== $k) { throw new PlatformDenied('invalid_fields'); } }
			foreach ($d as $k => $v) {
				if (!isset($limits[$k]) || !is_string($v) || strlen($v) > $limits[$k] || str_contains($v, "\0") || !mb_check_encoding($v, 'UTF-8')
					|| (in_array($k, ['name', 'reference'], true) && trim($v) === '')
					|| ($k === 'link' && $v !== '' && !preg_match('~^https?://[^\s]+$~iD', $v))) { throw new PlatformDenied('invalid_fields'); }
			}
			if ($op === 'update' && (!is_string($c['expectedVersion']) || !preg_match('/^[0-9a-f]{64}$/D', $c['expectedVersion']))) { throw new PlatformDenied('invalid_version'); }
		}
	}
	public static function envelope(array $command): string { return self::canonical(['command' => $command]); }
	public function execute(string $assertion, array $command): array {
		$raw = self::envelope($command);
		if (strlen($raw) > 100000) { throw new PlatformDenied('invalid_command_body'); }
		self::shape($command); $p = $this->proof();
		if ($p->authentication !== 'app_password') { throw new PlatformDenied('app_password_required'); }
		$claims = $this->gateway->verify($assertion, 'inventory', null, hash('sha256', $raw));
		if (!in_array('inventory:read', $claims['scope'], true) || (in_array($command['operation'], ['create', 'update'], true) && !in_array('inventory:write', $claims['scope'], true))) { throw new PlatformDenied('inventory_scope_required'); }
		$client = ['issuer' => $claims['iss'], 'subjectHash' => $claims['sub'], 'clientHash' => $claims['client'], 'nativeUid' => $p->nativeUid, 'nativeTokenId' => $p->nativeTokenId];
		$state = $this->connections->status($client);
		if (!$state['active']) { throw new PlatformDenied('connection_unavailable'); }
		$owner = $state['connection']['ownerUid']; $id = $state['connection']['connectionId'];
		return $this->transaction(function () use ($command, $client, $p, $owner, $id) {
			$op = $command['operation'];
			if ($op !== 'status') { $this->ownerLock($owner); }
			$c = $this->connection($id, $owner);
			if ($c['revoked_at'] !== null || $c['native_uid'] !== $p->nativeUid || (int)$c['token_id'] !== $p->nativeTokenId || $c['binding_hash'] !== ConnectionStore::binding($client)) { throw new PlatformDenied('connection_unavailable'); }
			$g = $this->grant($c); $base = ['account' => $owner, 'connectionId' => $id, 'actorUid' => $p->nativeUid, 'grant' => $g];
			if ($op === 'status') { return $base + ['journalScope' => 'delegated_inventory_and_grants', 'deleteImplemented' => false, 'sharingImplemented' => false, 'approvalUrl' => '/index.php/apps/novaspace_platform/inventory']; }
			$write = in_array($op, ['create', 'update'], true);
			if ($g['mode'] === 'none' || ($write && $g['mode'] !== 'write')) { throw new PlatformDenied('inventory_grant_required'); }
			$this->items->ready($owner);
			if ($op === 'history') { return $base + ['actions' => $this->history($owner)]; }
			$snapshot = fn($e) => InventoryRepository::snapshot($e, $owner);
			if ($op === 'list') {
				$list = $this->items->list($owner); if (count($list) > 5000) { throw new PlatformDenied('inventory_list_too_large'); }
				return $base + ['items' => array_map($snapshot, $list)];
			}
			if ($op === 'get') { return $base + ['item' => $snapshot($this->items->get($owner, $command['itemId']))]; }
			if ($command['expectedAccount'] !== $owner) { throw new PlatformDenied('owner_conflict'); }
			$key = hash('sha256', 'inventory:' . $id . ':' . $command['requestId']);
			$hash = hash('sha256', self::canonical($command));
			$prior = $this->replay($key, $hash, $c); if ($prior !== null) { return $base + $prior; }
			$before = null;
			if ($op === 'create') {
				$list = $this->items->list($owner); if (count($list) > 5000) { throw new PlatformDenied('inventory_list_too_large'); }
				foreach ($list as $e) { $d = $snapshot($e); if ($d['itemNumber'] === $command['data']['reference']) { throw new PlatformDenied('reference_exists'); } }
				$entity = $this->items->create($owner, $command['data']);
			} else {
				// Lock the native row so edits via the normal Inventory UI cannot interleave after our version check.
				$r = $this->one('SELECT uid FROM ' . $this->prefix . 'invtry_items WHERE id=?' . $this->lock(), [$command['itemId']]);
				if ($r === null || $r['uid'] !== $owner) { throw new PlatformDenied('item_not_found'); }
				$entity = $this->items->get($owner, $command['itemId']); $before = $snapshot($entity);
				if ($before['version'] !== $command['expectedVersion']) { throw new PlatformDenied('version_conflict'); }
				$entity = $this->items->update($entity, $command['patch']);
			}
			$after = $snapshot($this->items->get($owner, $entity->getId()));
			$desired = $op === 'create' ? $command['data'] : $command['patch'];
			foreach ($desired as $k => $v) { if ($after[$k === 'reference' ? 'itemNumber' : $k] !== $v) { throw new PlatformDenied('item_readback_failed'); } }
			$result = $this->append($key, $hash, $c, $p->nativeUid, 'cloud_connector', 'inventory.' . $op, $before, $after,
				['outcome' => $op === 'create' ? 'created' : 'updated', 'item' => $after, 'requestId' => $command['requestId'], 'replayed' => false]);
			if ($this->event($key) === null) { throw new PlatformDenied('journal_readback_failed'); }
			return $base + $result;
		});
	}
}
