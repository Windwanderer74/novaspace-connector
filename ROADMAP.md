# Entwicklungsübersicht · Nextcloud Connector von Nova Space

Stand: **27. Oktober 2026**

Nova Space entwickelt eine KI-Anbindung für unterstützte Nextcloud-Funktionen. Diese Übersicht macht den vorhandenen Betrieb, vorbereitete Erweiterungen und die verbleibenden Arbeitsschritte nachvollziehbar.

## Aktueller Stand

- Online1.35.0, persönlich1.35.0-local.1, Themenauswahl0.1.12 und Projekte0.2.12 sind im bestehenden Arbeitsumfeld eingebaut. Der Windows-Installer endet mitCode0; lesende API und persönlicher LM-Studio-Konto-/Versions-/Hilfe-/Ordnerzugriff sind dokumentiert.
- Passende aufbereitete Online-, persönliche und Projekt-App-Quellen mit Herkunft, Bauanleitung, Lizenzzuordnung und Prüfberichten werden in diesem Snapshot veröffentlicht. [Update1.35](docs/updates/1.35.0.md).
- Der gemeinsame Projektfluss nutzt denselben nativen Kern wie der Browser. Die praktische Connector-Anlage und Wiederaufnahme bleiben eigene offene Schreibproben. Die allgemeine Modell-/UX-Matrix bleibt pausiert.
- Paket1 bleibt21/32. Noch kein Lieferpaket ist als Ganzes abgenommen. Älterer persönlicher DPAPI-Wrapper, unabhängige Erstinstallation und weitere Betriebs-/Bedienungsabnahmen bleiben offen.
- Die getrennt veröffentlichten älteren nativen Plattform-/GitHub-Module behalten ihre eigenen Versions- und Integrationsnachweise. Diese Veröffentlichung überträgt deren frühere Integrationsprüfungen nicht pauschal auf die neue Projekt-App.

## Arbeitspakete und Aufgaben

