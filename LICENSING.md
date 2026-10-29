# Lizenzzuordnung

Stand: **29. Oktober 2026**.

Die Lizenz gilt jeweils für die ausdrücklich zugeordneten Dateien. Dieses Repository enthält die native GitHub-Brücke, das zusammengeführte native App-Quellpaket, bereinigte Online-/LM-Studio-Quellfassungen sowie die Projekt- und Entwicklungsdokumentation.

| Veröffentlichter Bestandteil | Zuordnung | Lizenztext |
|---|---|---|
| Native GitHub-Brücke 0.1.0: PHP-Dateien unter `components/nextcloud/github-bridge/src/` und `components/nextcloud/github-bridge/tests/` | **AGPL-3.0-or-later** | [Vollständiger Lizenztext](components/nextcloud/github-bridge/LICENSE) |
| Native Plattform-App: eigene Dateien unter `components/nextcloud/platform/`, einschließlich App-Quellen, Assets, Prüfhilfen und Dokumentation | **AGPL-3.0-or-later** | [Vollständiger Lizenztext](components/nextcloud/platform/LICENSE) |
| Online-Connector 1.36.0: eigene Dateien unter `components/online/connector/`, einschließlich Browser-Integration, gemeinsamer Kerne, Bauhilfen und Dokumentation | **AGPL-3.0-or-later**; die Zuordnung jeder übernommenen Datei ist dokumentiert | [Lizenztext](components/online/connector/LICENSE) · [Dateiherkunft](components/online/connector/SOURCE_PROVENANCE.json) |
| Persönlicher LM-Studio-Anschluss: eigene Quellen von Kern 1.36.0-local.1, Themenauswahl 0.1.17 und zugehörigen Hilfen unter `components/local/lmstudio/` | **AGPL-3.0-or-later** als konkrete eigene Nextcloud-Anbindung; kein neuer kommerzieller Lizenzvertrag | [Lizenztext](components/local/lmstudio/LICENSE) · [Dateiherkunft](components/local/lmstudio/SOURCE_PROVENANCE.json) |
| Native Projekt-App0.2.13: eigene Dateien unter `components/nextcloud/projects/` | **AGPL-3.0-or-later** | [Lizenztext](components/nextcloud/projects/LICENSE) · [Dateiherkunft](components/nextcloud/projects/SOURCE_PROVENANCE.json) |
| Unveränderte lokale Fremdhinweise und separat bezogene SDK-/Bibliothekspakete | Jeweilige Upstream-Lizenz, darunter Apache-2.0 für LM Studio SDK 1.5.0 und MPL-2.0 für ical.js | [Lokale Fremdhinweise](components/local/lmstudio/THIRD_PARTY_NOTICES.md) |
| Unveränderte Fremdhinweise unter `components/online/connector/THIRD_PARTY_LICENSES/` und beim Aufbau bezogene Fremdsoftware | Jeweilige Upstream-Lizenz; keine pauschale Umbenennung in AGPL | [Fremdhinweise](components/online/connector/THIRD_PARTY_NOTICES.md) · [Abhängigkeiten](components/online/connector/DEPENDENCIES.json) |
| Unveränderte Nextcloud-Testschnittstelle `components/nextcloud/platform/tests/fixtures/platform-native/IProvider.php` | **AGPL-3.0-only**, bestehende Hinweise bleiben erhalten | [Fremdhinweise](components/nextcloud/platform/THIRD_PARTY_NOTICES.md) |
| Unveränderte Nextcloud-Testschnittstelle `components/nextcloud/platform/tests/fixtures/platform-native/IToken.php` | **AGPL-3.0-or-later**, bestehende Hinweise bleiben erhalten | [Fremdhinweise](components/nextcloud/platform/THIRD_PARTY_NOTICES.md) |

Für die veröffentlichten AGPL-Bestandteile ist keine zusätzliche kommerzielle Erlaubnis erforderlich. Auch eine kommerzielle Nutzung richtet sich nach den Rechten und Pflichten der AGPL. Kostenpflichtige Einrichtung, Wartung oder Betrieb können daneben angeboten werden.

Für weitere AGPL-gebundene beziehungsweise entsprechend eingebundene Nextcloud-Bestandteile ist ebenfalls eine AGPL-konforme Veröffentlichung vorgesehen. Die Online-/Browser-Quellen und der konkrete persönliche Nextcloud-Anschluss werden als eigene zusammengehörige Projektteile unter AGPL veröffentlicht. Das ist die gewählte Zuordnung; die bloße Nutzung einer Nextcloud-API oder eines SDK wird damit nicht als allgemeine gesetzliche Lizenzpflicht ausgegeben. Weitere native Komponenten bleiben eigene Quelllieferungen. Die externe Python-Grundlage `nextcloud-mcp-connector` 0.1.13 ist inzwischen am dokumentierten Installationscommit mit AGPL-3.0-or-later nachgewiesen; [Herkunft und Abhängigkeiten](docs/LEGACY_STARTUP_SOURCE.md) sind gesondert erfasst. Sie wird hier nicht gebündelt oder neu lizenziert. Der zusätzliche persönliche Windows-DPAPI-Wrapper und die tatsächlich installierte Python-Umgebung bleiben als Quellen-/Inventurprüfung offen.

Für rechtlich eigenständige eigene Bestandteile können gesonderte kommerzielle Nutzungs- und Weiterverwendungsbedingungen vorgesehen werden, soweit Rechte und Abhängigkeiten dies erlauben. Die bloße Einordnung außerhalb von Nextcloud genügt dafür nicht. Solche weiteren Bestandteile werden hier noch nicht unter einer kommerziellen Lizenz ausgeliefert; konkrete Vertragsbedingungen sind damit nicht vorweggenommen.

Fremdsoftware behält ihre eigenen Lizenzbedingungen. Die [Quellübersicht](docs/SOURCE_STATUS.md) beschreibt den bisherigen Bestand und die noch offenen Prüfungen. Die Dokumentation oder eine geplante Zuordnung erteilt keine pauschale Nutzungslizenz für unveröffentlichten Connector-Code.
