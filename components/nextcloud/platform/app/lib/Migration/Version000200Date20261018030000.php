<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Migration;
use Closure;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

final class Version000200Date20261018030000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
		$schema = $schemaClosure();
		// These tables have no prior app version. Existing unexpected tables require review.
		if ($schema->hasTable('ns_pf_connections') || $schema->hasTable('ns_pf_events')) {
			throw new \RuntimeException('PLATFORM_TABLES_ALREADY_EXIST_REVIEW');
		}
		$t = $schema->createTable('ns_pf_connections');
		foreach (['conn_id' => 36, 'binding_hash' => 64, 'owner_uid' => 255, 'owner_key' => 64, 'native_uid' => 255,
			'issuer' => 255, 'subject_hash' => 64, 'client_hash' => 64, 'label' => 80, 'channel' => 32] as $name => $length) {
			$t->addColumn($name, 'string', ['length' => $length, 'notnull' => true]);
		}
		foreach (['token_id', 'revision', 'created_at', 'updated_at'] as $name) {
			$t->addColumn($name, 'bigint', ['notnull' => true]);
		}
		$t->addColumn('revoked_at', 'bigint', ['notnull' => false]);
		$t->setPrimaryKey(['conn_id']);
		$t->addUniqueIndex(['binding_hash'], 'ns_pf_binding_unique');
		$t->addIndex(['owner_key'], 'ns_pf_conn_owner_idx');
		$t = $schema->createTable('ns_pf_events');
		foreach (['event_id' => 36, 'event_key' => 64, 'request_hash' => 64, 'conn_id' => 36, 'owner_uid' => 255, 'owner_key' => 64,
			'actor_uid' => 255, 'channel' => 32, 'verb' => 48, 'fields_json' => 512] as $name => $length) {
			$t->addColumn($name, 'string', ['length' => $length, 'notnull' => true]);
		}
		$t->addColumn('occurred_at', 'bigint', ['notnull' => true]);
		$t->setPrimaryKey(['event_id']);
		$t->addUniqueIndex(['event_key'], 'ns_pf_event_key_unique');
		$t->addIndex(['owner_key', 'occurred_at'], 'ns_pf_event_owner_time');
		return $schema;
	}
}
