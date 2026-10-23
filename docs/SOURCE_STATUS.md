# Quellaufnahme und Veröffentlichungsstand

Stand: **23. Oktober 2026**. Führende Arbeit: [Aufgabe #4](https://github.com/Windwanderer74/novaspace-connector/issues/4).

## Erhaltener Ausgangsstand

Der aufgenommene Quellbestand enthält 461 versionierte Dateien und 93 erreichbare Commits bis `ca1fb50642c0b3cab7c5f9d898e36fba7befdf38`. Der Arbeitsbaum war bei der Aufnahme unverändert. Dieser Checkpoint entspricht dem getrennten Online-Lieferstand **1.31.1**.

Die vorbereitete Entwicklung **1.32** bleibt im erhaltenen Checkpoint `c7fe8522131d72cf057586888dc28682096895aa` getrennt. Diese Übersicht erklärt sie nicht zu einem ausgelieferten oder abgenommenen Release.

Das öffentliche Repository erhält ausgewählte, geprüfte Quellstände mit Herkunftsnachweis. Die vollständige bisherige Historie wird erst nach einer eigenständigen Veröffentlichungsprüfung übernommen. Interne Installationskonfigurationen und generierte Betriebspakete werden nicht ungeprüft als allgemeine App-Pakete ausgegeben.

## Komponentenaufnahme

| Bereich im vorhandenen Quellbestand | Bisheriger Befund | Veröffentlichung / nächster Schritt |
|---|---|---|
| Native GitHub-Brücke 0.1.0 | Drei PHP-Klassen; vorhandener reiner Kerntest; Einbindung in die NovaSpace-Plattform-App | [Erstes AGPL-Quellmodul](../components/nextcloud/github-bridge/README.md) mit vollständigem Lizenztext und Dateiherkunft veröffentlicht |
| Native Plattform-App | [Zusammengeführter App-Quellbaum](../components/nextcloud/platform/README.md) mit Hilfe ui.7 und GitHub-Brücke, AGPL-Zuordnung, Fremdhinweisen, sicherer Beispielkonfiguration und Paketierung | Quellabgleich abgeschlossen; frische Nextcloud-Installationen 34.0.4/35.0.0 mit PHP 8.3.6/MariaDB 10.11.14 jeweils 36/36 native Prüfungen erfolgreich; Updatepfad und externe Zusatz-App-Abläufe gesondert offen |
| Weitere native Nextcloud-Erweiterungen | Weitere App-/Integrationsstände und vorbereitete Quellen im Bestand | Als eigene Komponenten mit vollständiger Herkunft, Lizenz, Abhängigkeiten und Einbaugrenzen prüfen |
| Browser-/Nextcloud-Integration | Unter anderem direkte Nutzung von `@nextcloud/files`; generierte Bündel enthalten weitere Lizenzhinweise | Zugehörige Quellen, erforderliche Build-Eingaben und vollständige Fremdhinweise gemeinsam prüfen; keine pauschale proprietäre Zuordnung |
| Online-Connector und gemeinsame Bibliotheken | Anwendung, Protokolladapter und gemeinsame Hilfsfunktionen im Quellbestand; keine übergreifende Lizenzangabe im bisherigen Paketmanifest | Tatsächliche Abhängigkeiten und Ableitungen prüfen, Quell- und Auslieferungsgrenzen bestimmen; gesonderte kommerzielle Bedingungen nur bei rechtlicher Eigenständigkeit |
| Persönlicher LM-Studio-Anschluss und Themenauswahl | Eigener Versions-/Einbaustand; lokale Vorbereitungen und Betriebsnachweise sind vom Online-Stand getrennt | Tatsächlich ausgeliefertes Quellpaket samt Build-Eingaben und Fremdhinweisen zusammenführen |
| Installer, Tests, Vorlagen und Betriebsdateien | Mischung aus Quellmaterial, generierten Bündeln, Prüfhilfen und installationsbezogener Konfiguration | Für jedes Auslieferungspaket benötigte Quellen auswählen, sichere Beispiele erstellen und Herkunft/Lizenzen erhalten |

Diese Aufnahme ist eine Bestands- und Arbeitsübersicht. Die vollständige dateigenaue Lizenzprüfung und der vollständige installierbare Connector sind damit noch nicht abgeschlossen.

## Abhängigkeiten

Das vorhandene Lockfile unterscheidet unter anderem MIT-, Apache-2.0-, MPL-2.0-, GPL-/LGPL- und AGPL-Einträge. Ein Eintrag allein beweist noch nicht, dass ein Paket im jeweiligen Auslieferungsweg enthalten ist. Build-Werkzeuge, Browser-Bündel, Server-Betrieb und native App werden deshalb getrennt geprüft.

Für die Browser-Integration ist `@nextcloud/files` als **AGPL-3.0-or-later** erfasst; `ical.js` ist als **MPL-2.0** erfasst. Vor weiteren Paketen müssen die tatsächlich mitgelieferten Dateien, ihre Änderungen und erforderlichen Hinweise zugeordnet werden. Für das erste PHP-Quellmodul werden keine dieser JavaScript-Abhängigkeiten gebündelt.

## Nächste überprüfbare Lieferung

Das native [App-Quellpaket](../components/nextcloud/platform/README.md) führt die benötigten Klassen und GitHub-Einbauänderungen nun zusammen. Eigener AGPL-Lizenztext, erhaltene Fremdhinweise, inaktive Beispielkonfiguration, Entwicklungsprüfungen und reproduzierbare Quell-/App-Archive sind enthalten.

Der anschließend bereitgestellte lesende SSH-Nachweis enthält die vollständigen Metadaten und SHA-256-Hashes aller 26 gemeldeten App-Dateien. Sämtliche Hashes stimmen mit dem rekonstruierten Betriebsstand überein; es fehlen keine erwarteten Dateien und es gibt keine zusätzlichen gemeldeten Dateien. Die frühere `info.xml`-Abweichung betrifft ausschließlich `max-version="35"` anstelle von `34`. Das Quellpaket übernimmt die belegte XML-Datei bytegenau. [DEPLOYED_SOURCE_CHECK.json](../components/nextcloud/platform/DEPLOYED_SOURCE_CHECK.json) hält die Herkunft des vom Nutzer bereitgestellten Nachweises und die Grenzen des Vergleichs fest. Dieser Dateiabgleich ist ein eigener Nachweis; die anschließend ausgeführten nativen Neuinstallationen sind in [INTEGRATION_RESULTS.json](../components/nextcloud/platform/INTEGRATION_RESULTS.json) dokumentiert.

Zwei vollständige frische Nextcloud-Installationen (34.0.4 und 35.0.0) wurden anschließend mit PHP 8.3.6 und MariaDB 10.11.14 ausgeführt. Beide bestehen jeweils 36 native Prüfungen einschließlich echter Migrationen, Anmeldung, HTTP/CSRF, Freigabe/Widerruf und Webserver-Neustart. Die abgesicherte Abwesenheit der optionalen GitHub-/Inventory-Apps wurde geprüft; erfolgreiche externe App-Operationen und ein Update einer bestehenden Installation bleiben getrennte Abnahmen. Andere Laufzeitkombinationen werden damit nicht pauschal freigegeben. Bis dahin ist das Quellpaket kein freigegebenes Produktionsupdate und kein App-Store-Release. Die weitere Connector-Quellübernahme bleibt als eigener Arbeitsumfang offen.
