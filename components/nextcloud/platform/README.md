# NovaSpace Plattform-App 0.5.0

Stand: **31. Oktober 2026**. Die App-Seite des **NovaSpace Connectors** erhält
Einzelberechtigungen je KI-Verbindung. Unter **Arbeit**, **Kommunikation** und
**Verwaltung** stehen 19 Bereiche mit Dropdowns und aufklappbaren Funktionen.
Eine Einzelauswahl kann den Bereich weiter einschränken; Hauptschalter,
Bereichsrahmen, ursprüngliche Connectorrechte und native Objektfreigaben gelten
zusätzlich. Die Detailwahl bleibt beim Ausschalten erhalten.

Die Regeln werden beim tatsächlichen MCP-Aufruf durchgesetzt. Voraussetzung für
den Online-Anschluss ist dessen Rechteauswertung **1.37.0** oder ein entsprechend
kompatibler Gateway. Gespeicherte Freigaben erteilen neuen Werkzeugnamen keine
automatischen Rechte. Die zusätzliche Tabelle `ns_pf_tool_access` speichert die
Einzelauswahl; bestehende Verbindungen werden beim Update nicht neu angelegt.

- [App-Paket 0.5.0 herunterladen](../../../downloads/novaspace-platform-app-0.5.0.tar.gz)
- [SHA-256-Prüfsumme](../../../downloads/SHA256SUMS.txt)
- [Kleine Live-Testreihe: 3/3 bestanden](LIVE-TEST.md)
- [Einbau und Konfiguration](INSTALL.md)
- [Quellen und Prüfumfang](SOURCE_PROVENANCE.json) · [Prüfberichte](TEST_RESULTS.json)

Der konkrete Updatepilot **0.4.0 → 0.5.0** wurde auf Nextcloud **35.0.2.2**,
PHP **8.5.12** und MySQL/MariaDB ausgeführt: private Quell-/Datenbanksicherung,
native Migration, Dateirückvergleich und unveränderte bestehende Verbindungsdaten
wurden bestätigt. Danach wurden Speichern/Neuladen, gezielte Sperre, weiter
mögliches Kartenlesen und Wiederfreigabe live geprüft. Das ist eine begrenzte
Beta-Abnahme an einer bestehenden Verbindung. Frühere frische Serverprüfungen
unten behalten ihre damaligen Versionen; neue Nutzer und weitere Clients sind
weiterer Arbeitsumfang.

Die veröffentlichten Vertrauensdateien sind inaktive Beispiele. Vorhandene eigene
Gateway-Konfiguration bleibt beim Update installationsbezogen zu erhalten.
Die eigenen Quellen stehen weiterhin unter **AGPL-3.0-or-later**.

## Pakete selbst erzeugen

Mit `python3 tools/package.py /tmp/novaspace-platform-050` werden nach Prüfung des
Dateimanifests das vollständige Quellarchiv und das App-Archiv erzeugt.
`node tests/run.mjs` führt die PHP-Fixtures mit lokalem PHP/OpenSSL/PDO_SQLite aus.
Die neue Suite `tests/platform-functions-native.php` enthält **61** Prüfungen.
Der Katalog wird im Online-Quellpaket mit
`node scripts/build-connection-functions.mjs --check` gegen beide Komponenten geprüft.

## Historische Quell- und Integrationsnachweise bis 29. Oktober 2026

# NovaSpace Plattformgrundlage · App-Quellpaket

## Aktuelle Quellfortschreibung · 29. Oktober 2026

Appmetadaten bleiben **0.4.0**. Enthalten sind jetzt die Kalenderhilfe
**0.4.0-ui.9** und **0.4.0-scope.1**: Die signierte Scope-Liste darf bis64 statt32
Einträge enthalten; Signatur-, Identitäts- und Rechteprüfungen bleiben erhalten.
Nur ConnectionPolicy.php, die Verbindungsvorlage und GatewayVerifier.php werden
für diesen Stand nachgeführt. Die inaktive öffentliche Vertrauenskonfiguration
bleibt erhalten. Frühere Integrationsberichte unten bleiben historische Nachweise;
daraus wird keine frische Neuinstallation dieses Quellupdates behauptet.


Quellaufnahme vom **23. Oktober 2026**: App-Metadaten **0.4.0**, Hilfeänderungen bis **0.4.0-ui.7** und native GitHub-Brücke **0.1.0**. Der zusammengeführte Baum liegt in [app/](app/). Er umfasst die eigenen Klassen, Migrationen, Ansichten, Styles und das App-Symbol einschließlich der zuvor einzeln veröffentlichten GitHub-Brücke.

**Lizenz der eigenen Dateien: AGPL-3.0-or-later.** Der vollständige Text liegt in [LICENSE](LICENSE) und für das App-Paket zusätzlich in [app/LICENSE](app/LICENSE). Die beiden unveränderten Nextcloud-Testschnittstellen behalten ihre jeweiligen SPDX-Hinweise und Copyright-Angaben; siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Umfang und Stand

- Native Identitätsprüfung für Websitzungen und persönliche App-Passwörter.
- Persönliche Registrierung, Freigaben, Widerruf und Konfigurationsverlauf.
- Bestehender begrenzter Inventory-Adapter mit expliziter Freigabe und Versions-/Quellprüfung; daraus folgt keine allgemeine Freigabe für andere Inventory-Versionen.
- Native GitHub-Brücke für Präsentationen und bereits vorhandene persönliche Deck-GitHub-Zuordnungen.

Das Paket veröffentlicht den zusammengeführten **App-Quellstand zur Prüfung und Testinstallation**. Es ist noch kein abgenommenes Produktionsupdate und kein veröffentlichtes Nextcloud-App-Store-Release. Online-Connector und persönlicher LM-Studio-Anschluss sind eigene Komponenten.

