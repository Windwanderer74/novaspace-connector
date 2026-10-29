# Aufbau, Prüfungen und Voraussetzungen

Geprüft unter Linux x86_64 mit Node.js 24.22.1, npm 11.9.0 und Python 3.12. Die erzeugten JavaScript-Bündel zielen wie im Original auf Node 22. Aus dem Verzeichnis dieser Komponente:

```sh
npm run install:ci
npm run build
npm test
python3 nextcloud-local-candidate/tests/test_launcher.py
python3 topics-candidate/tests/test_installer.py
python3 tests/test_coordinator.py
```

Beide Teilpakete besitzen ein eigenes Lockfile. Für den Kern wurde das große erhaltene Online-Lockfile auf die benötigten direkten Abhängigkeiten reduziert; alle verbleibenden Versionen, Paketquellen und Integritätswerte stimmen mit dem Original überein. Für die Themenauswahl wird das erhaltene Entwicklungs-Lockfile verwendet. Dessen SDK-/Runtime-Versionen werden mit dem ursprünglichen vendorten Paketbestand verglichen. Ein SDK ist Apache-2.0 und wird nicht in eine eigene Lizenz umetikettiert.

`npm run build` erzeugt zunächst den Kern und dessen 183 Werkzeugverträge ohne Kontozugang. Anschließend entsteht `plugin.cjs` mit externem `@lmstudio/sdk`, damit der LM-Studio-Bootstrap und die Konfigurationsschemata dieselbe SDK-Instanz verwenden. Die aktuelle Kern-Ausgabe wird als Kindprozess-Testfixture bereitgestellt. Dieser Ablauf liest keine vorhandene LM-Studio-Konfiguration und veröffentlicht nichts.

Quellarchiv nach Prüfung erzeugen:

```sh
python3 tools/package.py --output /tmp/novaspace-lmstudio-source.tar.gz
```

Das Archiv verwendet ausschließlich das geprüfte Dateimanifest; `node_modules`, generierte Bündel, temporäre Testdateien und lokale Konfiguration sind ausgeschlossen. Ein so erzeugtes Quellarchiv ist kein direkt in Windows installierbares Updatepaket.

## Historischer Windows-Startweg

Der Originalanschluss setzt Windows, vorhandenes Node ab 22, die bestehende Python-Installation mit `nextcloud-mcp-connector` 0.1.13 und den bereits bestätigten DPAPI-Launcher voraus. `start_local.py` prüft dessen Dateihash und startet ihn; der bestehende geschützte Zugang wird ausschließlich durch diesen Launcher beschafft und an den Kindprozess übergeben. Das öffentliche Paket enthält weder den persönlichen Launcher noch geschützte Zugangsdaten. Die Python-Grundlage ist im Herkunftsnachtrag zugeordnet; persönlicher Wrapper und tatsächliche installierte Paketinventur bleiben offen.

`config/local.example.json` enthält inaktive Beispiele. Die historische Hostbindung und die Kontoprüfungen sind in der öffentlichen Fassung auf Beispiele umgesetzt; daraus wird keine allgemeine Mehrbenutzer- oder Erstinstallation behauptet. Die zentralen Cloud-App-Schalter steuern den alten persönlichen Anschluss **nicht**. Lokal gelten das geprüfte native Konto, lokale Scopes und die Themenauswahl. Rechte werden durch diese Veröffentlichung nicht erweitert.

Die drei direkten historischen Installer (`update_connector.py`, `nextcloud-local-candidate/install.py`, `topics-candidate/install_topics.py`) stoppen ohne `NOVASPACE_ENABLE_HISTORICAL_INSTALLERS=I_REVIEWED_THE_SOURCE` bereits vor ihrer normalen Ablaufprüfung. Der Schalter ist kein Installationsauftrag und macht die Quellen nicht für eine beliebige Installation geeignet. Die bisherigen Vorgängerpins und Aktualisierungsbedingungen bleiben erhalten. Kein Befehl der obigen Bau-/Prüfanleitung aktiviert diesen Schalter. Die PowerShell-Quellen dokumentieren den alten Aufrufweg; es wird kein neuer Ein-Klick-Starter ausgeliefert.

## Was die Prüfungen belegen

Der aktuelle öffentliche Quellstand wurde gebaut. 176 Kernprüfungen und
40 Themen-/SDK-Prüfungen sind erfolgreich. Darin werden alle **524.288**
Schalterkombinationen auf ihre Werkzeugauswahl geprüft. Das sind keine
entsprechend vielen Modellgespräche. Verwendet wurden vorhandene gesperrte
Bauabhängigkeiten; eine frische Installation aller Abhängigkeiten wurde nicht
abgenommen. Frühere Prüfläufe stehen separat in TEST_RESULTS.json.

Der erfolgreiche Windows-Einbau ist ein eigener Betriebsnachweis. Die allgemeine
Modell- und Bedienungsabnahme sowie der unabhängige Erstinstallationsweg bleiben
gesondert offen.

## Fortschreibung 29. Oktober 2026

Aktueller Beta-Quellstand: Online1.36.0, persönlich1.36.0-local.1, Themen0.1.17.
Paket1:29/32; A01/A02/Z01 offen. Ältere Prüfzahlen oben sind historische
Nachweise und werden nicht als aktuelle Wiederholung ausgegeben. Der aktuelle
Prüfumfang steht in TEST_RESULTS.json und im [Update](../../../docs/updates/1.36.0.md).
