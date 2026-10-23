# Native GitHub-Brücke · Quellstand 0.1.0

Die GitHub-Brücke ergänzt die vorhandene NovaSpace-Plattform-App für Nextcloud. Veröffentlicht werden hier drei Implementierungsdateien und der vorhandene isolierte Kerntest aus dem Connector-Quellstand **1.31.1**.

**Lizenz: AGPL-3.0-or-later.** Sie gilt für die PHP-Dateien unter `src/` und `tests/`. Der vollständige Text steht in [LICENSE](LICENSE); die Dateizuordnung steht im [Herkunftsnachweis](SOURCE_PROVENANCE.json).

## Funktionsumfang

- Persönliche GitHub-Verbindung und eigene Repositories lesen.
- Die Projektvorstellung als `README.md` im eigenen öffentlichen Repository lesen und mit geprüfter Repository-ID und Datei-SHA ändern. Eine neue öffentliche Repository-Anlage erfordert eine ausdrücklich bestätigte öffentliche Zielsetzung.
- Vorhandene persönliche Deck-GitHub-Zuordnungen lesen und einen gezielt bestätigten Abgleich auslösen.

Die Brücke stellt keine allgemeine GitHub-API bereit. Issue-Verwaltung, beliebige Programmdatei-Uploads, neue Sync-Zuordnungen und Projects-Verwaltung gehören nicht zu diesem Quellstand. Ein ausgelöster Sync-Lauf bestätigt nicht automatisch jede einzelne Zieländerung.

## Aufbau und Einbaugrenze

| Datei | Aufgabe |
|---|---|
| `src/Service/GithubBridgeCore.php` | Begrenzte Operationen, Ziel- und Versionsprüfungen, Rücklesen und Konfliktzustände |
| `src/Service/GithubBridgeService.php` | Persönliche native Identität, Verbindungsfreigaben und Anbindung an GitHub/Deck-GitHub Sync |
| `src/Controller/GithubBridgeController.php` | OCS-Einstieg mit begrenzten Parametern und bereinigten Fehlerantworten |
| `tests/github-bridge-core.php` | Bestehende Fixture-Prüfungen ohne echte Konten oder Netzwerkzugriffe |

Dies ist ein **Quellmodul**, noch kein eigenständig installierbares Nextcloud-App-Paket. Der vollständige App-Einbau, seine Abhängigkeiten und seine Abnahme sind ein weiterer Arbeitsschritt. Die Dateien unter `src/` entsprechen dem `lib/`-Baum der vorhandenen App `novaspace_platform`.

Der Integrationsstand benötigt insbesondere:

- Die vorhandene NovaSpace-Plattform-App einschließlich `NativeAccessResolver`, `GatewayVerifier`, `ConnectionStore` und `PlatformDenied`.
- Eine OCS-POST-Route zu `GithubBridgeController::execute` sowie den signierten Verwendungszweck `github` im Gateway-Verifier.
- Die vorhandene App `deckgithubsync` mit ihren persönlichen GitHub-Zugängen und den verwendeten Diensten `GithubClientService`, `BoardMapMapper` und `SyncService`.
- Die Nextcloud-OCP-Schnittstellen für Identität, App-Passwörter, Sitzung und HTTP-Client. PHP 8.3 dient hier als Testumgebung; eine vollständige unterstützte Versionsmatrix wird erst mit dem App-Paket abgenommen.

Diese externen Bestandteile sind in diesem Modul nicht gebündelt. Ihre jeweiligen Lizenzbedingungen bleiben bestehen. Die bisherige vollständige App- und Gateway-Quellbereitstellung wird mit dem nächsten Quellpaket aufgearbeitet.

## Zugang und Freigaben

Der Dienst verlangt eine native App-Passwort-Identität. Ein signierter Online-Aufruf benötigt zusätzlich eine aktive persönliche Verbindung, den Hauptschalter, die passende Deck-Freigabe und `github:read` beziehungsweise `github:write`. Ohne signierte Online-Assertion gilt die eigene native Identität. Es wird ausschließlich der persönliche GitHub-Zugang des ermittelten Kontos verwendet; ein globaler Installationstoken dient nicht als Ersatz.

Bei unklaren Schreibantworten muss derselbe Zielzustand frisch gelesen werden. Die Brücke wiederholt solche Schreibzugriffe nicht automatisch.

## Tests

Mit PHP 8.3 im Modulverzeichnis:

```sh
php -l src/Service/GithubBridgeCore.php
php -l src/Service/GithubBridgeService.php
php -l src/Controller/GithubBridgeController.php
php -l tests/github-bridge-core.php
php tests/github-bridge-core.php
```

Erwartetes Testergebnis: `GitHub bridge core: 34 checks passed`.

Der veröffentlichte Stand wurde isoliert mit PHP 8.3 über PHP-WASM geprüft: Syntax aller vier Dateien und 34 vorhandene Kernprüfungen erfolgreich. Geprüft werden unter anderem Identitäts-/Zielkonflikte, private Repository-Sichtbarkeit, SHA-Konflikte, unklare Schreibantworten und Versionskonflikte vorhandener Sync-Zuordnungen. Diese Fixture-Prüfungen ersetzen keine vollständige praktische Nextcloud-Integrationsabnahme.

## Herkunft und Änderungen

Grundlage ist der erhaltene Quellcheckpoint `ca1fb50642c0b3cab7c5f9d898e36fba7befdf38`. Die vier Originalpfade treten in dessen Pfadhistorie jeweils erstmals auf. Dieses Repository übernimmt einen ausgewählten Snapshot mit SHA-256-Nachweisen; es importiert nicht die vollständige bisherige Quellhistorie.

Für die Veröffentlichung wurden ausschließlich SPDX-Zeilen ergänzt und der `require_once`-Pfad des Tests an den veröffentlichten Verzeichnisbaum angepasst. Die Implementierungslogik bleibt unverändert. Original- und Veröffentlichungshashes sowie der bezogene Lizenztext sind in [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json) dokumentiert.

Der vorbereitete Connector-Entwicklungsstand 1.32 ist nicht Bestandteil dieser Veröffentlichung. Weitere Arbeit wird in [Aufgabe #4](https://github.com/Windwanderer74/novaspace-connector/issues/4) geführt.
