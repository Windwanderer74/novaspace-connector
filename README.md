# Nextcloud Connector von Nova Space

**KI-Anbindung für Nextcloud – Dateien, Aufgaben und Planung gezielt mit KI nutzen.**

Dateien finden, Aufgaben organisieren, Termine planen und Informationen miteinander verbinden: Der Nextcloud Connector von Nova Space macht unterstützte Funktionen einer angebundenen Nextcloud-Installation für KI-Programme zugänglich. Welche Bereiche eine Verbindung lesen oder bearbeiten darf, wird ausdrücklich festgelegt.

## Was sich damit machen lässt

| Bereich | Beispiele aus dem vorhandenen Funktionsumfang |
|---|---|
| Dateien | Nach Namen suchen, Text lesen, Dateien kopieren und ausgewählte Freigaben bearbeiten |
| Deck | Boards und Karten lesen, Aufgaben anlegen und bearbeiten, Listen und Zuständigkeiten verwalten |
| Mindmaps | Entwicklungsgrundlagen strukturieren, Arbeitsschritte mit Deckkarten verbinden und Checklistenfortschritt abgleichen |
| Planung | Kalender und Aufgaben lesen und bearbeiten, freie Zeitfenster ermitteln und einfache Terminserien verwalten |
| Notizen und Kontakte | Inhalte pflegen und ausgewählte Text-, Kalender- und Kontaktdaten austauschen |

Ein mögliches Arbeitsgespräch: „Finde die Unterlagen zu diesem Vorhaben, fasse den Stand zusammen und ergänze die nächsten vereinbarten Schritte auf der zugehörigen Deckkarte.“ Die Ausführung hängt von den tatsächlich eingeräumten Rechten und den unterstützten Werkzeugen ab.

## Persönliche Zugänge und nachvollziehbare Arbeit

Der Connector prüft das verbundene Konto und die verfügbaren Rechte. Bei unterstützten Änderungen werden außerdem aktuelle Objektkennungen und Versionsstände geprüft. Persönliche Verbindungen lassen sich in der angebundenen Nextcloud-Umgebung verwalten und widerrufen.

Die Entwicklung umfasst einen Online-Anschluss und einen persönlichen Anschluss für LM Studio. Die Themenauswahl stellt passende Fachbereiche zusammen. Automatisierte Prüfungen und praktische Erprobung werden getrennt dokumentiert.

## Entwicklungsstand

Stand dieser Projektvorstellung: **23. Oktober 2026**. Der Online-Anschluss ist im vorhandenen Arbeitsumfeld in Version **1.31.1** eingebaut. Der persönliche LM-Studio-Anschluss hat einen eigenen Versions- und Einbaustand; Online-Aktualisierungen aktualisieren ihn nicht automatisch.

Der weitere Ausbau läuft in drei Lieferpaketen:

1. **Alltag und Planung:** Dateien, Deck, Mindmaps, Notizen, Kalender, Aufgaben und Kontakte.
2. **Kommunikation und Daten:** unter anderem Mail, Talk und Tabellen.
3. **Fachfunktionen und Office:** weitere vereinbarte Fachbereiche und Dokumentarbeit.

Der Umfang befindet sich in Entwicklung. Vorbereitete Funktionen und abgeschlossene praktische Abnahmen werden unterschiedlich ausgewiesen. Die Übersicht beschreibt den Projektumfang; einzelne Funktionen können je nach Anschluss, Berechtigung und Einbaustand unterschiedlich verfügbar sein.

## Entwicklungsübersicht und laufende Aufgaben

