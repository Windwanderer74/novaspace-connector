<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Migration;
use Closure;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;
final class Version000400Date20261018180000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
		$schema = $schemaClosure();
		if ($schema->hasTable('ns_pf_access')) { throw new \RuntimeException('PLATFORM_ACCESS_TABLE_ALREADY_EXISTS_REVIEW'); }
		$t = $schema->createTable('ns_pf_access');
		$t->addColumn('conn_id', 'string', ['length' => 36, 'notnull' => true]);
		$t->addColumn('enabled', 'integer', ['notnull' => true]);
		$t->addColumn('apps_json', 'string', ['length' => 512, 'notnull' => true]);
		$t->setPrimaryKey(['conn_id']);
		return $schema;
	}
}
