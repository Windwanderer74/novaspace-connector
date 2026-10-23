<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Migration;
use Closure;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

final class Version000300Date20261018060000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
		$s = $schemaClosure();
		foreach (['ns_pf_grants', 'ns_pf_actions', 'ns_pf_owners'] as $n) {
			if ($s->hasTable($n)) { throw new \RuntimeException('INVENTORY_TABLE_EXISTS_REVIEW'); }
		}
		$t = $s->createTable('ns_pf_owners');
		$t->addColumn('owner_key', 'string', ['length' => 64, 'notnull' => true]);
		$t->setPrimaryKey(['owner_key']);
		$t = $s->createTable('ns_pf_grants');
		foreach (['conn_id' => 36, 'mode' => 8, 'changed_by' => 255] as $n => $l) {
			$t->addColumn($n, 'string', ['length' => $l, 'notnull' => true]);
		}
		foreach (['grant_revision', 'conn_revision', 'changed_at'] as $n) { $t->addColumn($n, 'bigint', ['notnull' => true]); }
		$t->setPrimaryKey(['conn_id']);
		$t = $s->createTable('ns_pf_actions');
		foreach (['action_id' => 36, 'request_key' => 64, 'request_hash' => 64, 'owner_key' => 64, 'owner_uid' => 255,
			'actor_uid' => 255, 'channel' => 32, 'conn_id' => 36, 'verb' => 48] as $n => $l) {
			$t->addColumn($n, 'string', ['length' => $l, 'notnull' => true]);
		}
		$t->addColumn('object_id', 'bigint', ['notnull' => false]);
		$t->addColumn('occurred_at', 'bigint', ['notnull' => true]);
		foreach (['before_json', 'after_json', 'result_json'] as $n) { $t->addColumn($n, 'text', ['length' => 16777215, 'notnull' => false]); }
		$t->setPrimaryKey(['action_id']);
		$t->addUniqueIndex(['request_key'], 'ns_pf_action_request_unique');
		$t->addIndex(['owner_key', 'occurred_at'], 'ns_pf_action_owner_time');
		return $s;
	}
}
