<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;

/** Creation protocol; I/O is supplied by the native adapter or isolated tests. */
final class ProjectCreation {
    public const MATRIX = ['Neu', 'Wartend', 'In Arbeit', 'Zu prüfen'];
    public static function framework(array $state): array {
        if (!isset($state['frameworkVersion'])) { return []; } // Preserve 0.2.0 journals.
        $stacks = $state['stacks'] ?? null;
        if ($state['frameworkVersion'] !== 1 || !is_array($stacks) || count($stacks) !== 4) { throw new \RuntimeException('PROJECT_MATRIX'); }
        $ids = [];
        foreach (self::MATRIX as $order => $title) {
            $row = $stacks[$order] ?? [];
            if (!is_int($row['id'] ?? null) || $row['id'] < 1 || ($row['title'] ?? null) !== $title || ($row['order'] ?? null) !== $order) { throw new \RuntimeException('PROJECT_MATRIX'); }
            $ids[] = $row['id'];
        }
        if (count(array_unique($ids)) !== 4 || ($state['stackId'] ?? $ids[0]) !== $ids[0]) { throw new \RuntimeException('PROJECT_MATRIX'); }
        return ['frameworkVersion'=>1, 'stacks'=>$stacks];
    }
    public static function request(string $id, string $title, string $description, string $folder, string $color, string $stack, string $folderMode = 'custom'): array {
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) { throw new \RuntimeException('CREATION_ID'); }
        $title = trim($title); $stack = trim($stack);
        foreach ([$title, $stack] as $name) {
            if ($name === '' || mb_strlen($name) > 180 || preg_match('~[\x00-\x1f/\\\\]~u', $name) || in_array($name, ['.', '..'], true)) { throw new \RuntimeException('PROJECT_NAME'); }
        }
        if (strlen($description) > 16000 || str_contains($description, "\0")) { throw new \RuntimeException('PROJECT_DESCRIPTION'); }
        if (!in_array($folderMode, ['auto', 'custom'], true)) { throw new \RuntimeException('PROJECT_FOLDER_MODE'); }
        $folder = ProjectFolders::path($folderMode === 'auto' ? '/Projekte/' . $title : $folder);
        if (!preg_match('/^[a-f0-9]{6}$/iD', $color)) { throw new \RuntimeException('PROJECT_COLOR'); }
        $input = ['id'=>$id, 'title'=>$title, 'description'=>$description, 'folder'=>$folder, 'color'=>strtoupper($color), 'stack'=>$stack];
        // Preserve every pre-0.2.8 fingerprint and interrupted custom attempt.
        return $folderMode === 'auto' ? $input + ['folderMode'=>'auto'] : $input;
    }
    public static function fingerprint(array $input): string { return hash('sha256', json_encode($input, JSON_THROW_ON_ERROR)); }
    public static function map(array $input, int $boardId, int $stackId, string $origin, array $framework = [], bool $readyWorkplan = true): string {
        if ($boardId < 1 || $stackId < 1) { throw new \RuntimeException('PROJECT_IDENTITY'); }
        $root = 'ns_project_' . $input['id'];
        return CapsuleCore::encode(['root'=>['data'=>[
            'id'=>$root, 'text'=>$input['title'], 'note'=>$input['description'], 'progress'=>1,
            // The empty pie belongs to our shared project workplan, not a manual indicator.
            ...($readyWorkplan ? ['nfDeckAggregate'=>['version'=>1, 'scope'=>'defined-checklist-tasks', 'total'=>0, 'completed'=>0,
                'percent'=>null, 'icon'=>1, 'allChecked'=>false, 'state'=>'unplanned']] : []),
            'nfProjectCapsule'=>['version'=>1, 'creationId'=>$input['id'], 'boardId'=>$boardId] + $framework,
            'nfDeckTarget'=>['version'=>1, 'boardId'=>$boardId, 'stackId'=>$stackId],
            'nfDeckAutoNodes'=>1,
        ], 'children'=>[['data'=>['id'=>$root . ':board', 'text'=>'Deck-Board öffnen',
            'hyperlink'=>$origin . '/index.php/apps/deck/#/board/' . $boardId], 'children'=>[]]]], 'template'=>'default', 'theme'=>'classic-compact']);
    }
    public static function mapping(array $state): array {
        return ['boardId'=>$state['boardId'], 'fileId'=>$state['fileId'], 'rootId'=>'ns_project_' . $state['input']['id'], 'afterCardId'=>0, 'enabled'=>true] + self::framework($state);
    }
    public static function proveMap(string $text, array $state): void {
        $map = CapsuleCore::parse($text); $root = $map['root']['data'];
        $framework = self::framework($state);
        if ($framework !== []) {
            $proof = json_decode(json_encode($root['nfProjectCapsule'] ?? null, JSON_THROW_ON_ERROR), true, 16, JSON_THROW_ON_ERROR);
            if (($proof['frameworkVersion'] ?? null) !== 1 || ($proof['stacks'] ?? null) !== $framework['stacks']) { throw new \RuntimeException('PROJECT_MATRIX_PROOF'); }
        }
        $proof = (array)($root['nfProjectCapsule'] ?? []); $target = (array)($root['nfDeckTarget'] ?? []);
        if (($root['id'] ?? '') !== 'ns_project_' . $state['input']['id'] || ($proof['creationId'] ?? '') !== $state['input']['id']
            || ($proof['version'] ?? null) !== 1 || ($proof['boardId'] ?? null) !== $state['boardId']
            || ($target['boardId'] ?? null) !== $state['boardId'] || ($target['stackId'] ?? null) !== $state['stackId']) { throw new \RuntimeException('PROJECT_MAP_CONFLICT'); }
    }
    /** The adapter holds the actor/attempt mutex throughout this protocol. */
    public static function run(array $input, array $io): array {
        $state = $io['load']($input['id']);
        if ($state === null) { $context = $io['preflight']($input); $state = $io['reserve']($input, $context); }
        if (($state['version'] ?? null) !== 1 || ($state['fingerprint'] ?? '') !== self::fingerprint($input)) { throw new \RuntimeException('CREATION_INPUT_CHANGED'); }
        if ($state['phase'] === 'complete') { return $io['verify']($state); }
        $mayCreateMap = false;
        if ($state['phase'] === 'board-created') {
            // Persist intent BEFORE the non-transactional file operation. A later
            // attempt may adopt its proven file, but never blindly create again.
            $state['phase'] = 'map-creating'; $io['save']($state); $mayCreateMap = true;
        }
        if ($state['phase'] === 'map-creating') {
            $state['fileId'] = $io['map']($state, $mayCreateMap);
            if (!is_int($state['fileId']) || $state['fileId'] < 1) { throw new \RuntimeException('PROJECT_FILE_ID'); }
            $state['phase'] = 'map-created'; $io['save']($state);
        }
        if ($state['phase'] === 'map-created') { $state = $io['commit']($state); }
        if ($state['phase'] !== 'complete') { throw new \RuntimeException('CREATION_PHASE'); }
        return $io['verify']($state);
    }
}
