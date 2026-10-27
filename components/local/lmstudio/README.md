# Persönlicher LM-Studio-Anschluss – Quellstand 1.35.1

Dieses Paket enthält die bereinigten eigenen Nextcloud-Quellen des persönlichen Kerns **1.35.1-local.1** und der Themenauswahl **0.1.13**, Revision 13, unter **AGPL-3.0-or-later**. Es stammt aus dem tatsächlich ausgelieferten Original-ZIP; dessen Hash und alle drei Dateimanifeste wurden vor der Aufarbeitung vollständig geprüft.

| Bestandteil | Belegter Stand |
|---|---|
| Gemeinsamer Ausgangskern | Online 1.35.1, 200 Werkzeugverträge, Quellcheckpoint `96e68f12cdfc9ea9482cd646983fbdd5f809f2b7` |
| Persönlicher Kern | 1.35.1-local.1, 172 Werkzeuge; gehostete Transferwege und kontogebundene Cloud-Funktionen ausgeschlossen |
| Themenauswahl | 0.1.13, 171 explizit auswählbare Werkzeuge; 18 kombinierbare Themen-/Zusatzschalter |
| SDK-Laufzeit | LM Studio SDK 1.5.0, eigener unveränderter Apache-2.0-Lizenztext und gesperrte Abhängigkeiten |
| Einbau des Originalpakets | Durch die vom Nutzer bereitgestellte Windows-Abschlussausgabe mit Code 0 belegt; gezielter persönlicher Konto-/Versions-/Hilfe-/Ordnerlesetest vom Nutzer zurückgemeldet; keine allgemeine Modellabnahme durch diese Quellveröffentlichung |

Die gemeinsame [Online-Quellfassung1.35](../../online/connector/README.md) enthält zusätzlich gehostete und kontogebundene Funktionen. GitHub-Werkzeuge und GitHub-Scopes bleiben im persönlichen Anschluss ausgeblendet. Die vier Projektwerkzeuge erscheinen bei gemeinsam gewählten Bereichen Mindmap und Deck. Die vorhandenen lokalen und nativen Rechte gelten weiterhin.

Enthalten sind bearbeitbare Adapter, gemeinsame Bibliotheken, Themenauswahl, Launcher, historische Installationsquellen, ausgewählte Tests, vollständige Lizenzunterlagen und sichere Beispiele. Generierte Bündel, historische kompilierte Testfixtures, `node_modules`, private Betriebsberichte und Zugangsdaten werden nicht öffentlich übernommen. [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) ordnet jede übernommene Datei ihrer Archivquelle und den dokumentierten Änderungen zu. [DEPENDENCIES.json](DEPENDENCIES.json) und [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) erhalten die Fremdzuordnung.

**Grenze:** Der vorhandene Anschluss verwendet weiterhin einen älteren Windows-DPAPI-Startweg aus `nextcloud-mcp-connector` 0.1.13. Dieser externe Launcher samt geschütztem Zugang ist nicht im Original-ZIP enthalten; die Grundlage ist gesondert zugeordnet; der persönliche Wrapper bleibt offen. Deshalb ist diese Veröffentlichung eine prüfbare Quelllieferung mit ausdrücklich benannter Voraussetzung und kein vollständig eigenständiger Erstinstaller. Aktive Installationsaufrufe sind in der Quellfassung standardmäßig gesperrt.

[BUILD.md](BUILD.md) beschreibt die reproduzierbaren Schritte und Grenzen. [TEST_RESULTS.json](TEST_RESULTS.json) dokumentiert die hier tatsächlich ausgeführten Prüfungen. Die Verzeichnisnamen `nextcloud-local-candidate` und `topics-candidate` stammen aus dem erhaltenen Paket; sie erklären keine neue Ausgabe als installiert.

Die eigenen Dateien dieser konkreten Nextcloud-Anbindung einschließlich Themenauswahl erhalten die vereinbarte AGPL-Zuordnung. Die Apache-/MIT-/MPL-/ISC-Bedingungen der Fremdsoftware bleiben erhalten. Gesonderte kommerzielle Bedingungen für andere rechtlich eigenständige eigene Komponenten werden durch diese Veröffentlichung nicht vorweggenommen.
