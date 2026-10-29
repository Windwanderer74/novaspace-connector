# Online-Connector 1.36.0 – Quellpaket

Dieses Paket veröffentlicht den zusammengehörigen Nextcloud-Teil des Online-Connectors unter **AGPL-3.0-or-later**. Ausgangspunkt ist der erhaltene Betriebscheckpoint `e2fd91539d4ba5855646f18eefd06e03609a957a`. Es enthält Anwendung, MCP-/OAuth-Adapter, gemeinsame Bibliotheken, Browser-Erweiterung und die zum Bauen benötigten Eingaben.

Dies ist eine **bereinigte Quellfassung**: Beispiele ersetzen Installationsadressen und persönliche Verweise; historische Wartungsskripte sind zusätzlich gesperrt. Sie ist deshalb kein byteidentischer Export des laufenden Workers und kein automatisch auszurollendes Update. Die Änderungen jeder übernommenen Datei stehen in [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json).

| Bereich | Enthalten |
|---|---|
| `app/`, `lib/`, `worker/` | Oberfläche, OAuth, MCP-Werkzeuge, Nextcloud-Adapter und gemeinsame Kerne |
| `browser/`, `snapshots/` | Bearbeitbare Browser-Quellen und die benötigte frühere JSLoader-Grundlage |
| `ops/` | Vom Worker angebotene historische Wartungsprogramme und vorhandene Tables-Quellen; Grenzen in [LEGACY_OPS.md](LEGACY_OPS.md) |
| `tests/` | Ausgewählte isolierte JavaScript-/Python-Prüfungen; kein Zugriff auf gespeicherte Live-Zugangsdaten |
| `config/`, `.openai/hosting.json` | Leere Zugangsdaten und Beispiele ohne fremde Site-Identität |

[BUILD.md](BUILD.md) beschreibt Aufbau, Prüfungen und Betriebsgrenzen. [DEPENDENCIES.json](DEPENDENCIES.json) und [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ordnen Fremdsoftware zu. [TEST_RESULTS.json](TEST_RESULTS.json) hält die tatsächlich ausgeführten Prüfungen fest. Quellarchive können mit `python3 tools/package.py --output /tmp/novaspace-online-source.tar.gz` erzeugt werden.

Die native Plattform-App wird [separat](../../nextcloud/platform/README.md) veröffentlicht. Diese Komponente allein enthält keine anderen nativen Apps oder persönliche Installation; die private Entwicklungshistorie wird nicht importiert. Die native Projekt-App0.2.13 wird [als eigene Komponente](../../nextcloud/projects/README.md) veröffentlicht. Der persönliche Anschluss 1.36 ist eine getrennte Quellkomponente.

Für diese AGPL-Dateien ist keine zusätzliche kommerzielle Erlaubnis nötig. Gesonderte kommerzielle Bedingungen bleiben rechtlich eigenständigen eigenen Komponenten vorbehalten; dieses Paket behauptet keine solche Abtrennung. Fremdsoftware behält ihre Lizenz.

## Fortschreibung 29. Oktober 2026

Aktueller Beta-Quellstand: Online1.36.0, persönlich1.36.0-local.1, Themen0.1.17.
Paket1:29/32; A01/A02/Z01 offen. Ältere Prüfzahlen oben sind historische
Nachweise und werden nicht als aktuelle Wiederholung ausgegeben. Der aktuelle
Prüfumfang steht in TEST_RESULTS.json und im [Update](../../../docs/updates/1.36.0.md).
