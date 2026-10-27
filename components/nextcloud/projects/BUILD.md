# Aufbau und Prüfung der Projekt-App

Die App besteht aus PHP-/JavaScript-/CSS-Quellen und benötigt keinen
JavaScript-Build. Native Abhängigkeiten sind Nextcloud, Deck, die verwendete
Mindmap-App sowie für die Office-Kategorie die Office-App. Die konkreten
Schnittstellen und Pilotgrenzen sind in den Klassen sichtbar; dies ist noch
keine allgemeine Mehrmandanten-Erstinstallation.

Für isolierte Prüfungen: Node.js und PHP ab8.3 mit den verwendeten Standard-
Erweiterungen. Im Komponentenverzeichnis:

```sh
php tests/run-protocols.php
node --test tests/project-connector-entry.test.mjs
```

`NF_PHP_BIN` kann einen anderen PHP-CLI-Pfad wählen. Für die dokumentierte lokale
Quellprüfung wurde PHP8.5-WASM über den optionalen `NF_PHP_WASM_CLI`-Pfad benutzt.
Es ist kein mitgelieferter Produktionsruntime und keine Nextcloud-Installation.

Der reine Protokolllauf prüft Kern, Anlage, Matrix, Gestaltung, Standardablage und
projektbereiten Arbeitsplan sowie die Syntax aller App-PHP-Dateien. Die vier
Node-Gruppen prüfen den tatsächlichen Controller, reine Protokolle, den Dienst
mit synthetischen Nextcloud-Objekten und die beabsichtigte Versionsänderung.

Die erhaltenen `deck-update.php`- und `map-write-guard.php`-Suiten benötigen
tatsächliche Deck-Wertklassen beziehungsweise Nextcloud-Hook-Semantik. Sie werden
im Standalone-Lauf nicht als neue native Integration ausgegeben. Die vorhandene
Hostprüfung ist ein anderer Nachweis. Es werden keine produktiven Objekte oder
Rechte angelegt und keine Zugangsdaten verwendet.

[TEST_RESULTS.json](TEST_RESULTS.json) nennt die tatsächlich ausgeführten
Quellprüfungen. Ein Quellarchiv lässt sich nach Manifestprüfung mit
`python3 tools/package.py --output /tmp/novaspace-projects-source.tar.gz` erzeugen.
