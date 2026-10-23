# NovaSpace Plattformgrundlage · App-Quellpaket

Quellaufnahme vom **23. Oktober 2026**: App-Metadaten **0.4.0**, Hilfeänderungen bis **0.4.0-ui.7** und native GitHub-Brücke **0.1.0**. Der zusammengeführte Baum liegt in [app/](app/). Er umfasst die eigenen Klassen, Migrationen, Ansichten, Styles und das App-Symbol einschließlich der zuvor einzeln veröffentlichten GitHub-Brücke.

**Lizenz der eigenen Dateien: AGPL-3.0-or-later.** Der vollständige Text liegt in [LICENSE](LICENSE) und für das App-Paket zusätzlich in [app/LICENSE](app/LICENSE). Die beiden unveränderten Nextcloud-Testschnittstellen behalten ihre jeweiligen SPDX-Hinweise und Copyright-Angaben; siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Umfang und Stand

- Native Identitätsprüfung für Websitzungen und persönliche App-Passwörter.
- Persönliche Registrierung, Freigaben, Widerruf und Konfigurationsverlauf.
- Bestehender begrenzter Inventory-Adapter mit expliziter Freigabe und Versions-/Quellprüfung; daraus folgt keine allgemeine Freigabe für andere Inventory-Versionen.
- Native GitHub-Brücke für Präsentationen und bereits vorhandene persönliche Deck-GitHub-Zuordnungen.

Das Paket veröffentlicht den zusammengeführten **App-Quellstand zur Prüfung und Testinstallation**. Es ist noch kein abgenommenes Produktionsupdate und kein veröffentlichtes Nextcloud-App-Store-Release. Online-Connector und persönlicher LM-Studio-Anschluss sind eigene Komponenten.

## Abgleich mit dem erhaltenen Einbaubeleg

Von 23 Basisdateien stimmen 21 Originaldateien exakt mit dem erhaltenen ui.7-Einbaubeleg überein. Die Änderung des Gateway-Prüfers ist durch das bestehende GitHub-Einbaupaket und seine Vorher-/Nachher-Hashes belegt. Die vier darin enthaltenen Dateien stimmen mit den aufgenommenen Quellen überein; seine Route wurde identisch in den App-Baum übernommen.

**Offener Punkt:** Der Hash der erhaltenen `appinfo/info.xml` stimmt nicht mit dem Einbaubeleg überein. Die bekannte Quelldatei mit Version 0.4.0 wird unverändert erhalten. Die fehlende Bytegleichheit und ein frischer Vergleich mit der laufenden Installation bleiben ausdrücklich offen. Dieses Paket darf deshalb nicht als nachgewiesen identische Kopie des aktuellen Betriebs oder als freigegebener Aktualisierungspfad bezeichnet werden.

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

Die Veröffentlichung wurde mit isoliertem PHP 8.3 über PHP-WASM geprüft: 32 PHP-Dateien syntaktisch gültig; vorhandene Identitäts-, Registry-/Freigabe-, Inventory- und GitHub-Prüfungen erfolgreich. Zusätzliche Prüfungen bestätigen die eindeutige POST-Route und die gesperrte Beispielkonfiguration. Ergebnisse und Grenzen stehen in [TEST_RESULTS.json](TEST_RESULTS.json).

Als Nächstes folgen der Metadatenabgleich und eine isolierte praktische Nextcloud-Testinstallation mit Datenbankmigrationen, HTTP-/CSRF-Prüfung sowie Wiederanlauf/Widerruf. Eine solche Abnahme wurde mit den Fixture-Prüfungen nicht durchgeführt. Die laufende Installation wurde für diese Quellveröffentlichung nicht verändert.
