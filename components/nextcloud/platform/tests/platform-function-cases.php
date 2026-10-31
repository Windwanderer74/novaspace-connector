<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
use OCA\NovaspacePlatform\Service\ConnectionStore as Store;
use OCA\NovaspacePlatform\Service\ConnectionPolicy as Policy;
use OCA\NovaspacePlatform\Service\ConnectionFunctions as Functions;
function selection(array $apps, array $excluded = []): array {
	$p = Functions::inherited($apps);
	$p['allowedTools'] = array_values(array_diff($p['allowedTools'], $excluded));
	return Functions::normalize($p);
}
rt('Saving and reading individual exclusions preserves app ceilings and creates v2 only after explicit save', function($f) {
	$c = $f->store->approve('Owner', $f->client, Store::id(), 'Name')['connection']; $apps = Policy::defaults()['apps'];
	check($f->store->policy($c['connectionId'])['version'] === 1);
	$p = selection($apps, ['update_card']); $r = $f->store->saveAccess('Owner', $c['connectionId'], 1, Store::id(), true, $apps, $p);
	check($r['accessPolicy']['version'] === 2 && $r['accessPolicy']['functions'] === $p && $r['accessPolicy']['apps'] === $apps);
});
rt('Switching area and master off preserves detail choices for reactivation', function($f) {
	$c = $f->store->approve('Owner', $f->client, Store::id(), 'Name')['connection']; $apps = Policy::defaults()['apps'];
	$p = selection($apps, ['update_card']); $apps['deck'] = 'off'; $p['areas']['deck'] = 'off';
	$f->store->saveAccess('Owner', $c['connectionId'], 1, Store::id(), false, $apps, $p);
	$apps['deck'] = 'write'; $r = $f->store->saveAccess('Owner', $c['connectionId'], 2, Store::id(), true, $apps);
	check($r['accessPolicy']['functions']['areas']['deck'] === 'write' && $r['accessPolicy']['functions']['allowedTools'] === $p['allowedTools'] && !in_array('update_card', $p['allowedTools'], true));
});
rt('Two owner connections and another owner retain separate detail selections', function($f) {
	$a = $f->store->approve('Owner', $f->client, Store::id(), 'A')['connection'];
	$f->client['clientHash'] = str_repeat('d', 64); $b = $f->store->approve('Owner', $f->client, Store::id(), 'B')['connection'];
	$apps = Policy::defaults()['apps']; $p = selection($apps, ['update_card']);
	registryDenied(fn() => $f->store->saveAccess('Other', $a['connectionId'], 1, Store::id(), true, $apps, $p), 'connection_not_found');
	$f->store->saveAccess('Owner', $a['connectionId'], 1, Store::id(), true, $apps, $p);
	check(!isset($f->store->policy($b['connectionId'])['functions']));
});
rt('Detail mutation and readable audit roll back together on a journal failure', function($f) {
	$c = $f->store->approve('Owner', $f->client, Store::id(), 'Name')['connection']; $apps = Policy::defaults()['apps'];
	$f->db->failEvent = true;
	registryDenied(fn() => $f->store->saveAccess('Owner', $c['connectionId'], 1, Store::id(), true, $apps, selection($apps, ['update_card'])), 'registry_outcome_unconfirmed');
	check($f->store->status($f->client)['connection']['revision'] === 1 && !isset($f->store->policy($c['connectionId'])['functions']));
});
rt('Repeated identical save stays single and stale or changed detail requests cannot overwrite', function($f) {
	$c = $f->store->approve('Owner', $f->client, Store::id(), 'Name')['connection']; $apps = Policy::defaults()['apps'];
	$p = selection($apps, ['update_card']); $id = Store::id();
	$f->store->saveAccess('Owner', $c['connectionId'], 1, $id, true, $apps, $p);
	$f->store->saveAccess('Owner', $c['connectionId'], 1, $id, true, $apps, $p);
	check(count($f->store->history('Owner')) === 2);
	registryDenied(fn() => $f->store->saveAccess('Owner', $c['connectionId'], 1, $id, true, $apps, selection($apps)), 'request_conflict');
	registryDenied(fn() => $f->store->saveAccess('Owner', $c['connectionId'], 1, Store::id(), true, $apps, $p), 'version_conflict');
});
rt('Native form rejects stale catalogue unknown tools and partial extension modes', function($f) {
	$c = $f->store->approve('Owner', $f->client, Store::id(), 'Name')['connection']; $apps = Policy::defaults()['apps'];
	$cat = Functions::catalogue(); $areas = [];
	foreach ($cat['areas'] as $a) if ($a['extension']) $areas[$a['id']] = 'write';
	foreach ([['bad', $areas, []], [$cat['hash'], $areas, ['files_invented']], [$cat['hash'], [], []]] as [$hash, $modes, $names])
		registryDenied(fn() => $f->service->saveAccess($c['connectionId'], 1, Store::id(), '1', $apps, $hash, $names, $modes));
	check($f->store->policy($c['connectionId'])['version'] === 1);
});
rt('Real owner controller saves exact unchecked intent without regranting missing checkboxes', function($f) {
	$c = $f->store->approve('Owner', $f->client, Store::id(), 'Name')['connection']; $apps = Policy::defaults()['apps'];
	$cat = Functions::catalogue(); $areas = [];
	foreach ($cat['areas'] as $a) if ($a['extension']) $areas[$a['id']] = 'off';
	$r = webController($f)->saveAccess($c['connectionId'], 1, Store::id(), '1', $apps, $cat['hash'], [], $areas);
	check($r instanceof \OCP\AppFramework\Http\RedirectResponse);
	$p = $f->store->policy($c['connectionId']);
	foreach ($cat['tools'] as $t) if (!$t['legacy']) check(!in_array($t['name'], $p['functions']['allowedTools'], true));
});
rt('Rendered page groups accepted nineteen areas and displays exclusions without exposing legacy inventory', function($f) {
	$c = $f->store->approve('Owner', $f->client, Store::id(), '<Name>')['connection']; $apps = Policy::defaults()['apps'];
	$f->store->saveAccess('Owner', $c['connectionId'], 1, Store::id(), true, $apps, selection($apps, ['update_card']));
	$_ = webController($f)->index()->params + ['requesttoken' => '<csrf>'];
	ob_start(); include __DIR__ . '/../app/templates/connections.php'; $html = ob_get_clean();
	check(substr_count($html, 'data-area-mode') === 19 && substr_count($html, 'class="ns-category"') === 3);
	foreach (['Arbeit', 'Kommunikation', 'Verwaltung', 'Individuell eingeschränkt', 'Einzelne Funktionen', 'Lesen und Schreiben'] as $label) check(str_contains($html, $label));
	preg_match('/<input[^>]*value="update_card"[^>]*>/', $html, $m); check(isset($m[0]) && !str_contains($m[0], 'checked'));
	check(!str_contains($html, 'value="inventory_') && str_contains($html, 'name="apps[inventory]"') && !str_contains($html, '<Name>'));
});
rt('Additive function migration creates only its own table and leaves original schema intact', function($f) {
	require_once __DIR__ . '/../app/lib/Migration/Version000500Date20261031190000.php';
	$s = new SchemaFixture(); $old = $s->tables['ns_pf_access'] = new SchemaTable();
	$m = new \OCA\NovaspacePlatform\Migration\Version000500Date20261031190000();
	$m->changeSchema(new class implements \OCP\Migration\IOutput {}, fn() => $s, []);
	check(count($s->tables) === 2 && $s->tables['ns_pf_access'] === $old && $s->tables['ns_pf_tool_access']->primary === ['conn_id']);
});
