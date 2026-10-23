# Persönlicher LM-Studio-Anschluss – Quellstand 1.31

Dieses Paket enthält die bereinigten eigenen Nextcloud-Quellen des persönlichen Kerns **1.31.0-local.1** und der Themenauswahl **0.1.10**, Revision 10, unter **AGPL-3.0-or-later**. Es stammt aus dem tatsächlich ausgelieferten Original-ZIP; dessen Hash und alle drei Dateimanifeste wurden vor der Aufarbeitung vollständig geprüft.

| Bestandteil | Belegter Stand |
|---|---|
| Gemeinsamer Ausgangskern | Online 1.31.0, 152 Werkzeugverträge, Quellcheckpoint `b075743785986a9be91a1d1f4d7cad7c878c914a` |
| Persönlicher Kern | 1.31.0-local.1, 130 Werkzeuge; gehostete Transferwege und kontogebundene Cloud-Funktionen ausgeschlossen |
| Themenauswahl | 0.1.10, 129 explizit auswählbare Werkzeuge; 14 kombinierbare Themen-/Zusatzschalter |
| SDK-Laufzeit | LM Studio SDK 1.5.0, eigener unveränderter Apache-2.0-Lizenztext und gesperrte Abhängigkeiten |
| Einbau des Originalpakets | Durch die vom Nutzer bereitgestellte Windows-Abschlussausgabe mit Code 0 belegt; keine neue Windows-/Modellabnahme durch diese Veröffentlichung |

Die neuere [Online-Quellfassung 1.31.1](../../online/connector/README.md) besitzt sechs zusätzliche GitHub-Werkzeuge. Sie werden hier nicht nachträglich in den persönlichen Anschluss eingebaut. Auch die vorbereitete Entwicklung 1.32 ist kein Bestandteil dieser Quellfassung.

Enthalten sind bearbeitbare Adapter, gemeinsame Bibliotheken, Themenauswahl, Launcher, historische Installationsquellen, ausgewählte Tests, vollständige Lizenzunterlagen und sichere Beispiele. Generierte Bündel, historische kompilierte Testfixtures, `node_modules`, private Betriebsberichte und Zugangsdaten werden nicht öffentlich übernommen. [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) ordnet jede übernommene Datei ihrer Archivquelle und den dokumentierten Änderungen zu. [DEPENDENCIES.json](DEPENDENCIES.json) und [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) erhalten die Fremdzuordnung.

**Grenze:** Der vorhandene Anschluss verwendet weiterhin einen älteren Windows-DPAPI-Startweg aus `nextcloud-mcp-connector` 0.1.13. Dieser externe Launcher samt geschütztem Zugang ist nicht im Original-ZIP enthalten; sein passendes Quellpaket wurde bei der gezielten Suche bisher nicht gefunden. Deshalb ist diese Veröffentlichung eine prüfbare Quelllieferung mit ausdrücklich benannter Voraussetzung und kein vollständig eigenständiger Erstinstaller. Aktive Installationsaufrufe sind in der Quellfassung standardmäßig gesperrt.

[BUILD.md](BUILD.md) beschreibt die reproduzierbaren Schritte und Grenzen. [TEST_RESULTS.json](TEST_RESULTS.json) dokumentiert die hier tatsächlich ausgeführten Prüfungen. Die Verzeichnisnamen `nextcloud-local-candidate` und `topics-candidate` stammen aus dem erhaltenen Paket; sie erklären keine neue Ausgabe als installiert.

Die eigenen Dateien dieser konkreten Nextcloud-Anbindung einschließlich Themenauswahl erhalten die vereinbarte AGPL-Zuordnung. Die Apache-/MIT-/MPL-/ISC-Bedingungen der Fremdsoftware bleiben erhalten. Gesonderte kommerzielle Bedingungen für andere rechtlich eigenständige eigene Komponenten werden durch diese Veröffentlichung nicht vorweggenommen.