| Bereich | Dokumentierter Stand | Führende GitHub-Aufgabe |
|---|---|---|
| Produktweg und verständliche Einrichtung | Zwei von acht Produktbedingungen belegen interne Grundlagen; die allgemeine Produktabnahme ist offen. | [Produktweg](https://github.com/Windwanderer74/novaspace-connector/issues/1) |
| Drei Lieferpakete | Alltag/Planung, Kommunikation/Daten und Fachfunktionen/Office sind abgegrenzt. Noch kein Paket ist als Ganzes abgeschlossen. | [Lieferplan](https://github.com/Windwanderer74/novaspace-connector/issues/2) |
| Paket 1: Alltag und Planung | 21 von 32 technischen Bedingungen sind belegt; 11 Bedingungen einschließlich restlicher Facharbeit und vollständiger Abnahme bleiben offen. Der installierte Zwischenstand schließt das Paket nicht ab. | [Paket 1](https://github.com/Windwanderer74/novaspace-connector/issues/3) |
| Quellübernahme und Entwicklungsablauf | Native Module und aufbereitete Online-/persönliche/Projekt-Quellen1.35 sind mit Lizenz, Herkunft, Bauanleitung und Prüfberichten veröffentlicht. Native Neuinstallation auf zwei dokumentierten Nextcloud-Versionen ist belegt. Älterer DPAPI-Startweg, weitere native Apps, Historienprüfung, Updates und erfolgreiche externe Zusatz-App-Abläufe bleiben offen. | [Entwicklungsweg](https://github.com/Windwanderer74/novaspace-connector/issues/4) |

Die Zählungen beschreiben definierte Bedingungen. Sie sind keine Schätzung des verbleibenden Zeitaufwands oder der gesamten Produktreife.

## Arbeitsablauf auf Auftrag

1. Ziele und Zusammenhänge in der Projekt-Mindmap strukturieren.
2. Daraus konkrete Arbeitsschritte und überprüfbare Bedingungen in Deck ableiten.
3. Den gewählten Schritt über die passenden Konnektoren bearbeiten und das Ergebnis zurücklesen.
4. Erfüllte Bedingungen in Deck festhalten und die ausdrücklich zugehörige Mindmap abgleichen.
5. Den ausgewählten öffentlichen Entwicklungsstand auf Auftrag nach GitHub übertragen, zurücklesen und die feste Zuordnung fortschreiben.

Mindmap und Deck bleiben die interne Arbeitsgrundlage. GitHub zeigt eine ausgewählte, für die Öffentlichkeit aufbereitete Entwicklungssicht.

Der halbautomatische Arbeitsweg wurde am 25. Oktober 2026 am tatsächlich umgesetzten Boardwechsel fortgeschrieben: dieselbe erfüllte Bedingung führt den Fortschritt in Deck, zugehöriger Mindmap und der ausgewählten öffentlichen Paketaufgabe. Das ist eine betriebliche Arbeitsgrundlage, keine vollständige Produktabnahme.

Der erste praktische Weg ist ein **Abgleich auf ausdrücklichen Auftrag**. Eine durchgängige automatische Hintergrundsynchronisation zwischen allen drei Systemen ist noch nicht abgenommen. Ein GitHub-Status „geschlossen“ ersetzt keine fehlende fachliche Abnahme.

## Nächste Schritte

1. Die praktische gemeinsame Connector-Projektanlage mit vereinbartem Ziel prüfen: tatsächliches Konto, Standardablage, Board/Spalten, Mindmap und feste Kennungen zurücklesen. Bei unklarem Ausgang denselben Vorgang prüfen.
2. Wiederaufnahme und gemeinsame Inhaltsbearbeitung an ausdrücklich gewählten Ressourcen gesondert prüfen. Keine automatische Hintergrundsynchronisation zugesagt.
3. Danach den Projektweg verständlich öffentlich ankündigen; Bild-/Videomaterial folgt als eigener Schritt.
4. Den älteren externen DPAPI-Startweg und einen unabhängigen Erstinstallations-/Updatepfad weiter aufarbeiten. Die allgemeine Modell-/UX-Matrix bleibt bis zur vereinbarten Wiederaufnahme pausiert.
5. Die übrigen definierten Bedingungen von Paket1 weiterbearbeiten. Die aktuellen Zählungen sind keine Schätzung des gesamten verbleibenden Zeitaufwands.

## Lizenzrichtung und Bereitstellung

Die eigenen veröffentlichten Dateien der nativen GitHub-Brücke, des zusammengeführten App-Quellpakets und des zusammengehörigen Online-/Browser-Pakets stehen unter **AGPL-3.0-or-later**. Die vollständigen Lizenztexte liegen bei den Komponenten; unveränderte Nextcloud-Testfixtures und fremde Lizenztexte behalten ihre jeweiligen Versions- und Urheberhinweise. Für weitere AGPL-gebundene beziehungsweise entsprechend eingebundene Nextcloud-Bestandteile wird dieselbe Lizenzrichtung umgesetzt.

Für rechtlich eigenständige eigene Bestandteile können gesonderte kommerzielle Nutzungs- und Weiterverwendungsbedingungen vorgesehen werden, soweit die vorhandenen Rechte und Abhängigkeiten dies erlauben. Fremdsoftware behält ihre jeweiligen Lizenzbedingungen.

Die [Lizenzzuordnung](LICENSING.md) nennt den bereits veröffentlichten Umfang. Weitere Komponenten werden jeweils mit ihren erforderlichen Lizenzunterlagen bereitgestellt. Diese Entwicklungsübersicht erteilt keine pauschale Lizenz für unveröffentlichte Software. Das spätere Angebot kann auch vergütete Einrichtung, Wartung oder Betrieb umfassen.

## Fortschreibung

Diese Übersicht und die zugehörigen Aufgaben halten einen datierten Entwicklungsstand fest. Weitere Änderungen werden anhand geprüfter Ergebnisse nachgeführt. Fragen und konkrete Anwendungsfälle können über die [Issues](https://github.com/Windwanderer74/novaspace-connector/issues) eingebracht werden.