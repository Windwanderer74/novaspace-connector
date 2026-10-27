<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
use OCA\NovaspaceCapsules\Service\ProjectCreation as ThemeProjectCreation;
if (!class_exists(ThemeProjectCreation::class)) { require __DIR__.'/../update-0.2.4/lib/Service/ProjectCreation.php'; }
if (!class_exists(\OCA\NovaspaceCapsules\Service\CapsuleCore::class)) { require __DIR__.'/../app/lib/Service/CapsuleCore.php'; }
$themeInput=ThemeProjectCreation::request(str_repeat('b',32),'Theme-Prüfung','','/','DDCB55','Neu');
$themeMap=json_decode(ThemeProjectCreation::map($themeInput,77,88,'https://cloud.example'),true,32,JSON_THROW_ON_ERROR);
// Real Core0.1.3 viewer rejected 'fresh'; classic-compact loaded the same map successfully.
if(($themeMap['theme']??null)!=='classic-compact'){throw new RuntimeException('CREATION_TEST:unsupported-viewer-theme');}
echo "NovaSpace Mindmap-Viewer-Kompatibilität: 1 Prüfung bestanden.\n";
