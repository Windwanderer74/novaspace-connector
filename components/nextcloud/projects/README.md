# Native Projekt-App 0.2.12 · Quellfassung

Die App `novaspace_capsules` verbindet Deck und Mindmap über einen gemeinsamen
Anlage- und Arbeitsplan-Kern. Dieser Snapshot gehört zum Connector-Zwischenstand
1.35 und steht für die eigenen Dateien unter **AGPL-3.0-or-later**.

`app/` enthält den vollständig zusammengeführten 23-Dateien-Appbaum. Die
Herkunft jeder Datei ist in [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json)
aufgeführt. `update-*` enthält ausschließlich begrenzte Kompatibilitätsfixtures
für die Prüfungen; es sind keine Update- oder Installationsprogramme.

## Funktion und Verträge

- Eigene Projektseite, Office-Kategorie, Deck-Einstieg und gemeinsame Projektanlage.
- Persönliche Standardablage oder bewusst ausgewählter vorhandener Ordner.
- Vier feste Spalten: Neu, Wartend, In Arbeit und Zu prüfen.
- Feste Vorgangskennung, gespeicherte Phasen, Mutex und unveränderte Eingaben bei
  Wiederaufnahme. Ein unklarer Dateischreibversuch erzeugt keine zweite Mindmap.
- Authentifizierte API für Konto/Vertrag, Ordner, bekannten Status und Anlage.
- Unabhängig lesbarer tatsächlicher Mindmap-Pfad aus der bestätigten Datei-ID.
- Browser-POST mit CSRF-Schutz und eigener externer Basic-API-Einstieg.

Die API nutzt vorhandene native Kontorechte. Der Connector prüft vor dem
Cross-App-Nachweis bereits gewährte Deck-/Dateileserechte und Schreibrechte sowie
die Mindmap-Freigabe. Auch API-Leseauskünfte setzen im derzeitigen Vertrag diesen
kombinierten Zugang voraus; sie vergeben keine Berechtigungen.

## Einbaugrenzen

Dieses Quellpaket enthält keinen historischen privaten Hosting-Installer,
keine aktive Projektzuordnung, keinen Browser-JSLoader-Einbau und keine
Betriebsbelege. Es ist kein freigegebenes App-Store- oder allgemeines
Produktionsupdate. Abhängigkeiten, Prüfungen und Grenzen stehen in [BUILD.md](BUILD.md).
Die allgemeine native Plattformbasis ist eine gesonderte Komponente.

Im ursprünglichen Arbeitsumfeld sind Einbau0.2.12 und lesende API-Aufrufe bestätigt.
Die praktische Connector-Projektanlage ist weiterhin eine getrennte offene Probe.
