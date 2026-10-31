<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;

/** Presentation only. Permission IDs and the canonical catalogue stay unchanged. */
final class ConnectionLabels {
    public const BRAND = 'NovaSpace KI Connector';
    public static function connection(string $label): string {
        if (preg_match('/^(?:NovaForge|NovaSpace)(?:[ -]+(?:Cloud|KI))?[ -]+(?:Connector|Konnektor)$/iu', trim($label))) return self::BRAND;
        return $label;
    }
    public static function title(array $tool): string {
        $text = $tool['title'];
        if ($text === $tool['name']) {
            $text = match ($tool['name']) {
                'github_connection_status' => 'GitHub-Verbindung prüfen',
                'github_deck_sync_status' => 'GitHub-Abgleich prüfen',
                'github_list_repositories' => 'GitHub-Repositories auflisten',
                'github_read_presentation' => 'GitHub-Präsentation lesen',
                default => $text,
            };
        }
        $text = preg_replace('/\b(?:Nextcloud|NovaForge|NovaSpace)[\s-]*/iu', '', $text);
        if ($tool['app'] === 'deck') {
            $text = preg_replace_callback('/\bDeck-?(karten?|boards?|listen?|kommentare?)/iu',
                static fn($m) => mb_strtoupper(mb_substr($m[1], 0, 1), 'UTF-8') . mb_substr($m[1], 1), $text);
            $text = preg_replace('/\bDeck(?:-|\s+)/u', '', $text);
        }
        $text = preg_replace('/^Genau\s+(?:ein(?:e|en|em|er)?|d(?:er|ie|as|en|em))\s+/iu', '', $text);
        $text = preg_replace('/^(?:Ein|Eine|Einen|Einem|Einer|Der|Die|Das|Den)\s+/u', '', $text);
        $text = preg_replace('/^(?:beauftragten|Vorhandene|Moderne)\s+/u', '', $text);
        $text = str_replace(['für eine Karte', 'Dateizuordnung abtrennen'], ['für Karte', 'Dateizuordnung lösen'], $text);
        $text = trim(preg_replace('/\s+/u', ' ', $text));
        return mb_strtoupper(mb_substr($text, 0, 1), 'UTF-8') . mb_substr($text, 1);
    }
    public static function rows(array $catalogue, string $area): array {
        $rows = array_values(array_filter($catalogue['tools'], fn($t) => !$t['legacy'] && $t['area'] === $area));
        foreach ($rows as &$row) $row['displayTitle'] = self::title($row);
        unset($row);
        $collator = class_exists(\Collator::class) ? new \Collator('de_DE') : null;
        if ($collator !== null) { $collator->setStrength(\Collator::PRIMARY); $collator->setAttribute(\Collator::NUMERIC_COLLATION, \Collator::ON); }
        $fold = static fn($s) => strtr(mb_strtolower($s, 'UTF-8'), ['ä'=>'a','ö'=>'o','ü'=>'u','ß'=>'ss']);
        usort($rows, static function($a, $b) use ($collator, $fold) {
            $n = $collator !== null ? $collator->compare($a['displayTitle'], $b['displayTitle']) : strnatcasecmp($fold($a['displayTitle']), $fold($b['displayTitle']));
            return $n ?: strcmp($a['name'], $b['name']);
        });
        return $rows;
    }
}
