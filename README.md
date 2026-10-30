# NovaSpace Connector

**Augmented Workspace – die Schnittstelle zwischen Mensch und KI.**

Dateien finden, Aufgaben organisieren, Termine planen und Informationen miteinander verbinden: Der Nextcloud Connector von NovaSpace macht unterstützte Funktionen einer angebundenen Nextcloud-Installation für KI-Programme zugänglich. Welche Bereiche eine Verbindung lesen oder bearbeiten darf, wird ausdrücklich festgelegt.

## Was sich damit machen lässt

| Bereich | Beispiele aus dem vorhandenen Funktionsumfang |
|---|---|
| Dateien | Nach Namen suchen, Text lesen, Dateien kopieren und ausgewählte Freigaben bearbeiten |
| Deck | Boards und Karten lesen, Aufgaben anlegen und bearbeiten, Listen und Zuständigkeiten verwalten |
| Projekte | Gemeinsames Board und Mindmap, Standardablage und ausdrückliche Wiederaufnahme; Projekt-Grundpilot im dokumentierten Umfang als Beta-Arbeitsblock abgeschlossen |
| Mindmaps | Entwicklungsgrundlagen strukturieren, Arbeitsschritte mit Deckkarten verbinden und Checklistenfortschritt abgleichen |
| Planung | Kalender und Aufgaben lesen und bearbeiten, freie Zeitfenster ermitteln und einfache Terminserien sowie ausdrücklich beauftragte Einladungen verwalten |
| Notizen und Kontakte | Inhalte pflegen und ausgewählte Text-, Kalender- und Kontaktdaten austauschen |

Ein mögliches Arbeitsgespräch: „Finde die Unterlagen zu diesem Vorhaben, fasse den Stand zusammen und ergänze die nächsten vereinbarten Schritte auf der zugehörigen Deckkarte.“ Die Ausführung hängt von den tatsächlich eingeräumten Rechten und den unterstützten Werkzeugen ab.

## Persönliche Zugänge und nachvollziehbare Arbeit

Der Connector prüft das verbundene Konto und die verfügbaren Rechte. Bei unterstützten Änderungen werden außerdem aktuelle Objektkennungen und Versionsstände geprüft. Persönliche Verbindungen lassen sich in der angebundenen Nextcloud-Umgebung verwalten und widerrufen.

Die Entwicklung umfasst einen Online-Anschluss und einen persönlichen Anschluss für LM Studio. Die Themenauswahl stellt passende Fachbereiche zusammen. Automatisierte Prüfungen und praktische Erprobung werden getrennt dokumentiert.

Die Themenauswahl bietet **19 Schalter und damit 524.288 mögliche Themenkonfigurationen**. Alle Kombinationen werden automatisiert auf ihre Werkzeugauswahl geprüft. Das zählt Schalterbelegungen; verschiedene Belegungen können dieselben Werkzeuge ergeben. Es sind keine 524.288 praktischen Modelltests. [Prüfumfang](components/local/lmstudio/TEST_RESULTS.json).

## Entwicklungsstand

Stand: **30. Oktober 2026 · Paket 1 gemeinsam abgenommen · 32/32**.

Die erste Stufe **Alltag und Planung** ist im vereinbarten und dokumentierten
Beta-Umfang abgeschlossen. Fachliche Modellabnahme A01, Bedienungsabnahme A02 und
gemeinsame Schlussabnahme Z01 sind erfüllt. Nach erfolgreichem Windows-Abschluss
hat der Projektverantwortliche die neue Oberfläche angesehen und ausdrücklich abgenommen.

| Bestandteil | Bestätigter Stand |
|---|---|
| Online-Connector | **1.36.0** |
| Persönlicher LM-Studio-Kern | **1.36.3-local.1** |
| NovaSpace Connector in LM Studio | **0.1.26**, Eintrag **novaspace/connector** |

Der vorhandene persönliche Anschluss wurde ohne erneute Installation weiterverwendet.
Alle **17 Einstellungen** wurden umgestellt und bytegenau zurückgelesen;
Kern, MCP-Einträge und vorhandene Freigaben blieben erhalten. Vorgänger und Rückweg
sind gesichert. Die Bereiche heißen **Arbeit**, **Kommunikation** und **Verwaltung**;
die ergänzende und ausschließende Einzelwerkzeugauswahl bleibt erhalten.
[Abnahme, Prüfungen und Grenzen](docs/updates/0.1.26.md).

Für ein späteres Update ist vorgemerkt: echte Bereichsüberschriften mit Trennlinien
und den Tools darunter. Die Machbarkeit in SDK und Client wird beim nächsten
Oberflächenschritt geprüft. Die aktuelle Darstellung ist abgenommen.

