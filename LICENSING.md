# Lizenzzuordnung

Stand: **23. Oktober 2026**.

Die Lizenz gilt jeweils für die ausdrücklich zugeordneten Dateien. Dieses Repository enthält die native GitHub-Brücke, das zusammengeführte native App-Quellpaket sowie die Projekt- und Entwicklungsdokumentation.

| Veröffentlichter Bestandteil | Zuordnung | Lizenztext |
|---|---|---|
| Native GitHub-Brücke 0.1.0: PHP-Dateien unter `components/nextcloud/github-bridge/src/` und `components/nextcloud/github-bridge/tests/` | **AGPL-3.0-or-later** | [Vollständiger Lizenztext](components/nextcloud/github-bridge/LICENSE) |
| Native Plattform-App: eigene Dateien unter `components/nextcloud/platform/`, einschließlich App-Quellen, Assets, Prüfhilfen und Dokumentation | **AGPL-3.0-or-later** | [Vollständiger Lizenztext](components/nextcloud/platform/LICENSE) |
| Unveränderte Nextcloud-Testschnittstelle `components/nextcloud/platform/tests/fixtures/platform-native/IProvider.php` | **AGPL-3.0-only**, bestehende Hinweise bleiben erhalten | [Fremdhinweise](components/nextcloud/platform/THIRD_PARTY_NOTICES.md) |
| Unveränderte Nextcloud-Testschnittstelle `components/nextcloud/platform/tests/fixtures/platform-native/IToken.php` | **AGPL-3.0-or-later**, bestehende Hinweise bleiben erhalten | [Fremdhinweise](components/nextcloud/platform/THIRD_PARTY_NOTICES.md) |

Für die veröffentlichten AGPL-Bestandteile ist keine zusätzliche kommerzielle Erlaubnis erforderlich. Auch eine kommerzielle Nutzung richtet sich nach den Rechten und Pflichten der AGPL. Kostenpflichtige Einrichtung, Wartung oder Betrieb können daneben angeboten werden.

Für weitere AGPL-gebundene beziehungsweise entsprechend eingebundene Nextcloud-Bestandteile ist ebenfalls eine AGPL-konforme Veröffentlichung vorgesehen. Ihre konkrete Quellbereitstellung ist noch in Arbeit.

Für rechtlich eigenständige eigene Bestandteile können gesonderte kommerzielle Nutzungs- und Weiterverwendungsbedingungen vorgesehen werden, soweit Rechte und Abhängigkeiten dies erlauben. Die bloße Einordnung außerhalb von Nextcloud genügt dafür nicht. Solche weiteren Bestandteile werden hier noch nicht unter einer kommerziellen Lizenz ausgeliefert; konkrete Vertragsbedingungen sind damit nicht vorweggenommen.

Fremdsoftware behält ihre eigenen Lizenzbedingungen. Die [Quellübersicht](docs/SOURCE_STATUS.md) beschreibt den bisherigen Bestand und die noch offenen Prüfungen. Die Dokumentation oder eine geplante Zuordnung erteilt keine pauschale Nutzungslizenz für unveröffentlichten Connector-Code.
