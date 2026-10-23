<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;
use OCP\IDBConnection;
use OCP\IConfig;
use OCP\App\IAppManager;
use OCP\IUserManager;

/** Pinned native persistence; deliberately avoids ItemsService's filesystem side effects. */
class InventoryRepository {
	private ?\OCA\Inventory\Db\ItemMapper $mapper = null;
	public function __construct(private IDBConnection $db, private IConfig $config, private IAppManager $apps, private IUserManager $users) {}
	public function ready(string $owner): void {
		$u = $this->users->get($owner);
		if ($u === null || $u->getUID() !== $owner || !$u->isEnabled() || !$this->apps->isEnabledForUser('inventory', $u)
			|| $this->config->getAppValue('inventory', 'installed_version', '') !== '0.1.5.1') { throw new PlatformDenied('inventory_owner_unavailable'); }
		$root = $this->apps->getAppPath('inventory', true);
		foreach (['lib/Db/Item.php' => '088d285be70822ec58437bc78364d00aa7d09e9a47b230a15a0371b86055d215',
			'lib/Db/ItemMapper.php' => 'b130c00777fbc882b858cd968c0f509b2ebc960b59e03c227f06be2e0a690edd'] as $p => $h) {
			if (!is_file($root . '/' . $p) || !hash_equals($h, hash_file('sha256', $root . '/' . $p))) { throw new PlatformDenied('inventory_source_changed'); }
		}
		$this->apps->loadApp('inventory');
		$this->mapper ??= new \OCA\Inventory\Db\ItemMapper($this->db);
	}
	public function list(string $owner): array { return $this->mapper->findAll($owner, 5001); }
	public function get(string $owner, int $id): object {
		try { $e = $this->mapper->find($id, $owner); }
		catch (\Throwable) { throw new PlatformDenied('item_not_found'); }
		if ($e->getUid() !== $owner) { throw new PlatformDenied('item_not_found'); } return $e;
	}
	public function create(string $owner, array $d): object {
		return $this->mapper->add(['uid' => $owner, 'name' => $d['name'], 'maker' => $d['maker'], 'description' => $d['description'],
			'item_number' => $d['reference'], 'link' => $d['link'], 'gtin' => '', 'details' => $d['details'], 'comment' => $d['comment'],
			'type' => -1, 'path' => '', 'folderid' => -1]);
	}
	public function update(object $e, array $patch): object {
		foreach ($patch as $k => $v) { $method = 'set' . ucfirst($k); $e->$method($v); }
		return $this->mapper->update($e);
	}
	public static function snapshot(object $e, string $owner): array {
		if ($e->getUid() !== $owner) { throw new PlatformDenied('foreign_item'); }
		$d = [];
		foreach (['id', 'uid', 'name', 'maker', 'description', 'itemNumber', 'link', 'gtin', 'details', 'comment', 'type', 'folderid', 'path'] as $k) {
			$m = 'get' . ucfirst($k); $d[$k] = $e->$m();
		}
		if (!is_int($d['id']) || $d['id'] < 1) { throw new PlatformDenied('invalid_item'); }
		$d['version'] = hash('sha256', json_encode($d, JSON_THROW_ON_ERROR)); return $d;
	}
}