Der öffentliche Programmquellausschnitt behält seinen datierten Versionsstand.
Die Paketabnahme bestätigt den dokumentierten Betrieb; allgemeine Erstinstallation
für neue Personen, weitere Clients und die späteren Pakete bleiben eigene Arbeit.

Der weitere Ausbau läuft in drei Lieferpaketen:

1. **Alltag und Planung:** Dateien, Deck, Mindmaps, Notizen, Kalender, Aufgaben und Kontakte.
2. **Kommunikation und Daten:** unter anderem Mail, Talk und Tabellen.
3. **Fachfunktionen und Office:** weitere vereinbarte Fachbereiche und Dokumentarbeit.

Der Umfang befindet sich in Entwicklung. Vorbereitete Funktionen und abgeschlossene praktische Abnahmen werden unterschiedlich ausgewiesen. Die Übersicht beschreibt den Projektumfang; einzelne Funktionen können je nach Anschluss, Berechtigung und Einbaustand unterschiedlich verfügbar sein.

## Entwicklungsübersicht und laufende Aufgaben

Die [Entwicklungsübersicht](ROADMAP.md) verbindet den dokumentierten Stand mit den [laufenden Aufgaben](https://github.com/Windwanderer74/novaspace-connector/issues). Sie unterscheidet vorhandenen Betrieb, vorbereitete Erweiterungen und offene Abnahmen.

## Über NovaSpace

Unter dem Namen **NovaSpace** entstehen Werkzeuge für die Arbeit mit Nextcloud und KI. Der Nextcloud Connector verbindet ausgewählte Nextcloud-Funktionen mit angebundenen KI-Programmen.

Entwicklung und praktische Erprobung finden in unserer eigenen Nextcloud-Arbeitsumgebung statt.

Weitere Informationen: [novaspace.info](https://novaspace.info/).

## Fragen und Rückmeldungen

Fragen zum Projekt, konkrete Anwendungsfälle und Rückmeldungen können über die Issues dieses Repositories eingebracht werden.

## Veröffentlichungsumfang

Dieses Repository enthält die Projekt- und Entwicklungsübersicht sowie folgende Quellbereiche:

- Die [native GitHub-Brücke 0.1.0](components/nextcloud/github-bridge/README.md) als einzeln nachvollziehbares Modul.
- Das [zusammengeführte Quellpaket der nativen Plattform-App](components/nextcloud/platform/README.md) mit GitHub-Einbau, Tests, sicherer Beispielkonfiguration und reproduzierbarer Paketierung.
- Den [Online-Connector 1.36.0](components/online/connector/README.md), einschließlich gemeinsamer Bibliotheken und bearbeitbarer Browser-Erweiterung1.6.2, Herkunft, Lizenzzuordnung, Fremdhinweisen und Bauanleitung.
- Den [persönlichen LM-Studio-Quellausschnitt 1.36.0-local.1 mit Themenauswahl 0.1.19](components/local/lmstudio/README.md), aufbereitet aus dem hashgeprüften ausgelieferten Paket. Der ältere externe Windows-DPAPI-Startweg bleibt eine benannte Voraussetzung.
- Die [native Projekt-App0.2.13](components/nextcloud/projects/README.md) mit vollständig zusammengeführtem Appbaum und isolierten Protokoll-/Adapterprüfungen.


Die eigenen Dateien dieser Bereiche stehen unter **AGPL-3.0-or-later**; übernommene Fremdhinweise bleiben erhalten. Das App-Paket dient der Prüfung und Testinstallation. Der Quellabgleich anhand der bereitgestellten Metadaten und aller 26 Dateihashes ist dokumentiert. Frische Testinstallationen auf Nextcloud **34.0.4 und 35.0.0** haben mit PHP 8.3.6 und MariaDB 10.11.14 jeweils **36 native Integrationsprüfungen** bestanden. [Testaufbau und Ergebnisse](components/nextcloud/platform/integration/README.md) sind dokumentiert. Online-/lokale Quellen enthalten inaktive Beispiele und ersetzen keine fertige unabhängige Hosting-/Anmelde- oder Erstinstallation. Der Quellen-/Lizenznachweis des älteren DPAPI-Startwegs, ein produktiver Updatepfad und erfolgreiche Abläufe mit externen Zusatz-Apps bleiben gesonderte Arbeit. [Lizenzzuordnung](LICENSING.md) und [Quellübersicht](docs/SOURCE_STATUS.md) beschreiben den genauen Umfang.

---

**English:** NovaSpace Connector is an Augmented Workspace connecting people and AI with supported Nextcloud workflows. Package 1 is at 31/32; final joint acceptance is pending. Source, installed versions and verification limits are documented separately.

Die Fortschreibung der Themenauswahl 0.1.19 hat einen eigenen
[dateigenauen Veröffentlichungsnachweis](docs/PUBLICATION_TOPICS_0_1_19.json).
