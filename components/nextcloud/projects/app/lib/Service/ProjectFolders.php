<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;

use OCP\Files\Folder;

/** All paths are relative to the current actor's native Files home. */
final class ProjectFolders {
    public static function path(string $path): string {
        if (strlen($path) > 2048 || str_contains($path, '//')) { throw new \RuntimeException('PROJECT_FOLDER'); }
        $path = rtrim($path, '/') ?: '/';
        if (!preg_match('~^/(?:[^/\x00-\x1f\\\\]+/)*[^/\x00-\x1f\\\\]*$~u', $path)
            || preg_match('~/(?:\.|\.\.)(?:/|$)~', $path)) { throw new \RuntimeException('PROJECT_FOLDER'); }
        return $path;
    }
    public static function resolve(Folder $home, string $uid, array $input, ?int $expectedId = null, bool $create = false): Folder {
        $path = self::path($input['folder']);
        if (($input['folderMode'] ?? 'custom') === 'auto') {
            if ($path !== '/Projekte/' . $input['title']) { throw new \RuntimeException('PROJECT_FOLDER'); }
            $dir = $home;
            foreach (['Projekte', $input['title']] as $part) {
                if (!$dir->nodeExists($part)) {
                    if (!$create || !$dir->isCreatable()) { throw new \RuntimeException('PROJECT_FOLDER_ACCESS'); }
                    try { $dir->newFolder($part); }
                    catch (\Throwable $e) { if (!$dir->nodeExists($part)) { throw $e; } }
                }
                $dir = $dir->get($part);
                // A shared folder with the same name is never silently used as
                // the personal default. Native newFolder never replaces a node.
                if (!$dir instanceof Folder || !$dir->isReadable() || $dir->getOwner()?->getUID() !== $uid) {
                    throw new \RuntimeException('PROJECT_DEFAULT_FOLDER_CONFLICT');
                }
            }
        } else {
            $dir = $path === '/' ? $home : $home->get(ltrim($path, '/'));
        }
        if (!$dir instanceof Folder || !$dir->isReadable() || !$dir->isCreatable()
            || ($expectedId !== null && $dir->getId() !== $expectedId)) { throw new \RuntimeException('PROJECT_FOLDER_ACCESS'); }
        return $dir;
    }
    /** Read-only folder chooser; no files, external URLs or other homes. */
    public static function listing(Folder $home, string $path): array {
        $path = self::path($path);
        $dir = $path === '/' ? $home : $home->get(ltrim($path, '/'));
        if (!$dir instanceof Folder || !$dir->isReadable()) { throw new \RuntimeException('PROJECT_FOLDER_ACCESS'); }
        $folders = [];
        foreach ($dir->getDirectoryListing() as $child) {
            if (!$child instanceof Folder || !$child->isReadable()) { continue; }
            $relative = $home->getRelativePath($child->getPath());
            if (!is_string($relative)) { throw new \RuntimeException('PROJECT_FOLDER_ACCESS'); }
            $childPath = self::path('/' . ltrim($relative, '/'));
            $parent = strrpos($childPath, '/');
            if (substr($childPath, 0, $parent) !== rtrim($path, '/')) { throw new \RuntimeException('PROJECT_FOLDER_ACCESS'); }
            $folders[] = ['name'=>$child->getName(), 'path'=>$childPath];
            if (count($folders) > 1000) { throw new \RuntimeException('PROJECT_FOLDER_LIMIT'); }
        }
        usort($folders, static fn(array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));
        return ['path'=>$path, 'parent'=>$path === '/' ? null : (dirname($path) ?: '/'), 'creatable'=>$dir->isCreatable(), 'folders'=>$folders];
    }
}
