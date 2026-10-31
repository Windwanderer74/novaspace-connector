<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Migration;
use Closure;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;
final class Version000500Date20261031190000 extends SimpleMigrationStep {
	public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
		$schema = $schemaClosure();
		if ($schema->hasTable('ns_pf_tool_access')) throw new \RuntimeException('PLATFORM_FUNCTION_TABLE_ALREADY_EXISTS_REVIEW');
		$t = $schema->createTable('ns_pf_tool_access');
		$t->addColumn('conn_id', 'string', ['length' => 36, 'notnull' => true]);
		$t->addColumn('policy_json', 'text', ['notnull' => true]);
		$t->setPrimaryKey(['conn_id']);
		return $schema;
	}
}