## Abgleich mit dem belegten Betriebsstand

Der ursprüngliche Einbaubeleg und die später bereitgestellte lesende SSH-Ausgabe sind gemeinsam ausgewertet. Die aktuelle Ausgabe enthält die vollständige `info.xml` und SHA-256-Hashes aller **26 gemeldeten App-Dateien**. Alle 26 passen zum rekonstruierten Betriebsstand, einschließlich GitHub-Route, GitHub-Klassen und Gateway-Prüfer. Es fehlen keine erwarteten Dateien und es gibt keine zusätzlichen gemeldeten Dateien.

Die Metadatenabweichung ist aufgelöst: Die Betriebsdatei enthält `max-version="35"` statt `34`; sämtliche anderen Bytes der XML-Datei stimmen überein. Das Quellpaket übernimmt diese Datei mit dem belegten Hash `f06fdf8b1f960e3a34de22bd18a93c9569e690cf77b47ceefc922e5574b9097d`. Die deklarierte Spanne **Nextcloud 34–35** ist zunächst ein übernommener Metadateneintrag. Die nachfolgende native Integrationsprüfung ergänzt ihn um Nachweise für zwei konkrete Kombinationen.

Der Vergleich beruht auf der vom Nutzer bereitgestellten Ausgabe, nicht auf einem unabhängigen direkten Serverzugriff der Assistenz. [DEPLOYED_SOURCE_CHECK.json](DEPLOYED_SOURCE_CHECK.json) hält den Nachweis fest. Die unten beschriebenen bewussten Veröffentlichungsänderungen bleiben bestehen; insbesondere werden aktive Vertrauensdaten nicht ausgeliefert.

Für die Veröffentlichung wurden SPDX-Zeilen ergänzt, die Testpfade angepasst und Testkonten durch allgemeine Namen ersetzt. Die Online-Hilfe verweist auf die veröffentlichte [Integrationsanleitung](INSTALL.md). Die produktive Vertrauenskonfiguration wurde durch inaktive Beispiele mit leerem öffentlichem Schlüssel ersetzt. Die eigentliche App-Implementierung wurde ansonsten beibehalten. [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) dokumentiert die Dateizuweisung und die offenen Grenzen.

## Prüfen und Pakete erzeugen

Die PHP-Quellen und Styles liegen direkt vor; Composer oder ein JavaScript-Build werden für diesen App-Baum nicht benötigt. Zum Ausführen der Entwicklungsprüfungen werden **Node.js sowie PHP 8.3 mit OpenSSL und PDO_SQLite** benötigt:

```sh
node tests/run.mjs
```

Der Prüflauf erzeugt ausschließlich einen kurzlebigen lokalen Testschlüssel und entfernt ihn anschließend. Er verwendet Testdoubles und eine SQLite-Datenbank im Speicher. Ein anderer PHP-Pfad kann über `NF_PHP_BINARY` gewählt werden. Die Tests installieren keine Nextcloud-App und rufen GitHub nicht auf.

Mit Python 3 lassen sich aus den geprüften Manifestdateien zwei reproduzierbare Archive erzeugen:

```sh
python3 tools/package.py /tmp/novaspace-platform-packages
```

Das Skript prüft zuerst [SHA256SUMS.json](SHA256SUMS.json). Es erzeugt ein vollständiges Quellarchiv und ein getrenntes App-Archiv mit dem Verzeichnis `novaspace_platform/`. Das App-Archiv enthält den Lizenztext, aber keine Entwicklungsfixtures oder echten Vertrauensschlüssel. Ein Archiv allein bestätigt keine erfolgreiche Installation.

## Nachweise und nächste Abnahme

Die isolierten PHP-Fixture-Prüfungen bleiben in [TEST_RESULTS.json](TEST_RESULTS.json) dokumentiert. Sie umfassen 32 syntaktisch gültige PHP-Dateien und die vorhandenen Identitäts-, Registry-/Freigabe-, Inventory- und GitHub-Kernprüfungen.

Zusätzlich wurde die App in zwei vollständigen frischen Nextcloud-Installationen mit echten Datenbankmigrationen und HTTP-Anfragen geprüft:

| Nextcloud | PHP | Datenbank | Ergebnis |
|---|---|---|---|
| 34.0.4 | 8.3.6 | MariaDB 10.11.14 | **36/36 erfolgreich** |
| 35.0.0 | 8.3.6 | MariaDB 10.11.14 | **36/36 erfolgreich** |

Installation und App-Aktivierung, sechs Migrationstabellen, native Anmeldung, persönliche Registrierung, CSRF-Abwehr, Identitätstrennung, Hauptschalter, idempotente Wiederholungen, veraltete Formulare, Widerruf und tatsächlicher Webserver-Neustart sind damit für diese Kombinationen belegt. Die App-Implementierung musste dafür nicht geändert werden.

[INTEGRATION_RESULTS.json](INTEGRATION_RESULTS.json) enthält die Ergebnisse und die Hashes der geprüften App-Dateien. [integration/README.md](integration/README.md) beschreibt den ebenfalls erhaltenen Testaufbau. Testpasswörter, aktive Schlüssel und Rohprotokolle sind nicht Bestandteil der Veröffentlichung.

Die externen GitHub-/Inventory-Apps waren nicht installiert; ihre abgesicherte Abwesenheit ist geprüft. Erfolgreiche externe App-Operationen, ein Update einer bestehenden Installation sowie andere PHP-/Datenbank-/Webserverkombinationen bleiben eigene Abnahmen. Die laufende Installation wurde durch diese Tests nicht verändert.
