# Quellstand1.35 · Fortschreibung27. Oktober2026

Online1.35.0, persönlich1.35.0-local.1/Themen0.1.12 und native Projekte0.2.12 sind als aufbereitete eigene AGPL-Quellen aufgenommen. Der genaue Umfang, Eingangs- und Veröffentlichungshashes stehen in den Komponenten-SOURCE_PROVENANCE.json-Dateien. Beispiele ersetzen Betriebsadressen; private Betriebsberichte, Zugangsdaten, erzeugte Bündel und vollständige private Historie gehören nicht zu dieser Quellveröffentlichung.

[Update1.35](updates/1.35.0.md) beschreibt den bestätigten Einbau, die lesende API und den persönlichen LM-Studio-Lesetest. Eine erste gemeinsame Projektanlage im persönlichen Anschluss wurde erfolgreich zurückgemeldet. Diese begrenzte Pilotabnahme beruht auf der Ergebnisrückmeldung des Clients; weitere Inhalts- und Wiederaufnahmeprüfungen bleiben offen. Komponentenberichte beschreiben weiterhin ihre zum Veröffentlichungszeitpunkt ausgeführten isolierten Quellprüfungen und übernehmen diese praktische Rückmeldung nicht als neuen Quelltest.

Der ältere öffentliche Plattform-/GitHub-Brücken-Snapshot wird hier nicht stillschweigend als aktueller Betriebsquellstand ausgegeben. Sein eigener bisheriger Integrationsnachweis bleibt auf die dort dokumentierten Versionen begrenzt. Der persönliche DPAPI-Wrapper und ein unabhängiger Erstinstallationsweg bleiben gesonderte Arbeit; der vorhandene Herkunftsnachtrag gilt weiterhin.

---

## Historische Quellaufnahmen bis25. Oktober2026

Die folgenden unveränderten Angaben beschreiben frühere Snapshots und deren damalige Grenzen. Für den oben genannten aktuellen Umfang sind die neuen Komponentenberichte maßgeblich.

# Quellaufnahme und Veröffentlichungsstand

