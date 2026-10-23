# Online-Connector 1.31.1 – Quellpaket

Dieses Paket veröffentlicht den zusammengehörigen Nextcloud-Teil des Online-Connectors unter **AGPL-3.0-or-later**. Ausgangspunkt ist der erhaltene Betriebscheckpoint `ca1fb50642c0b3cab7c5f9d898e36fba7befdf38`. Es enthält Anwendung, MCP-/OAuth-Adapter, gemeinsame Bibliotheken, Browser-Erweiterung und die zum Bauen benötigten Eingaben.

Dies ist eine **bereinigte Quellfassung**: Beispiele ersetzen Installationsadressen und persönliche Verweise; historische Wartungsskripte sind zusätzlich gesperrt. Sie ist deshalb kein byteidentischer Export des laufenden Workers und kein automatisch auszurollendes Update. Die Änderungen jeder übernommenen Datei stehen in [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json).

| Bereich | Enthalten |
|---|---|
| `app/`, `lib/`, `worker/` | Oberfläche, OAuth, MCP-Werkzeuge, Nextcloud-Adapter und gemeinsame Kerne |
| `browser/`, `snapshots/` | Bearbeitbare Browser-Quellen und die benötigte frühere JSLoader-Grundlage |
| `ops/` | Vom Worker angebotene historische Wartungsprogramme und vorhandene Tables-Quellen; Grenzen in [LEGACY_OPS.md](LEGACY_OPS.md) |
| `tests/` | Ausgewählte isolierte JavaScript-/Python-Prüfungen; kein Zugriff auf gespeicherte Live-Zugangsdaten |
| `config/`, `.openai/hosting.json` | Leere Zugangsdaten und Beispiele ohne fremde Site-Identität |

[BUILD.md](BUILD.md) beschreibt Aufbau, Prüfungen und Betriebsgrenzen. [DEPENDENCIES.json](DEPENDENCIES.json) und [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ordnen Fremdsoftware zu. [TEST_RESULTS.json](TEST_RESULTS.json) hält die tatsächlich ausgeführten Prüfungen fest. Quellarchive können mit `python3 tools/package.py --output /tmp/novaspace-online-source.tar.gz` erzeugt werden.

Die native Plattform-App wird [separat](../../nextcloud/platform/README.md) veröffentlicht. Weitere native Apps, der vollständige persönliche LM-Studio-Anschluss und die private Entwicklungshistorie werden durch dieses Paket nicht als veröffentlicht erklärt. Die vorbereitete Version 1.32 ist kein Bestandteil dieses Checkpoints.

Für diese AGPL-Dateien ist keine zusätzliche kommerzielle Erlaubnis nötig. Gesonderte kommerzielle Bedingungen bleiben rechtlich eigenständigen eigenen Komponenten vorbehalten; dieses Paket behauptet keine solche Abtrennung. Fremdsoftware behält ihre Lizenz.
