# Fremdhinweise

Die Dateien unter `app/` sind eigener NovaSpace-App-Quellcode und zugehörige Assets; die App-Lizenz steht in [LICENSE](LICENSE). Die Laufzeit nutzt die vorhandenen Nextcloud-OCP-Schnittstellen. Nextcloud und die optionalen Apps `deckgithubsync` und Inventory werden in diesem Paket nicht gebündelt.

Zwei öffentliche Nextcloud-Schnittstellen sind ausschließlich als unveränderte Entwicklungsfixtures enthalten. Sie wurden vollständig mit der angegebenen Upstream-Fassung verglichen. Ihre Copyright- und SPDX-Hinweise bleiben erhalten.

| Datei | Quelle | Lizenz |
|---|---|---|
| `tests/fixtures/platform-native/IProvider.php` | [Nextcloud Server v34.0.4](https://github.com/nextcloud/server/blob/v34.0.4/lib/public/Authentication/Token/IProvider.php) · Blob `ade44a3ee94e40c9c90d1ffbb2e5e37110cca0c4` | **AGPL-3.0-only**, Copyright 2022 Nextcloud GmbH und Mitwirkende |
| `tests/fixtures/platform-native/IToken.php` | [Nextcloud Server v34.0.4](https://github.com/nextcloud/server/blob/v34.0.4/lib/public/Authentication/Token/IToken.php) · Blob `c32a233a6508a74de17a9cf2bb58a5b7d7490b70` | **AGPL-3.0-or-later**, Copyright 2023 Nextcloud GmbH und Mitwirkende |

Der vollständige AGPL-3.0-Text liegt zusätzlich in [LICENSES/AGPL-3.0-only.txt](LICENSES/AGPL-3.0-only.txt) für die auf Version 3 beschränkte Schnittstelle. Die eigene Lizenzzuordnung hebt diese Einschränkung nicht auf. Die Fixtures sind im vollständigen Quellarchiv enthalten und gehören nicht in das getrennte App-Archiv.

Lizenztextquelle: [SPDX License List Data](https://github.com/spdx/license-list-data/blob/main/text/AGPL-3.0-only.txt), Blob `0c97efd25b5974b974ed9a8a18207bc4f55bb338`. Die identischen Lizenztexte für die Kennungen `AGPL-3.0-only` und `AGPL-3.0-or-later` ändern nichts an der unterschiedlichen Versionswahl in den jeweiligen Dateihinweisen.

Die native Integrationsprüfung benötigt zusätzlich Python `cryptography` sowie getrennt heruntergeladene PHP-/MariaDB-/Nextcloud-Laufzeiten. Diese Abhängigkeiten werden nicht in diesem Quellpaket gebündelt und behalten ihre eigenen Lizenzbedingungen. Der Testaufbau und die gewählte Python-Version stehen in `integration/`.
