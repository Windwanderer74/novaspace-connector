# Entwicklungsübersicht · Nextcloud Connector von Nova Space

Stand: **29. Oktober 2026**

Nova Space entwickelt eine KI-Anbindung für unterstützte Nextcloud-Funktionen. Diese Übersicht macht den vorhandenen Betrieb, vorbereitete Erweiterungen und die verbleibenden Arbeitsschritte nachvollziehbar.

## Aktueller Stand

- Online **1.36.0**, persönlich **1.36.0-local.1** und Themenauswahl **0.1.19** sind
  im vorhandenen Arbeitsumfeld eingebaut. Projekt-App **0.2.13** bleibt unverändert.
- **Paket 1: 29/32.** Die Funktionsblöcke sind auf der dokumentierten Belegbasis
  abgeschlossen. Die drei offenen Bedingungen sind A01, A02 und Z01.
- Eigene Einladung und Änderung sind mit Ergebnisrücklesen und gesondertem
  E-Mail-Eingang praktisch belegt. Absage und Masterserienantworten bleiben als
  isoliert geprüfte Wege mit den dokumentierten Rollen-/Umfangsgrenzen ausgewiesen.
- Der öffentliche Quellstand ist bereinigt und dateigenau zugeordnet.
  [Update 1.36](docs/updates/1.36.0.md) unterscheidet Einbau, Quellprüfung und Live-Belege.
- Die allgemeine Modell-/UX-Matrix bleibt pausiert. Die neue Modellschnittstelle
  ist kein pauschaler Zuverlässigkeitsnachweis für jedes lokale Modell.

Ein tatsächlicher Dateien-/Mindmap-Durchlauf mit Themenauswahl 0.1.19 ist erfolgreich:
Auswahl per Referenz, geprüfte Quellenkapsel und frisches Rücklesen bei unverändertem
Quelltext. [Testergebnis und Grenzen](docs/updates/0.1.19.md).

## Arbeitspakete und Aufgaben

| Bereich | Dokumentierter Stand | Führende GitHub-Aufgabe |
|---|---|---|
| Produktweg und verständliche Einrichtung | Zwei von acht Produktbedingungen belegen interne Grundlagen; die allgemeine Produktabnahme ist offen. | [Produktweg](https://github.com/Windwanderer74/novaspace-connector/issues/1) |
| Drei Lieferpakete | Alltag/Planung, Kommunikation/Daten und Fachfunktionen/Office sind abgegrenzt. Noch kein Paket ist als Ganzes abgeschlossen. | [Lieferplan](https://github.com/Windwanderer74/novaspace-connector/issues/2) |
| Paket 1: Alltag und Planung | **29 von 32 Bedingungen** belegt. Offen: fachliche Abnahme A01, Bedienungsabnahme A02 und gemeinsamer Abschluss Z01. | [Paket 1](https://github.com/Windwanderer74/novaspace-connector/issues/3) |
| Quellübernahme und Entwicklungsablauf | Aufbereitete Online-/persönliche Quellen **1.36 / Themen 0.1.19**, aktuelle native Hilfe und Scope-Korrektur mit Herkunft, Manifesten und Bauangaben. Bestehende native Integrationsnachweise behalten ihren jeweiligen historischen Umfang; zusätzliche Erstinstallationen und weitere Quellen-/Betriebsprüfungen bleiben getrennt. | [Entwicklungsweg](https://github.com/Windwanderer74/novaspace-connector/issues/4) |

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

1. **A01 – Fachliche Abnahme:** vorhandene Lese-/Schreib-, Rechte-, Konflikt- und
   Rücklesebelege für Paket 1 gebündelt abgleichen. Erfolgreiche Kalenderproben
   werden nicht erneut als Pflichtaufgabe angehängt.
2. **A02 – Bedienungsabnahme:** Schalter, Katalog, kombinierte Themenaufrufe,
   Bilddarstellung und tatsächliche Start-/Promptlaufzeit abschließend belegen.
   Einzelne Denkzeiten sind keine Messung der gesamten Promptlaufzeit.
3. **Z01 – Abschluss:** Ergebnisse und Grenzen festhalten, die zugehörigen
   Übersichten abgleichen und Paket 1 gemeinsam abschließen.

Paket 1 ist bis zu diesen drei Schritten als Ganzes offen. Die Zählung ist keine
Zeitgarantie und bedeutet nicht drei einzelne Werkzeugaufrufe.

## Lizenzrichtung und Bereitstellung

Die eigenen veröffentlichten Dateien der nativen GitHub-Brücke, des zusammengeführten App-Quellpakets und des zusammengehörigen Online-/Browser-Pakets stehen unter **AGPL-3.0-or-later**. Die vollständigen Lizenztexte liegen bei den Komponenten; unveränderte Nextcloud-Testfixtures und fremde Lizenztexte behalten ihre jeweiligen Versions- und Urheberhinweise. Für weitere AGPL-gebundene beziehungsweise entsprechend eingebundene Nextcloud-Bestandteile wird dieselbe Lizenzrichtung umgesetzt.

Für rechtlich eigenständige eigene Bestandteile können gesonderte kommerzielle Nutzungs- und Weiterverwendungsbedingungen vorgesehen werden, soweit die vorhandenen Rechte und Abhängigkeiten dies erlauben. Fremdsoftware behält ihre jeweiligen Lizenzbedingungen.

Die [Lizenzzuordnung](LICENSING.md) nennt den bereits veröffentlichten Umfang. Weitere Komponenten werden jeweils mit ihren erforderlichen Lizenzunterlagen bereitgestellt. Diese Entwicklungsübersicht erteilt keine pauschale Lizenz für unveröffentlichte Software. Das spätere Angebot kann auch vergütete Einrichtung, Wartung oder Betrieb umfassen.

## Fortschreibung

Diese Übersicht und die zugehörigen Aufgaben halten einen datierten Entwicklungsstand fest. Weitere Änderungen werden anhand geprüfter Ergebnisse nachgeführt. Fragen und konkrete Anwendungsfälle können über die [Issues](https://github.com/Windwanderer74/novaspace-connector/issues) eingebracht werden.
