# Aufbau und Prüfung

Geprüfter Aufbau: Linux x86_64, Node.js 24.19.0 und npm 11.9.0. Das bestehende Manifest verlangt mindestens Node.js 22.13.0; einzelne gesperrte Abhängigkeiten können höhere Anforderungen stellen. Für die hier dokumentierte Wiederholung Node 24 verwenden. Python 3 ist für Paketierung und die gesonderten Python-Prüfungen nötig. Die Bash-Hilfen verwenden GNU `timeout` und `flock`.

Im Verzeichnis dieser Komponente ausführen:

```sh
npm run install:ci
npm run test:unit
npm run build:browser
npm run build
npm run test:built
```

`npm ci` verwendet das Lockfile. Die Installationshilfe installiert ausschließlich Projektabhängigkeiten und startet keinen Dienst. Die Browser-Paketierung erzeugt `browser/jsloader-mindmap-v1.js` aus bearbeitbaren Quellen und schreibt ihre Eingaben nach `.sites-runtime/browser-build-inputs.json`. Die Worker-Paketierung erzeugt `dist/`. Beide Ausgaben sind lokale Bauprodukte und kein Deployment. Nach erfolgreicher Prüfung kann das Quellarchiv erzeugt werden:

```sh
python3 tools/package.py --output /tmp/novaspace-online-source.tar.gz
```

Das Archiv enthält nur Dateien aus `SHA256SUMS.json` und das Manifest selbst; Abhängigkeiten, Build-Ausgaben, Laufzeitdateien und Zugangsdaten sind ausgeschlossen. Ein installierter Abhängigkeitsbaum ist nicht Teil des Archivs. Vollständige historische Git-Referenzen werden nicht importiert; die Herkunft bleibt dateigenau nachvollziehbar.

## Konfiguration und Anmeldung

[config/environment.example](config/environment.example) enthält **keine aktiven Zugangsdaten**. Der Build benötigt sie nicht. Für einen späteren eigenen Betrieb werden sieben serverseitige Werte benötigt: Nextcloud-Adresse, technisches Konto und App-Passwort, OAuth-Signiergeheimnis, erlaubte E-Mail-Adresse, öffentliche Connector-Adresse und ein zur nativen Vertrauenskonfiguration passender privater Assertion-JWK. Das OAuth-Signiergeheimnis muss nach dem vorhandenen Code mindestens 32 Zeichen lang sein. Assertion-Schlüssel und Passwörter gehören ausschließlich in den Secret-Speicher des jeweiligen Betreibers.

Die vorhandene Anmeldung setzt die von der Hosting-Plattform geprüften `oai-authenticated-user-*`-Header voraus. Diese Header sind **kein allgemein verfügbarer selbständiger Login**. Ein anderer Hoster braucht einen vertrauenswürdigen vorgeschalteten Identitätsdienst, der vom Client gelieferte Identitätsheader entfernt und erst nach geprüfter Anmeldung eigene setzt. Ohne diesen Adapter darf die Anwendung nicht öffentlich als anmeldesicherer eigenständiger Server angeboten werden. Die lokalen OAuth-Tests simulieren diese Vertrauensgrenze; sie beweisen keinen anderen Hosting-Login.

`.openai/hosting.json` enthält nur die benötigten leeren Bindungseinstellungen. Eine konkrete Site-ID, Datenbank, Bucket-Zuordnung oder Veröffentlichung ist nicht enthalten. Die ursprüngliche D1-Referenzimplementierung ist kein Beleg dafür, dass der Worker diese Datenbank tatsächlich verwendet. Die produktiven Verbindungsfreigaben laufen über die native Nextcloud-Plattform-App.

## Prüfgrenzen

Die JavaScript-Prüfungen verwenden synthetische Daten, Ersatzantworten für HTTP und temporär erzeugte Testschlüssel; sie führen keine gewollten echten Nextcloud- oder GitHub-Änderungen aus. Die Prüfung der gebauten Ausgabe ruft den erzeugten Worker im lokalen Node-Prozess auf. Das ist weder ein Cloudflare-Laufzeittest noch ein produktiver End-to-End-Test. Die native App hat einen [eigenen Integrationsnachweis](../../nextcloud/platform/INTEGRATION_RESULTS.json).

Die festen technischen Kontobezeichnungen und Pilotgrenzen einiger Adapter stammen aus dem Ausgangsstand. Sie sind dokumentierter bestehender Code, keine allgemeine Mehrmandanten-Konfiguration. [LEGACY_OPS.md](LEGACY_OPS.md) beschreibt die besonders installationsgebundenen Programme. Bestehende Produktionsabnahmen werden durch diese Quellprüfung nicht ersetzt. Ein frischer Online-Betrieb, ein Update der laufenden Installation, echte externe GitHub-Schreibvorgänge und der vollständige LM-Studio-Anschluss bleiben gesonderte Lieferungen.
