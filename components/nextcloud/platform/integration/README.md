# Native Nextcloud-Integrationsprüfung

Die App wurde in getrennten frischen Installationen mit **Nextcloud 34.0.4** und **35.0.0**, **PHP 8.3.6** und **MariaDB 10.11.14** geprüft. Pro Installation laufen 36 Bedingungen über den echten Nextcloud-Kern, dessen native Anmeldung, Migrationen und HTTP-Endpunkte. Die Ergebnisse stehen in [INTEGRATION_RESULTS.json](../INTEGRATION_RESULTS.json).

Die bisherige reine Fixture-Prüfung bleibt eine eigene Ebene. Dieser Ablauf verwendet keine Ersatzimplementierungen der Nextcloud-Controller, Identitätsdienste oder Datenbank.

## Reproduzieren

Die folgende Laufzeitvorbereitung ist für eine getrennte **Ubuntu-24.04-Umgebung auf x86_64** vorgesehen. Benötigt werden Python 3.12 oder neuer, `apt-get`, `dpkg-deb`, vorhandene vertrauenswürdige Ubuntu-Paketindizes und Zugriff auf die offiziellen Nextcloud-Downloads. Das eigentliche Testprogramm benötigt zusätzlich die Python-Abhängigkeit in `requirements.txt`.

Im Komponentenverzeichnis beispielsweise:

```sh
python3 -m pip install -r integration/requirements.txt
python3 integration/prepare-lab.py --lab-root /tmp/novaspace-test-34 --nextcloud-version 34.0.4
python3 integration/run.py --lab-root /tmp/novaspace-test-34 --app-source .
```

Für Nextcloud 35 ein zweites Laborverzeichnis verwenden und `35.0.0` auswählen. Die getestete Umgebung führte MariaDB mit dem ausdrücklich gewählten lokalen Testbenutzer des Betriebssystems aus. Andere Betriebssysteme und Laufzeiten sind durch diese Rezeptprüfung nicht freigegeben.

`prepare-lab.py` lädt die benötigten Ubuntu-Pakete in das Labor und entpackt sie dort. Es installiert keine Systemdienste und führt kein `apt-get install` aus. Die Nextcloud-Originalarchive werden über HTTPS geladen und gegen die vom Herausgeber bereitgestellte SHA-256-Datei geprüft. Die Laufzeitvorbereitung selbst wurde ebenfalls in einem unabhängigen Laborverzeichnis ausgeführt und geprüft.

`run.py` verlangt die passende Labormarkierung. Es erstellt je Lauf eine neue MariaDB-Datenablage, eine neue Nextcloud-Datenablage und zufällige lokale Testzugänge. Datenbank und PHP-Webserver binden ausschließlich an Loopback-Adressen mit eigens gewählten Ports. Die Bereitschaftsprüfung vergleicht die Datenbankablage mit dem eigenen gestarteten Server. Eine produktive Nextcloud oder bestehende persönliche Zugänge werden nicht benötigt.

Das Testprogramm überschreibt die Konfiguration und App-Kopie **innerhalb des ausdrücklich gewählten Labors**. Das angegebene Quellpaket bleibt unverändert. Private Testzugänge und Rohprotokolle bleiben im Labor und gehören nicht in Git. Am Ende werden die eigenen Webserver- und Datenbankprozesse beendet; das Labor bleibt für die Nachprüfung erhalten.

## Geprüfte Bedingungen

- Installation des offiziellen Nextcloud-Kerns und Aktivierung der nativen App über `occ`.
- Alle sechs erwarteten App-Tabellen durch echte Migrationen.
- Persönliche Webanmeldung und Anmeldung über ein natives App-Passwort.
- Einrichtungslink ohne vorzeitige Registrierung; Bestätigung durch das persönliche Eigentümerkonto.
- Trennung zwischen logischem Eigentümer und technischem Aufrufer.
- CSRF-Abwehr bei Bestätigung und Widerruf; Ablehnung abgelaufener oder unpassender Signaturen sowie injizierter Eigentümerparameter.
- Hauptschalter, idempotente Wiederholungen und Zurückweisung veralteter Formulare.
- Schutz vor Anzeige und Änderungen durch ein anderes Konto.
- Fehlende optionale GitHub-App ohne falsche Verbindungsmeldung; fehlendes Inventory ohne Freigabe, verwaiste Eigentümerzeile oder Aktionsjournal.
- Widerruf, erneutes Aktivieren der App und tatsächlicher Neustart des PHP-Webservers ohne Verlust von Journal oder Widerruf.

## Grenzen des Nachweises

Der Nachweis gilt für die dokumentierten Einzelversionen und die dort genannten Laufzeiten. Andere PHP-/Datenbankversionen, Apache/nginx/FPM, HTTPS, Last und echte gleichzeitige Mehrprozessänderungen sind nicht zertifiziert. Die Tests verwenden einen lokalen PHP-Testwebserver und deaktivieren ausschließlich im Labor Bruteforce-/Ratenbegrenzung, damit negative Funktionsprüfungen deterministisch bleiben.

Die externen Apps `deckgithubsync` und Inventory sind nicht installiert. Ihre abgesicherte Abwesenheit wurde geprüft; erfolgreiche externe GitHub-Schreibzugriffe, echte Sync-Zuordnungen und produktive Inventory-Operationen wurden damit nicht abgenommen. Die frische Neuinstallation ersetzt außerdem keine gesonderte Updateabnahme einer bestehenden Installation.
