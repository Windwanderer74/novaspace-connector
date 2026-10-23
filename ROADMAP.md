# Entwicklungsübersicht · Nextcloud Connector von Nova Space

Stand: **23. Oktober 2026**

Nova Space entwickelt eine KI-Anbindung für unterstützte Nextcloud-Funktionen. Diese Übersicht macht den vorhandenen Betrieb, vorbereitete Erweiterungen und die verbleibenden Arbeitsschritte nachvollziehbar.

## Aktueller Stand

- Der Online-Anschluss ist im vorhandenen Arbeitsumfeld in Version **1.31.1** eingebaut.
- Der persönliche LM-Studio-Anschluss hat einen eigenen Versions- und Einbaustand. Ein Online-Update aktualisiert ihn nicht automatisch.
- Ein Entwicklungsstand **1.32** mit zusätzlichen Funktionen ist technisch vorbereitet. Er ist noch kein gemeinsam ausgeliefertes oder praktisch abgenommenes Release.
- Projekt- und Profilvorstellung sowie vier zugeordnete Entwicklungsaufgaben sind veröffentlicht.
- Als erstes Quellmodul liegt die [native GitHub-Brücke 0.1.0](components/nextcloud/github-bridge/README.md) unter **AGPL-3.0-or-later** vor: drei PHP-Klassen, vorhandener Kerntest, vollständiger Lizenztext und Dateiherkunft. Vier Syntaxprüfungen und 34 isolierte Kernprüfungen sind erfolgreich.
- Das [Quellpaket der nativen Plattform-App](components/nextcloud/platform/README.md) führt den App-Baum mit Hilfe ui.7 und GitHub-Brücke zusammen. AGPL, Fremdhinweise, inaktive Beispielkonfiguration, Tests und reproduzierbare Quell-/App-Archive sind enthalten.
- 32 PHP-Dateien und die isolierten Funktionsprüfungen des App-Pakets sind erfolgreich geprüft. Der ergänzte Quellabgleich bestätigt alle 26 gemeldeten Dateien des laufenden App-Baums einschließlich GitHub-Route und Metadaten. Die frühere XML-Abweichung ist aufgelöst: Die Betriebsmetadaten deklarieren Nextcloud 34–35; diese Deklaration ersetzt keine praktische Kompatibilitätsprüfung. Das ist noch kein abgenommenes Produktionsupdate oder Gesamt-Connector-Release; der [Quellstand](docs/SOURCE_STATUS.md) führt die Abgrenzung.

## Arbeitspakete und Aufgaben

| Bereich | Dokumentierter Stand | Führende GitHub-Aufgabe |
|---|---|---|
| Produktweg und verständliche Einrichtung | Zwei von acht Produktbedingungen belegen interne Grundlagen; die allgemeine Produktabnahme ist offen. | [Produktweg](https://github.com/Windwanderer74/novaspace-connector/issues/1) |
| Drei Lieferpakete | Alltag/Planung, Kommunikation/Daten und Fachfunktionen/Office sind abgegrenzt. Noch kein Paket ist als Ganzes abgeschlossen. | [Lieferplan](https://github.com/Windwanderer74/novaspace-connector/issues/2) |
| Paket 1: Alltag und Planung | Acht Basisbedingungen und drei technische Vorbereitungsergebnisse sind belegt; 21 der 32 Abschlussbedingungen sind offen. | [Paket 1](https://github.com/Windwanderer74/novaspace-connector/issues/3) |
| Quellübernahme und Entwicklungsablauf | GitHub-Modul und zusammengeführtes natives App-Quellpaket sind mit Lizenz, Herkunft und Tests veröffentlicht. Der Quellabgleich ist dokumentiert; praktische App-Abnahme und weitere Connector-Komponenten bleiben offen. | [Entwicklungsweg](https://github.com/Windwanderer74/novaspace-connector/issues/4) |

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

- Das native App-Quellpaket in einer getrennten Nextcloud-Umgebung praktisch abnehmen: Migrationen, HTTP-/CSRF-Verhalten, Widerruf und optionale externe App-Schnittstellen.
- Für weitere Komponenten die tatsächlich benötigten Abhängigkeiten und übernehmbare Versionsgeschichte vollständig abgrenzen; die [Lizenzzuordnung](LICENSING.md) dateigenau fortführen.
- Den ersten Abgleich der zugeordneten Aufgaben prüfen und sein Ergebnis nachvollziehbar festhalten.
- Erst danach eine begrenzte automatische Zuordnung mit vereinbarten Feldern, Konfliktbehandlung und Abschaltweg erproben.
- Die verbleibenden Abschlussbedingungen von Paket 1 weiterbearbeiten.

## Lizenzrichtung und Bereitstellung

Die eigenen veröffentlichten Dateien der nativen GitHub-Brücke und des zusammengeführten App-Quellpakets stehen unter **AGPL-3.0-or-later**. Die vollständigen Lizenztexte liegen bei den Komponenten; unveränderte Nextcloud-Testfixtures behalten ihre jeweiligen Versions- und Urheberhinweise. Für weitere AGPL-gebundene beziehungsweise entsprechend eingebundene Nextcloud-Bestandteile wird dieselbe Lizenzrichtung umgesetzt.

Für rechtlich eigenständige eigene Bestandteile können gesonderte kommerzielle Nutzungs- und Weiterverwendungsbedingungen vorgesehen werden, soweit die vorhandenen Rechte und Abhängigkeiten dies erlauben. Fremdsoftware behält ihre jeweiligen Lizenzbedingungen.

Die [Lizenzzuordnung](LICENSING.md) nennt den bereits veröffentlichten Umfang. Weitere Komponenten werden jeweils mit ihren erforderlichen Lizenzunterlagen bereitgestellt. Diese Entwicklungsübersicht erteilt keine pauschale Lizenz für unveröffentlichte Software. Das spätere Angebot kann auch vergütete Einrichtung, Wartung oder Betrieb umfassen.

## Fortschreibung

Diese Übersicht und die zugehörigen Aufgaben halten einen datierten Entwicklungsstand fest. Weitere Änderungen werden anhand geprüfter Ergebnisse nachgeführt. Fragen und konkrete Anwendungsfälle können über die [Issues](https://github.com/Windwanderer74/novaspace-connector/issues) eingebracht werden.

