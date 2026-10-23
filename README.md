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

Dieses Repository enthält die Projekt- und Entwicklungsübersicht sowie zwei zusammengehörige Quellbereiche:

- Die [native GitHub-Brücke 0.1.0](components/nextcloud/github-bridge/README.md) als einzeln nachvollziehbares Modul.
- Das [zusammengeführte Quellpaket der nativen Plattform-App](components/nextcloud/platform/README.md) mit GitHub-Einbau, Tests, sicherer Beispielkonfiguration und reproduzierbarer Paketierung.

Die eigenen Dateien dieser Bereiche stehen unter **AGPL-3.0-or-later**; übernommene Fremdhinweise bleiben erhalten. Das App-Paket dient der Prüfung und Testinstallation. Der Quellabgleich anhand der bereitgestellten Metadaten und aller 26 Dateihashes ist dokumentiert. Frische Testinstallationen auf Nextcloud **34.0.4 und 35.0.0** haben mit PHP 8.3.6 und MariaDB 10.11.14 jeweils **36 native Integrationsprüfungen** bestanden. [Testaufbau und Ergebnisse](components/nextcloud/platform/integration/README.md) sind dokumentiert. Ein produktiver Updatepfad und erfolgreiche Abläufe mit den externen Zusatz-Apps werden gesondert abgenommen. Der vollständige Online-/LM-Studio-Connector ist noch nicht als Gesamtpaket bereitgestellt. [Lizenzzuordnung](LICENSING.md) und [Quellübersicht](docs/SOURCE_STATUS.md) beschreiben den genauen Umfang.

---

**English:** The Nextcloud Connector by Nova Space provides permission-controlled AI access to supported Nextcloud workflows, including files, Deck, planning, notes, contacts and mind maps. Nova Space develops the connector within the NOVAFORGE project. It is used through an online connection and a personal LM Studio connection. This repository presents the project and includes the native GitHub bridge and the assembled native app source for review and test installation under AGPL-3.0-or-later, retaining third-party notices. A complete connector distribution and production app acceptance are still being prepared; see the component documentation and LICENSING.md for the exact scope.

