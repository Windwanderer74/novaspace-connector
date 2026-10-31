<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;

final class ConnectionFunctions {
	public static function catalogue(): array {
		$c = json_decode(file_get_contents(__DIR__ . '/../../appinfo/connector-functions.json'), true, 32, JSON_THROW_ON_ERROR);
		if (($c['version'] ?? null) !== 1 || !is_array($c['areas'] ?? null) || !is_array($c['tools'] ?? null)
			|| !preg_match('/^[a-f0-9]{64}$/D', $c['hash'] ?? '')) { throw new PlatformDenied('function_catalogue_invalid'); }
		return $c;
	}
	public static function normalize(array $p): array {
		$c = self::catalogue(); $keys = array_keys($p['areas'] ?? []); sort($keys);
		$expected = array_column($c['areas'], 'id'); sort($expected);
		if (($p['version'] ?? null) !== 1 || !is_string($p['catalogue'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $p['catalogue'])
			|| $keys !== $expected || !is_array($p['allowedTools'] ?? null) || !array_is_list($p['allowedTools'])
			|| count($p['allowedTools']) > 1000) { throw new PlatformDenied('function_policy_invalid'); }
		foreach ($p['areas'] as $mode) { if (!in_array($mode, ['off', 'read', 'write'], true)) throw new PlatformDenied('function_mode_invalid'); }
		$names = $p['allowedTools'];
		foreach ($names as $name) { if (!is_string($name) || !preg_match('/^[a-z][a-z0-9_]{0,127}$/D', $name)) throw new PlatformDenied('function_name_invalid'); }
		if (count(array_unique($names)) !== count($names)) throw new PlatformDenied('function_name_duplicate');
		sort($names); ksort($p['areas']);
		return ['version' => 1, 'catalogue' => $p['catalogue'], 'areas' => $p['areas'], 'allowedTools' => $names];
	}
	public static function inherited(array $apps): array {
		$c = self::catalogue(); $areas = [];
		foreach ($c['areas'] as $a) $areas[$a['id']] = $apps[$a['app']];
		return self::normalize(['version' => 1, 'catalogue' => $c['hash'], 'areas' => $areas, 'allowedTools' => array_column($c['tools'], 'name')]);
	}
	public static function fromForm(string $hash, array $extensions, array $apps, array $allowed, ?array $previous): array {
		$c = self::catalogue();
		if (!hash_equals($c['hash'], $hash)) throw new PlatformDenied('function_catalogue_changed');
		$known = array_column($c['tools'], null, 'name');
		foreach ($allowed as $name) if (!is_string($name) || !isset($known[$name]) || $known[$name]['legacy']) throw new PlatformDenied('function_name_invalid');
		$areas = []; $extensionKeys = [];
		foreach ($c['areas'] as $a) {
			if ($a['extension']) { $extensionKeys[] = $a['id']; $areas[$a['id']] = $extensions[$a['id']] ?? null; }
			else $areas[$a['id']] = $apps[$a['app']];
		}
		$given = array_keys($extensions); sort($given); sort($extensionKeys);
		if ($given !== $extensionKeys) throw new PlatformDenied('function_areas_invalid');
		// Retained compatibility tools are not presented as newly available UI areas.
		foreach ($c['tools'] as $t) if ($t['legacy'] && ($previous === null || in_array($t['name'], $previous['allowedTools'], true))) $allowed[] = $t['name'];
		return self::normalize(['version' => 1, 'catalogue' => $hash, 'areas' => $areas, 'allowedTools' => $allowed]);
	}
}
