# NovaSpace KI Connector · App 0.6.0 · 31. Oktober 2026

Die Verwaltungsseite heißt **NovaSpace KI Connector**. Funktionsnamen sind kurz,
ohne redundante Produktpräfixe, alphabetisch nach deutscher Sortierung geordnet
und mit **„Lesen / Prüfen“** beziehungsweise **„Ändern“** gekennzeichnet.
Arbeit, Kommunikation, Verwaltung und alle19 Bereichskennungen bleiben erhalten.

Dropdowns und Häkchen speichern nach ungefähr 500 ms Pause automatisch. Eine
beim Scrollen sichtbare Statusleiste bestätigt die Speicherung nach geprüfter
Serverantwort. Schnelle Änderungen werden geordnet verarbeitet. Bei unklarem
Ergebnis gibt es eine bewusste identische Wiederholung; Versionskonflikte stoppen.
Der manuelle Speicherweg bleibt als Rückfall verfügbar.

Der neue POST-Endpunkt nutzt dieselben nativen Eigentümer-, CSRF-, Versions-
und Transaktionsprüfungen. Keine neuen Zugriffsrechte oder Tabellenmigrationen.
Bestehende Verbindungen, persönliche Namen und Einzelrechte bleiben erhalten.

| Kleine produktive Live-Testreihe | Ergebnis |
| --- | --- |
| Ausgangs-Kommentarabruf und unabhängiges Kartenlesen erlaubt | Bestanden |
| Einzelrecht automatisch ausgeschaltet, nach Neuladen erhalten; echter Kommentarabruf gesperrt, Kartenlesen weiter möglich | Bestanden |
| Automatisch wieder eingeschaltet, nach Neuladen erhalten; Kommentarabruf wieder erlaubt und ursprüngliche Policy vollständig wiederhergestellt | Bestanden |

**3/3 bestanden.** [Kurzer Testbericht](../../components/nextcloud/platform/LIVE-TEST.md).
Bestandsupdate0.5.0→0.6.0 auf Nextcloud 35.0.2.2/PHP 8.5.12 mit privater Quellen-/
Datenbanksicherung und unveränderten Daten aller sieben Plattformtabellen bestätigt.
Die Probe betrifft eine bestehende Verbindung; weitere Installations-/
Mehrbenutzerabläufe und sämtliche Fachwerkzeuge wurden damit nicht pauschal abgenommen.

[App herunterladen](../../downloads/novaspace-platform-app-0.6.0.tar.gz) ·
[Quellarchiv](../../downloads/novaspace-platform-source-0.6.0.tar.gz) ·
[Prüfsummen](../../downloads/SHA256SUMS.txt) ·
[App-Quellen und Einbauhinweise](../../components/nextcloud/platform/README.md).

Die Veröffentlichung enthält inaktive Gateway-Beispiele. Online-Connector 1.37.0
und persönlicher LM-Studio-Kern1.36.3-local.1/Plugin0.1.26 behalten ihren Stand.
Paket 1 bleibt im vereinbarten Beta-Umfang 32/32 abgenommen.
