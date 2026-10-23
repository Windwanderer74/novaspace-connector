<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;

final class ConnectionPolicy {
	public const APPS = [
		'files' => ['label' => 'Dateien', 'write' => true, 'changes' => 'Dateien suchen, anlegen, kopieren, Text bearbeiten, verschieben und umbenennen; Dateifreigaben nur mit zusätzlichem Freigaberecht verwalten; Papierkorb und Wiederherstellen nur mit zusätzlichem Papierkorbrecht'],
		'deck' => ['label' => 'Deck', 'write' => true, 'changes' => 'Karten, Labels und Zuständigkeiten pflegen; Boards und Listen anlegen und ordnen; beauftragte Kommentare verfassen und eigene bearbeiten; vorhandene Dateien mit zusätzlichem Dateifreigaberecht an Karten verknüpfen und abtrennen; native Rechte gelten zusätzlich'],
		'notes' => ['label' => 'Notizen', 'write' => true, 'changes' => 'Native Notizen lesen, anlegen und versionsgebunden bearbeiten; Originaldatei und eigene Bildanhänge prüfen; ausgewählte Bilder mit zusätzlichem Dateileserecht kopieren; Text importieren/exportieren mit Dateirechten; gezieltes Löschen eigener Notizen und ausdrücklich eingeschlossener Bilder nur mit zusätzlichem Papierkorbrecht'],
		'tasks' => ['label' => 'Aufgaben', 'write' => true, 'changes' => 'VTODO-Listen lesen; eigene reine Listen anlegen und Eigenschaften pflegen; eigenständige Aufgaben anlegen, bearbeiten, erledigen und gezielt löschen; zusätzliche Aufgabenrechte und native Rechte nötig'],
		'contacts' => ['label' => 'Kontakte', 'write' => true, 'changes' => 'Adressbücher und Kontakte lesen; Kontakte anlegen, versionsgebunden bearbeiten und gezielt löschen; eigene Adressbücher anlegen/benennen/beschreiben; einzelne vCard bis128KiB mit Dateirechten exportieren oder nach gebundener Vorschau mit Download-/Kontaktschreibrecht neu importieren; UID erhalten, keine Dublettenverschmelzung, Sammelimporte oder Adressbuchfreigaben'],
		'calendar' => ['label' => 'Kalender', 'write' => true, 'changes' => 'Einzeltermine mit Uhrzeit oder ganztägig anlegen, bearbeiten und löschen; eine lokale DISPLAY-Erinnerung pflegen; eigene Terminkalender anlegen und Name/Beschreibung/Farbe/Reihenfolge ändern; vollständige eigene Belegung und freie Zeitfenster prüfen; einfache begrenzte Serien im eigenen Kalender anlegen, Originalserie lesen, Titel/Beschreibung/Ort oder einfache Regel der Masterserie versionsgebunden ändern und bestätigtes Originalvorkommen ausschließen; keine Einladungen oder komplexen Einzelabweichungen; ausgewählte Kalenderoriginale als neue ICS-Datei sichern und einzelne unterstützte ICS-Datei nach Vorschau gezielt neu importieren, mit Datei-/Downloadrechten und UID-/Kalenderpapierkorbprüfung'],
		'mindmap' => ['label' => 'Mindmap', 'write' => true, 'changes' => 'Mindmaps und Knoten ergänzen, bearbeiten und verknüpfen; benötigt auch Dateirechte'],
		'tables' => ['label' => 'Tabellen', 'write' => true, 'changes' => 'Unterstützte Tabellen, Spalten und Datensätze anlegen und bearbeiten'],
		'mail' => ['label' => 'Mail', 'write' => false, 'changes' => 'Nur Lesen; kein Versand und keine Entwürfe'],
		'talk' => ['label' => 'Talk', 'write' => false, 'changes' => 'Nur Räume und Nachrichten lesen; kein Versand'],
		'announcements' => ['label' => 'Mitteilungen', 'write' => false, 'changes' => 'Nur Lesen; keine Veröffentlichung'],
		'inventory' => ['label' => 'Inventory', 'write' => true, 'changes' => 'Nur bei aktiver Cloud-App und zusätzlicher Gerätefreigabe; diese Auswahl aktiviert oder installiert die App nicht'],
	];
	public static function defaults(): array {
		return ['version' => 1, 'configured' => false, 'enabled' => true,
			'apps' => array_replace(array_map(fn($a) => $a['write'] ? 'write' : 'read', self::APPS), ['notes' => 'off', 'tasks' => 'off', 'contacts' => 'off'])];
	}
	public static function modes(array $apps): array {
		$keys = array_keys($apps); sort($keys);
		$all = array_keys(self::APPS);
		$legacy10 = array_values(array_diff($all, ['tasks', 'contacts']));
		$legacy9 = array_values(array_diff($all, ['notes', 'tasks', 'contacts']));
		sort($all); sort($legacy10); sort($legacy9);
		if ($keys !== $all && $keys !== $legacy10 && $keys !== $legacy9) { throw new PlatformDenied('permission_apps_invalid'); }
		foreach (['notes', 'tasks', 'contacts'] as $newApp) { if (!array_key_exists($newApp, $apps)) { $apps[$newApp] = 'off'; } }
		$out = [];
		foreach (self::APPS as $key => $info) {
			$mode = $apps[$key];
			if (!is_string($mode) || !in_array($mode, ['off', 'read', 'write'], true) || ($mode === 'write' && !$info['write'])) { throw new PlatformDenied('permission_mode_invalid'); }
			$out[$key] = $mode;
		}
		return $out;
	}
}
