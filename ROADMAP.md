# Entwicklungsübersicht · Nextcloud Connector von Nova Space

Stand: **23. Oktober 2026**

Nova Space entwickelt eine KI-Anbindung für unterstützte Nextcloud-Funktionen. Diese Übersicht macht den vorhandenen Betrieb, vorbereitete Erweiterungen und die verbleibenden Arbeitsschritte nachvollziehbar.

## Aktueller Stand

- Der Online-Anschluss ist im vorhandenen Arbeitsumfeld in Version **1.31.1** eingebaut.
- Der persönliche LM-Studio-Anschluss hat einen eigenen Versions- und Einbaustand. Ein Online-Update aktualisiert ihn nicht automatisch.
- Ein Entwicklungsstand **1.32** mit zusätzlichen Funktionen ist technisch vorbereitet. Er ist noch kein gemeinsam ausgeliefertes oder praktisch abgenommenes Release.
- Projekt- und Profilvorstellung sind veröffentlicht. Dieses Repository enthält derzeit die Projektvorstellung und Entwicklungsplanung; Programmquellcode und Installationspakete werden gesondert für die Bereitstellung vorbereitet.

## Arbeitspakete und Aufgaben

| Bereich | Dokumentierter Stand | Führende GitHub-Aufgabe |
|---|---|---|
| Produktweg und verständliche Einrichtung | Zwei von acht Produktbedingungen belegen interne Grundlagen; die allgemeine Produktabnahme ist offen. | [Produktweg](https://github.com/Windwanderer74/novaspace-connector/issues/1) |
| Drei Lieferpakete | Alltag/Planung, Kommunikation/Daten und Fachfunktionen/Office sind abgegrenzt. Noch kein Paket ist als Ganzes abgeschlossen. | [Lieferplan](https://github.com/Windwanderer74/novaspace-connector/issues/2) |
| Paket 1: Alltag und Planung | Acht Basisbedingungen und drei technische Vorbereitungsergebnisse sind belegt; 21 der 32 Abschlussbedingungen sind offen. | [Paket 1](https://github.com/Windwanderer74/novaspace-connector/issues/3) |
| Quellübernahme und Entwicklungsablauf | Die Präsentation steht. Komponentenabgrenzung, Quellbereitstellung und der Abgleich mit Mindmap/Deck werden schrittweise umgesetzt. | [Entwicklungsweg](https://github.com/Windwanderer74/novaspace-connector/issues/4) |

Die Zählungen beschreiben definierte Bedingungen. Sie sind keine Schätzung des verbleibenden Zeitaufwands oder der gesamten Produktreife.

## Geplanter Arbeitsablauf

1. Ziele und Zusammenhänge in der Projekt-Mindmap strukturieren.
2. Daraus konkrete Arbeitsschritte und überprüfbare Bedingungen in Deck ableiten.
3. Ausgewählte Entwicklungsaufgaben auf GitHub darstellen und dauerhaft zuordnen.
4. Änderungen mit technischem Ergebnis und fachlicher Abnahme belegen.
5. Erledigung in Deck festhalten und die zugehörige Mindmap abgleichen.

Mindmap und Deck bleiben die interne Arbeitsgrundlage. GitHub zeigt eine ausgewählte, für die Öffentlichkeit aufbereitete Entwicklungssicht.

Der erste praktische Weg ist ein **Abgleich auf ausdrücklichen Auftrag**. Eine durchgängige automatische Hintergrundsynchronisation zwischen allen drei Systemen ist noch nicht abgenommen. Ein GitHub-Status „geschlossen“ ersetzt keine fehlende fachliche Abnahme.

## Nächste Schritte

- Vorhandene Komponenten, Herkunft, Abhängigkeiten und übernehmbare Versionsgeschichte vollständig abgrenzen.
- Die konkrete Lizenzzuordnung, erforderliche Hinweise und den vorgesehenen Auslieferungsumfang vorbereiten.
- Den ersten Abgleich der zugeordneten Aufgaben prüfen und sein Ergebnis nachvollziehbar festhalten.
- Erst danach eine begrenzte automatische Zuordnung mit vereinbarten Feldern, Konfliktbehandlung und Abschaltweg erproben.
- Die verbleibenden Abschlussbedingungen von Paket 1 weiterbearbeiten.

## Lizenzrichtung und Bereitstellung

Für AGPL-gebundene beziehungsweise entsprechend eingebundene Nextcloud-Bestandteile ist eine Veröffentlichung unter **AGPL-3.0-or-later** vorgesehen.

Für rechtlich eigenständige eigene Bestandteile können gesonderte kommerzielle Nutzungs- und Weiterverwendungsbedingungen vorgesehen werden, soweit die vorhandenen Rechte und Abhängigkeiten dies erlauben. Fremdsoftware behält ihre jeweiligen Lizenzbedingungen.

Die Komponentenabgrenzung und vollständigen Lizenzunterlagen werden vor der Softwarebereitstellung abgeschlossen. Diese Entwicklungsübersicht erteilt selbst keine neue Software-Nutzungslizenz. Das spätere Angebot kann auch vergütete Einrichtung, Wartung oder Betrieb umfassen.

## Fortschreibung

Diese Übersicht und die zugehörigen Aufgaben halten einen datierten Entwicklungsstand fest. Weitere Änderungen werden anhand geprüfter Ergebnisse nachgeführt. Fragen und konkrete Anwendungsfälle können über die [Issues](https://github.com/Windwanderer74/novaspace-connector/issues) eingebracht werden.