Die [Entwicklungsübersicht](ROADMAP.md) verbindet den dokumentierten Stand mit den [laufenden Aufgaben](https://github.com/Windwanderer74/novaspace-connector/issues). Sie unterscheidet vorhandenen Betrieb, vorbereitete Erweiterungen und offene Abnahmen.

## Über Nova Space

Unter dem Namen **Nova Space** entstehen Werkzeuge für die Arbeit mit Nextcloud und KI. Der Nextcloud Connector verbindet ausgewählte Nextcloud-Funktionen mit angebundenen KI-Programmen.

Entwicklung und praktische Erprobung finden in unserer eigenen Nextcloud-Arbeitsumgebung statt. Das Vorhaben ist Teil des NOVAFORGE-Projekts.

Weitere Informationen: [novaspace.info](https://novaspace.info/).

## Fragen und Rückmeldungen

Fragen zum Projekt, konkrete Anwendungsfälle und Rückmeldungen können über die Issues dieses Repositories eingebracht werden.

## Veröffentlichungsumfang

Dieses Repository enthält die Projekt- und Entwicklungsübersicht sowie folgende Quellbereiche:

- Die [native GitHub-Brücke 0.1.0](components/nextcloud/github-bridge/README.md) als einzeln nachvollziehbares Modul.
- Das [zusammengeführte Quellpaket der nativen Plattform-App](components/nextcloud/platform/README.md) mit GitHub-Einbau, Tests, sicherer Beispielkonfiguration und reproduzierbarer Paketierung.
- Den [Online-Connector 1.31.1 als bereinigte Quellfassung](components/online/connector/README.md), einschließlich gemeinsamer Bibliotheken und bearbeitbarer Browser-Erweiterung, Herkunft, Lizenzzuordnung, Fremdhinweisen und Bauanleitung. Worker und Browser-Bündel lassen sich bauen; 503 isolierte JavaScript-Prüfungen und zwei Prüfungen der gebauten Ausgabe bestehen. Historische Wartungsskripte sind vor Bootstrap und Passwortabfrage zusätzlich gesperrt.
- Den [persönlichen LM-Studio-Anschluss](components/local/lmstudio/README.md): Kern 1.31.0-local.1 und Themenauswahl 0.1.10 aus dem hashgeprüften Original-ZIP, 200 Dateien im bereinigten Quellarchiv, Bauanleitung und gesperrte historische Installer. Beide Komponenten bauen; 41 JavaScript- und 16 Python-Prüfungen bestehen, einschließlich 16.384 Themenkombinationen und echter lokaler MCP-Kindprozesse. Der ältere externe Windows-DPAPI-Startweg bleibt eine ausdrücklich benannte Voraussetzung.

Die eigenen Dateien dieser Bereiche stehen unter **AGPL-3.0-or-later**; übernommene Fremdhinweise bleiben erhalten. Das App-Paket dient der Prüfung und Testinstallation. Der Quellabgleich anhand der bereitgestellten Metadaten und aller 26 Dateihashes ist dokumentiert. Frische Testinstallationen auf Nextcloud **34.0.4 und 35.0.0** haben mit PHP 8.3.6 und MariaDB 10.11.14 jeweils **36 native Integrationsprüfungen** bestanden. [Testaufbau und Ergebnisse](components/nextcloud/platform/integration/README.md) sind dokumentiert. Online-/lokale Quellen enthalten inaktive Beispiele und ersetzen keine fertige unabhängige Hosting-/Anmelde- oder Erstinstallation. Der Quellen-/Lizenznachweis des älteren DPAPI-Startwegs, ein produktiver Updatepfad und erfolgreiche Abläufe mit externen Zusatz-Apps bleiben gesonderte Arbeit. [Lizenzzuordnung](LICENSING.md) und [Quellübersicht](docs/SOURCE_STATUS.md) beschreiben den genauen Umfang.

---

**English:** The Nextcloud Connector by Nova Space provides permission-controlled AI access to supported Nextcloud workflows. This repository includes the native GitHub bridge, assembled native app source and a sanitized online/browser source snapshot for version 1.31.1 under AGPL-3.0-or-later, retaining third-party notices. Build instructions and scoped test results are included. Independent hosting/authentication, production updates and the full LM Studio distribution remain separate work; see the component documentation and LICENSING.md.

