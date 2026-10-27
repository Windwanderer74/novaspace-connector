<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
$root=dirname(__DIR__);
foreach (['CapsuleCore','DeckCardUpdate','MapWriteGuard','ProjectFolders','ProjectCreation'] as $class) {
    require $root.'/app/lib/Service/'.$class.'.php';
}
// Deck value classes and actual Nextcloud hook semantics are host-context checks.
// Their retained suites are not represented as standalone native integration here.
foreach (['core','project-create','project-framework','project-theme','project-storage','project-ready-workplan'] as $suite) {
    require __DIR__.'/'.$suite.'.php';
}
foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/app', FilesystemIterator::SKIP_DOTS)) as $file) {
    if ($file->isFile() && $file->getExtension()==='php') { token_get_all(file_get_contents($file->getPathname()), TOKEN_PARSE); }
}
echo "Native app PHP syntax checked.\n";
