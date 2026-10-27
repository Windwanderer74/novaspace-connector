<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;

/** Pure, bounded projection. All permissions and storage are checked by CapsuleService. */
final class CapsuleCore {
    public const MAX_BYTES = 524288;
    public static function apiAllowed(string $uid, bool $hasAuthorization, string $proof): bool {
        return ($uid !== 'ChatGPT' && !$hasAuthorization) || $proof === 'files-read-write-v1';
    }
    public static function parse(string $text): array {
        if (strlen($text) > self::MAX_BYTES || str_contains($text, "\0")) { throw new \RuntimeException('MAP_SIZE'); }
        $raw = json_decode($text, false, 192, JSON_THROW_ON_ERROR);
        if (!$raw instanceof \stdClass || !isset($raw->root)) { throw new \RuntimeException('MAP_FORMAT'); }
        $map = (array)$raw; $map['root'] = self::structuralNode($raw->root);
        $ids = []; self::validateNode($map['root'], 0, $ids);
        return $map;
    }
    private static function structuralNode(mixed $raw): array {
        if (!$raw instanceof \stdClass || !($raw->data ?? null) instanceof \stdClass) { throw new \RuntimeException('MAP_NODE'); }
        $node = (array)$raw; $node['data'] = (array)$raw->data;
        // Unknown metadata remains stdClass: preserve {}, numeric object keys and all values.
        if (isset($raw->children)) {
            if (!is_array($raw->children)) { throw new \RuntimeException('MAP_CHILDREN'); }
            $node['children'] = array_map(self::structuralNode(...), $raw->children);
        }
        return $node;
    }
    private static function validateNode(array $node, int $depth, array &$ids): void {
        $id = $node['data']['id'] ?? null; $text = $node['data']['text'] ?? null;
        if ($depth > 64 || count($ids) >= 2000 || !is_string($id) || $id === '' || strlen($id) > 255
            || isset($ids[$id]) || !is_string($text) || mb_strlen($text) > 10000) { throw new \RuntimeException('MAP_NODE'); }
        $ids[$id] = true;
        if (isset($node['children']) && (!is_array($node['children']) || !array_is_list($node['children']))) { throw new \RuntimeException('MAP_CHILDREN'); }
        foreach ($node['children'] ?? [] as $child) {
            if (!is_array($child)) { throw new \RuntimeException('MAP_CHILDREN'); }
            self::validateNode($child, $depth + 1, $ids);
        }
    }
    public static function encode(array $map): string {
        $text = json_encode($map, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        self::parse($text); return $text;
    }
    public static function binding(string $description): ?array {
        $found = [];
        // A marker in a fenced example must not accidentally bind an ordinary card.
        $fence = null;
        foreach (preg_split('/\R/u', $description) as $line) {
            if (preg_match('/^ {0,3}(`{3,}|~{3,})(.*)$/', $line, $m)) {
                if ($fence === null) { $fence = [$m[1][0], strlen($m[1])]; }
                elseif ($m[1][0] === $fence[0] && strlen($m[1]) >= $fence[1] && trim($m[2]) === '') { $fence = null; }
                continue;
            }
            if ($fence !== null || !str_starts_with(trim($line), '<!-- nf-mindmap:')) { continue; }
            if (!preg_match('/^<!-- nf-mindmap:(\{.*\}) -->$/', trim($line), $m)) { throw new \RuntimeException('CARD_BINDING_INVALID'); }
            $found[] = json_decode($m[1], true, 12, JSON_THROW_ON_ERROR);
        }
        if (count($found) > 1) { throw new \RuntimeException('CARD_BINDING_AMBIGUOUS'); }
        return $found[0] ?? null;
    }
    public static function nodeId(int $boardId, int $cardId): string { return 'ns_board_' . $boardId . '_card_' . $cardId; }
    private static function collect(array $node, int $cardId, array &$matches, string $id, array &$sameId): void {
        if (($node['data']['id'] ?? '') === $id) { $sameId[] = $node; }
        $sync = (array)($node['data']['nfDeckSync'] ?? []);
        if (($sync['cardId'] ?? null) === $cardId) { $matches[] = $node; }
        foreach ($node['children'] ?? [] as $child) { self::collect($child, $cardId, $matches, $id, $sameId); }
    }
    /** Existing linked cards are handled by the established workflow, never rebound. */
    public static function prepare(array $map, array $card, array $project, string $path, string $origin): array {
        foreach (['boardId', 'cardId'] as $key) { if (!is_int($card[$key] ?? null) || $card[$key] < 1) { throw new \RuntimeException('CARD_ID'); } }
        if ($card['boardId'] !== ($project['boardId'] ?? null) || $card['cardId'] <= ($project['afterCardId'] ?? PHP_INT_MAX)) { throw new \RuntimeException('OUTSIDE_PILOT'); }
        if (($map['root']['data']['id'] ?? '') !== ($project['rootId'] ?? null)) { throw new \RuntimeException('ROOT_CHANGED'); }
        if (!preg_match('~^/[^\x00-\x1f\\\\]*\.km$~i', $path) || str_contains($path, '//') || preg_match('~/(?:\.|\.\.)(?:/|$)~', $path)) { throw new \RuntimeException('MAP_PATH'); }
        $url = parse_url($origin);
        if (($url['scheme'] ?? '') !== 'https' || !isset($url['host']) || isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment']) || (($url['path'] ?? '') !== '')) { throw new \RuntimeException('ORIGIN'); }
        $description = $card['description'] ?? ''; $title = $card['title'] ?? '';
        if (!is_string($description) || strlen($description) > 110000 || !is_string($title) || trim($title) === '' || mb_strlen($title) > 240) { throw new \RuntimeException('CARD_TEXT'); }
        $id = self::nodeId($card['boardId'], $card['cardId']);
        $binding = ['version' => 1, 'path' => $path, 'fileId' => (string)$project['fileId'], 'nodeId' => $id, 'checklistId' => 'goals'];
        $old = self::binding($description);
        if ($old !== null && $old != $binding) { return ['state' => 'existing-binding', 'map' => $map, 'changed' => false]; }
        $matches = []; $sameId = []; self::collect($map['root'], $card['cardId'], $matches, $id, $sameId);
        if (count($matches) > 1 || count($sameId) > 1) { throw new \RuntimeException('MAP_BINDING_AMBIGUOUS'); }
        if ($old == $binding) {
            if (count($matches) !== 1 || count($sameId) !== 1 || ($matches[0]['data']['id'] ?? '') !== $id
                || (((array)($matches[0]['data']['nfDeckSync'] ?? []))['boardId'] ?? null) !== $card['boardId']) { throw new \RuntimeException('LINK_INCOMPLETE'); }
            if ((((array)($matches[0]['data']['nfCapsulePilot'] ?? []))['state'] ?? '') === 'pending') { return self::recover($map, $matches[0], $card, $binding); }
            return ['state' => 'linked', 'map' => $map, 'changed' => false];
        }
        if ($matches !== [] || $sameId !== []) {
            if (count($matches) === 1 && count($sameId) === 1 && ($matches[0]['data']['id'] ?? '') === $id
                && (((array)($matches[0]['data']['nfDeckSync'] ?? []))['boardId'] ?? null) === $card['boardId']) { return self::recover($map, $matches[0], $card, $binding); }
            throw new \RuntimeException('NODE_ALREADY_EXISTS');
        }
        // Markers from other workflows are not silently repurposed as empty goals.
        if (preg_match('/<!-- nf-(?:checklist|conditions|task):/', $description)) { throw new \RuntimeException('EXISTING_GOALS_REQUIRE_EXPLICIT_LINK'); }
        $base = preg_replace('/^[○◔◑◕●]\s+/u', '', trim($title));
        $newTitle = '○ ' . $base;
        if (mb_strlen($newTitle) > 255) { throw new \RuntimeException('CARD_TITLE_LIMIT'); }
        $newDescription = self::description($binding, $description);
        if (strlen($newDescription) > 131072) { throw new \RuntimeException('CARD_DESCRIPTION_LIMIT'); }
        $progress = ['total' => 0, 'completed' => 0, 'percent' => null, 'icon' => 0, 'allChecked' => false];
        $node = ['data' => ['id' => $id, 'text' => $base . ' · noch keine Ziele', 'note' => $description,
            'hyperlink' => $origin . '/index.php/apps/deck/card/' . $card['cardId'], 'progress' => 1,
            'nfCapsulePilot' => ['version' => 1, 'state' => 'pending', 'originalTitle' => $title,
                'originalDescriptionSha256' => hash('sha256', $description), 'linkedDescriptionSha256' => hash('sha256', $newDescription)],
            'nfDeckSync' => array_merge(['version' => 1, 'boardId' => $card['boardId'], 'cardId' => $card['cardId'],
                'checklistId' => 'goals', 'baseText' => $base], $progress,
                ['cardDone' => !empty($card['done']), 'statusConflict' => !empty($card['done']), 'items' => [],
                    'lists' => [['id' => 'goals', 'title' => 'Ziele', 'items' => []]], 'role' => 'conditions'])],
            'children' => [['data' => ['id' => $id . ':deck-checklist', 'text' => 'Ziele · noch ungeplant',
                'nfDeckChecklistOwner' => $id, 'nfDeckListId' => 'goals', 'progress' => 1], 'children' => []]]];
        $map['root']['children'][] = $node; self::encode($map);
        return ['state' => 'pending', 'map' => $map, 'changed' => true, 'writePending' => true, 'nodeId' => $id,
            'binding' => $binding, 'title' => $newTitle, 'description' => $newDescription];
    }
    private static function description(array $binding, string $original): string {
        return '<!-- nf-mindmap:' . json_encode($binding, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . " -->\n"
            . '<!-- nf-conditions:{"version":1,"lists":[{"id":"goals","title":"Ziele"}]} -->' . "\n\n"
            . "## Ziele\n\n<!-- nf-checklist:goals:start -->\n<!-- nf-checklist:goals:end -->\n\n" . $original;
    }
    private static function recover(array $map, array $node, array $card, array $binding): array {
        $p = (array)($node['data']['nfCapsulePilot'] ?? []);
        $original = $node['data']['note'] ?? null;
        if (($p['version'] ?? null) !== 1 || ($p['state'] ?? '') !== 'pending' || !is_string($original)
            || ($p['originalDescriptionSha256'] ?? '') !== hash('sha256', $original)
            || !is_string($p['originalTitle'] ?? null) || (((array)($node['data']['nfDeckSync'] ?? []))['items'] ?? null) !== []
            || count($node['children'] ?? []) !== 1 || ($node['children'][0]['children'] ?? null) !== []) { throw new \RuntimeException('PENDING_CHANGED'); }
        $description = self::description($binding, $original);
        $title = '○ ' . preg_replace('/^[○◔◑◕●]\s+/u', '', trim($p['originalTitle']));
        if (($p['linkedDescriptionSha256'] ?? '') !== hash('sha256', $description)
            || !in_array($card['description'], [$original, $description], true)
            || !in_array($card['title'], [$p['originalTitle'], $title], true)) { throw new \RuntimeException('CARD_CHANGED'); }
        return ['state' => 'pending', 'map' => $map, 'changed' => true, 'writePending' => false,
            'nodeId' => $binding['nodeId'], 'binding' => $binding, 'title' => $title, 'description' => $description];
    }
    public static function complete(array $map, string $nodeId): array {
        foreach ($map['root']['children'] as &$node) {
            $pilot = (array)($node['data']['nfCapsulePilot'] ?? []);
            if (($node['data']['id'] ?? '') === $nodeId && ($pilot['state'] ?? '') === 'pending') {
                $pilot['state'] = 'linked'; $node['data']['nfCapsulePilot'] = $pilot;
                self::encode($map); return $map;
            }
        }
        throw new \RuntimeException('PENDING_NODE_MISSING');
    }
}
