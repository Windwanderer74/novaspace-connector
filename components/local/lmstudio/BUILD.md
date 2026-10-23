# Aufbau, Prüfungen und Voraussetzungen

Geprüft unter Linux x86_64 mit Node.js 24.19.0, npm 11.9.0 und Python 3.12. Die erzeugten JavaScript-Bündel zielen wie im Original auf Node 22. Aus dem Verzeichnis dieser Komponente:

```sh
npm run install:ci
npm run build
npm test
python3 nextcloud-local-candidate/tests/test_launcher.py
python3 topics-candidate/tests/test_installer.py
python3 tests/test_coordinator.py
```

Beide Teilpakete besitzen ein eigenes Lockfile. Für den Kern wurde das große erhaltene Online-Lockfile auf die benötigten direkten Abhängigkeiten reduziert; alle verbleibenden Versionen, Paketquellen und Integritätswerte stimmen mit dem Original überein. Für die Themenauswahl wird das erhaltene Entwicklungs-Lockfile verwendet. Dessen SDK-/Runtime-Versionen werden mit dem ursprünglichen vendorten Paketbestand verglichen. Ein SDK ist Apache-2.0 und wird nicht in eine eigene Lizenz umetikettiert.

`npm run build` erzeugt zunächst den Kern und dessen 130 Werkzeugverträge ohne Kontozugang. Anschließend entsteht `plugin.cjs` mit externem `@lmstudio/sdk`, damit der LM-Studio-Bootstrap und die Konfigurationsschemata dieselbe SDK-Instanz verwenden. Die aktuelle Kern-Ausgabe wird als Kindprozess-Testfixture bereitgestellt. Dieser Ablauf liest keine vorhandene LM-Studio-Konfiguration und veröffentlicht nichts.

Quellarchiv nach Prüfung erzeugen:

```sh
python3 tools/package.py --output /tmp/novaspace-lmstudio-source.tar.gz
```

Das Archiv verwendet ausschließlich das geprüfte Dateimanifest; `node_modules`, generierte Bündel, temporäre Testdateien und lokale Konfiguration sind ausgeschlossen. Ein so erzeugtes Quellarchiv ist kein direkt in Windows installierbares Updatepaket.

## Historischer Windows-Startweg

Der Originalanschluss setzt Windows, vorhandenes Node ab 22, die bestehende Python-Installation mit `nextcloud-mcp-connector` 0.1.13 und den bereits bestätigten DPAPI-Launcher voraus. `start_local.py` prüft dessen Dateihash und startet ihn; der bestehende geschützte Zugang wird ausschließlich durch diesen Launcher beschafft und an den Kindprozess übergeben. Das öffentliche Paket enthält weder den persönlichen Launcher noch geschützte Zugangsdaten. Der fehlende externe Quellen-/Abhängigkeitsnachweis bleibt offen.

`config/local.example.json` enthält inaktive Beispiele. Die historische Hostbindung und die Kontoprüfungen sind in der öffentlichen Fassung auf Beispiele umgesetzt; daraus wird keine allgemeine Mehrbenutzer- oder Erstinstallation behauptet. Die zentralen Cloud-App-Schalter steuern den alten persönlichen Anschluss **nicht**. Lokal gelten das geprüfte native Konto, lokale Scopes und die Themenauswahl. Rechte werden durch diese Veröffentlichung nicht erweitert.

Die drei direkten historischen Installer (`update_connector.py`, `nextcloud-local-candidate/install.py`, `topics-candidate/install_topics.py`) stoppen ohne `NOVASPACE_ENABLE_HISTORICAL_INSTALLERS=I_REVIEWED_THE_SOURCE` bereits vor ihrer normalen Ablaufprüfung. Der Schalter ist kein Installationsauftrag und macht die Quellen nicht für eine beliebige Installation geeignet. Die bisherigen Vorgängerpins und Aktualisierungsbedingungen bleiben erhalten. Kein Befehl der obigen Bau-/Prüfanleitung aktiviert diesen Schalter. Die PowerShell-Quellen dokumentieren den alten Aufrufweg; es wird kein neuer Ein-Klick-Starter ausgeliefert.

## Was die Prüfungen belegen

21 lokale JavaScript-Prüfungen kontrollieren Werkzeugverträge, Scopes, Kontoprüfung, Antwortschemas und stdio. 20 Themen-/SDK-Prüfungen verwenden die echte SDK-Klasse, alle 16.384 Schalterkombinationen sowie echte lokale MCP-Kindprozesse mit synthetischen HTTP-Antworten. Drei Launcher-, neun Themeninstaller- und vier Koordinatorprüfungen simulieren ihre Umgebung und Änderungen. Die drei CLI-Sperren werden zusätzlich direkt ohne Freigabe ausgeführt. Keine produktiven Konten, Zugangsdaten oder LM-Studio-Instanz werden dabei geöffnet.

Zwei alte Kerninstaller-Testdateien setzen ausgeschlossene frühere kompilierte Kerne voraus und werden hier nicht als ausführbare Tests ausgeliefert. Die bereits im Einbauprotokoll belegten ursprünglichen Installerprüfungen werden nicht als neu wiederholt ausgegeben. Ein echter aktueller Windows-/DPAPI-/LM-Studio-Lauf, sichtbare Schalter, Modellaufrufe, Bilddarstellung, Laufzeitabnahme und ein unabhängiger Erstinstallationspfad bleiben getrennte Aufgaben.