Stand: **24. Oktober 2026**. Führende Arbeit: [Aufgabe #4](https://github.com/Windwanderer74/novaspace-connector/issues/4).

## Aktueller Betrieb und veröffentlichte Quellen

Im bestehenden Arbeitsumfeld sind inzwischen Online **1.32.0**, persönlicher Kern **1.32.0-local.1**, Themenauswahl **0.1.11** und native Apphilfe/Policy **0.4.0-ui.8** eingebaut. Der Windows-Installer endete mit Abschlusscode 0; Neustart und sichtbare Konnektoren sind vom Nutzer bestätigt. Der Modell-Funktionstest und die vollständige Bedienungsabnahme stehen noch aus.

Diese Statusfortschreibung aktualisiert die unten beschriebenen Quellpakete nicht. Deren öffentliche Snapshots bleiben Online **1.31.1** und persönlich **1.31.0-local.1 / Themen 0.1.10**. Passende bereinigte 1.32-Quellen und ein öffentliches Downloadpaket sind noch gesondert nachzuführen. [Datierter Einbau- und Prüfstand](updates/1.32.0.md).

Die folgenden Abschnitte dokumentieren die bisherigen Quellaufnahmen und die damaligen Prüfgrenzen. Aussagen über einen damals nicht vorgenommenen Einbau beziehen sich auf diese historischen Quelllieferungen.

## Erhaltener Ausgangsstand

Der aufgenommene Quellbestand enthält 461 versionierte Dateien und 93 erreichbare Commits bis `ca1fb50642c0b3cab7c5f9d898e36fba7befdf38`. Der Arbeitsbaum war bei der Aufnahme unverändert. Dieser Checkpoint entspricht dem getrennten Online-Lieferstand **1.31.1**.

Der damalige vorbereitete Entwicklungsstand **1.32** bleibt im erhaltenen Checkpoint `c7fe8522131d72cf057586888dc28682096895aa` getrennt. Er ist ein historischer Vorbereitungsstand und kein Nachweis für die inzwischen aktualisierte Installation oder die noch ausstehende Gesamtabnahme.

Das öffentliche Repository erhält ausgewählte, geprüfte Quellstände mit Herkunftsnachweis. Die vollständige bisherige Historie wird erst nach einer eigenständigen Veröffentlichungsprüfung übernommen. Interne Installationskonfigurationen und generierte Betriebspakete werden nicht ungeprüft als allgemeine App-Pakete ausgegeben.

## Komponentenaufnahme

| Bereich im vorhandenen Quellbestand | Bisheriger Befund | Veröffentlichung / nächster Schritt |
|---|---|---|
| Native GitHub-Brücke 0.1.0 | Drei PHP-Klassen; vorhandener reiner Kerntest; Einbindung in die NovaSpace-Plattform-App | [Erstes AGPL-Quellmodul](../components/nextcloud/github-bridge/README.md) mit vollständigem Lizenztext und Dateiherkunft veröffentlicht |
| Native Plattform-App | [Zusammengeführter App-Quellbaum](../components/nextcloud/platform/README.md) mit Hilfe ui.7 und GitHub-Brücke, AGPL-Zuordnung, Fremdhinweisen, sicherer Beispielkonfiguration und Paketierung | Quellabgleich abgeschlossen; frische Nextcloud-Installationen 34.0.4/35.0.0 mit PHP 8.3.6/MariaDB 10.11.14 jeweils 36/36 native Prüfungen erfolgreich; Updatepfad und externe Zusatz-App-Abläufe gesondert offen |
| Weitere native Nextcloud-Erweiterungen | Weitere App-/Integrationsstände und vorbereitete Quellen im Bestand | Als eigene Komponenten mit vollständiger Herkunft, Lizenz, Abhängigkeiten und Einbaugrenzen prüfen |
| Browser-/Nextcloud-Integration | Direkte Nutzung von `@nextcloud/files`; tatsächlicher Browser-Aufbau erfasst 17 Fremdpakete und 14 eigene Quellen | Bearbeitbare Quellen und benötigte JSLoader-Grundlage im [Online-Quellpaket](../components/online/connector/README.md); Bundle-Aufbau geprüft, keine generierten Bündel im Quellarchiv |
| Online-Connector und gemeinsame Bibliotheken | Bereinigter Snapshot aus Betriebscheckpoint 1.31.1, einschließlich Anwendung, MCP/OAuth, Worker und gemeinsamer Kerne | Als zusammengehöriger eigener Nextcloud-Teil unter AGPL-3.0-or-later veröffentlicht; dateigenaue Herkunft, inaktive Konfiguration, Bauanleitung und Fremdhinweise liegen bei; unabhängige kommerzielle Abtrennung nicht behauptet |
| Persönlicher LM-Studio-Anschluss und Themenauswahl | Original-ZIP 1.31.0-local.1 vollständig gehasht, drei Manifeste mit 1750/124/1615 Einträgen geprüft; dokumentierter Windows-Einbau von Kern 1.31.0-local.1/Themen 0.1.10 | [Bereinigtes Quellpaket](../components/local/lmstudio/README.md) mit 200 Dateien, Lizenz, Herkunft, gesperrten Installationsaufrufen, Lockfiles und Bauanleitung veröffentlicht; älterer externer DPAPI-Startweg bleibt gesonderte offene Voraussetzung |
| Installer, Tests, Vorlagen und Betriebsdateien | Mischung aus Quellmaterial, generierten Bündeln, Prüfhilfen und installationsbezogener Konfiguration | Für jedes Auslieferungspaket benötigte Quellen auswählen, sichere Beispiele erstellen und Herkunft/Lizenzen erhalten |

Die veröffentlichten Snapshots haben dateigenaue Herkunfts- und Lizenzzuordnungen. Die vollständige bisherige Git-Historie, weitere native Apps und der ältere externe lokale DPAPI-Startweg sind damit nicht vollständig aufgearbeitet. Ein allgemein installierbares Gesamtprodukt ist noch nicht abgeschlossen.

## Abhängigkeiten

Das vorhandene Lockfile unterscheidet unter anderem MIT-, Apache-2.0-, MPL-2.0-, GPL-/LGPL- und AGPL-Einträge. Ein Eintrag allein beweist noch nicht, dass ein Paket im jeweiligen Auslieferungsweg enthalten ist. Build-Werkzeuge, Browser-Bündel, Server-Betrieb und native App werden deshalb getrennt geprüft.

Für die Browser-Integration ist `@nextcloud/files` als **AGPL-3.0-or-later** erfasst; `ical.js` ist als **MPL-2.0** erfasst. Vor weiteren Paketen müssen die tatsächlich mitgelieferten Dateien, ihre Änderungen und erforderlichen Hinweise zugeordnet werden. Für das erste PHP-Quellmodul werden keine dieser JavaScript-Abhängigkeiten gebündelt.

## Online-Quelllieferung 1.31.1

Das [Online-Quellpaket](../components/online/connector/README.md) übernimmt 214 ausgewählte Quelldateien aus dem erhaltenen Betriebscheckpoint. Zusätzliche Dateien liefern Lizenz, sichere Konfiguration, Bauanleitung, Herkunft und Prüfergebnisse. Aktive Installationsadressen, persönliche Verweise und Hosting-Identität werden nicht übernommen. Die historische Pflege von Tabellen-/PDF-Brücken ist als installationsgebundener Code enthalten; acht unmittelbar angebotene PHP-Programme stoppen zusätzlich vor Bootstrap und Passwortabfrage. Zwei Installer-Vorlagen enthalten bewusst noch Ersetzungsmarker und sind keine eigenständig ausführbaren PHP-Dateien.

Der gesperrte Abhängigkeitsstand installiert erfolgreich. Worker und Browser-Erweiterung lassen sich bauen. **503/503 isolierte JavaScript-Prüfungen**, **2/2 Prüfungen der gebauten Ausgabe**, **16/16 Python-Prüfungen**, **20 PHP-Syntaxprüfungen** und die Sperre aller **8** historischen CLI-Programme sind erfolgreich. Zwei historische Tests wurden an die bereits bestehende Implementierung angepasst: 158 Werkzeuge anstelle von 152, Version 1.31.1 anstelle von 1.21.1 und vorhandenes Papierkorb-Löschen. Die Anwendung wurde dafür nicht geändert. [TEST_RESULTS.json](../components/online/connector/TEST_RESULTS.json) benennt die genauen Grenzen.

Die Quellfassung ist wegen der dokumentierten Bereinigung kein byteidentisches Produktionsarchiv. Sie enthält keine produktiven Zugangsdaten, keinen Git-Historienimport und keinen fertig eingerichteten unabhängigen Login-Host. Die bestehende Hosting-Anmeldung und feste Pilot-/Kontogrenzen sind in BUILD.md und LEGACY_OPS.md beschrieben. Es wurde keine laufende Installation aktualisiert und die vorbereitete Version 1.32 nicht ausgeliefert. Der persönliche LM-Studio-Lieferstand ist inzwischen im folgenden Abschnitt als eigener Quellsnapshot zusammengeführt; sein älterer externer DPAPI-Startweg, erfolgreiche externe Zusatz-App-Abläufe, native Updates und der begrenzte GitHub-Pilot bleiben eigene Abnahmen.

## Persönliche Quelllieferung 1.31.0-local.1 / Themen 0.1.10

Ausgangspunkt ist das erhaltene Original-ZIP `NovaSpace-Connector-LMStudio-1.31.0-local.1.zip`, SHA256 `9375e7bc1f7189bc3f624f6308ec3bff03de9fc850577704e2b7dab5c7b2a7db`, 4.927.405 Byte, 1.751 Dateien. Der Archivhash und alle drei enthaltenen Manifeste wurden vollständig geprüft. Die vom Nutzer bereitgestellte Windows-Ausgabe bestätigt den ursprünglichen Einbau mit Abschlusscode 0. Die ältere Aussage im Paket, der Einbau sei noch nicht bestätigt, beschreibt den damaligen Vorbereitungsstand und wird nicht als aktueller Befund übernommen.

142 ausgewählte ursprüngliche Dateien sind dateigenau zugeordnet. Mit ergänzten Bauhilfen, Lockfiles, Beispielen, Lizenz-/Fremdunterlagen und Prüfberichten umfasst das reproduzierbare öffentliche Quellarchiv 200 Dateien. 83 von 84 gemeinsamen Bibliotheksdateien stimmen bytegenau mit dem aufgezeichneten Online-Checkpoint 1.31.0 überein; die einzige ursprüngliche Adapteränderung ist die optionale Serverinjektion in `mcp.ts`. Der lokale Katalog bleibt 130, die Themenauswahl 129. Die Online-1.31.1-GitHub-Brücke und vorbereitete 1.32-Funktionen werden nicht übernommen.

Beide Quellkomponenten bauen erfolgreich. **21 lokale JavaScript-, 20 Themen-/SDK- und 16 Python-Prüfungen** bestehen, einschließlich aller 16.384 Themenkombinationen, realer SDK-Konfigurationsprüfung und echter lokaler MCP-Kindprozesse mit synthetischen Netzwerkantworten. Die Standardsperren aller drei historischen Installer stoppen vor Konfigurations- und Zugangsdatenzugriff. Der Kern verwendet 39 gesperrte Abhängigkeitseinträge mit unveränderten ursprünglichen Versionen/Paketquellen/Integritätswerten; die Themen verwenden 55 Einträge aus dem ursprünglichen Entwicklungs-Lockfile. Alle 13 ursprünglich vendorten SDK-Laufzeitversionen stimmen überein. [Prüfbericht](../components/local/lmstudio/TEST_RESULTS.json).

Der ältere Windows-DPAPI-Startweg aus `nextcloud-mcp-connector` 0.1.13 ist eine tatsächlich im Startcode geprüfte externe Voraussetzung. Die Python-Grundlage ist inzwischen am dokumentierten Installationscommit ef6c481db897e1409b9e83dc0602ccbb3f73cf6b mit Version 0.1.13, AGPL-3.0-or-later, Einstieg und Upstream-Lockfile nachgewiesen; der [datierte Herkunftsnachtrag](LEGACY_STARTUP_SOURCE.md) ergänzt den unveränderten Snapshot. Offen bleiben der genaue persönliche Wrapper-Quellcode und die tatsächlich installierte Windows-Paketinventur; das Upstream-Lockfile ist dafür kein Ersatz. Persönliche geschützte Zugangsdaten wurden nicht gelesen oder kopiert. Deshalb wird kein unabhängiger Erstinstaller und keine frische Windows-/Modellabnahme behauptet. Zwei historische Kerninstaller-Testdateien mit früheren kompilierten Binärfixtures sind ausgeschlossen; ihre ursprüngliche Abnahme wird nicht als neu ausgeführt ausgegeben. Die originale Library-ZIP und die laufende Installation bleiben unverändert. Nächste offene Quellgrenze ist der ältere DPAPI-Startweg; weitere native Komponenten, Historienprüfung, Updates und GitHub-Pilot bleiben eigene Schritte.

## Nativer Quellabgleich und Neuinstallation

Das native [App-Quellpaket](../components/nextcloud/platform/README.md) führt die benötigten Klassen und GitHub-Einbauänderungen nun zusammen. Eigener AGPL-Lizenztext, erhaltene Fremdhinweise, inaktive Beispielkonfiguration, Entwicklungsprüfungen und reproduzierbare Quell-/App-Archive sind enthalten.

Der anschließend bereitgestellte lesende SSH-Nachweis enthält die vollständigen Metadaten und SHA-256-Hashes aller 26 gemeldeten App-Dateien. Sämtliche Hashes stimmen mit dem rekonstruierten Betriebsstand überein; es fehlen keine erwarteten Dateien und es gibt keine zusätzlichen gemeldeten Dateien. Die frühere `info.xml`-Abweichung betrifft ausschließlich `max-version="35"` anstelle von `34`. Das Quellpaket übernimmt die belegte XML-Datei bytegenau. [DEPLOYED_SOURCE_CHECK.json](../components/nextcloud/platform/DEPLOYED_SOURCE_CHECK.json) hält die Herkunft des vom Nutzer bereitgestellten Nachweises und die Grenzen des Vergleichs fest. Dieser Dateiabgleich ist ein eigener Nachweis; die anschließend ausgeführten nativen Neuinstallationen sind in [INTEGRATION_RESULTS.json](../components/nextcloud/platform/INTEGRATION_RESULTS.json) dokumentiert.

Zwei vollständige frische Nextcloud-Installationen (34.0.4 und 35.0.0) wurden anschließend mit PHP 8.3.6 und MariaDB 10.11.14 ausgeführt. Beide bestehen jeweils 36 native Prüfungen einschließlich echter Migrationen, Anmeldung, HTTP/CSRF, Freigabe/Widerruf und Webserver-Neustart. Die abgesicherte Abwesenheit der optionalen GitHub-/Inventory-Apps wurde geprüft; erfolgreiche externe App-Operationen und ein Update einer bestehenden Installation bleiben getrennte Abnahmen. Andere Laufzeitkombinationen werden damit nicht pauschal freigegeben. Bis dahin ist das Quellpaket kein freigegebenes Produktionsupdate und kein App-Store-Release. Die weitere Connector-Quellübernahme bleibt als eigener Arbeitsumfang offen.
