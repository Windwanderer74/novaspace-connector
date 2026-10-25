# Entwicklungsübersicht · Nextcloud Connector von Nova Space

Stand: **25. Oktober 2026**

Nova Space entwickelt eine KI-Anbindung für unterstützte Nextcloud-Funktionen. Diese Übersicht macht den vorhandenen Betrieb, vorbereitete Erweiterungen und die verbleibenden Arbeitsschritte nachvollziehbar.

## Aktueller Stand

- Im vorhandenen Arbeitsumfeld ist der Online-Anschluss **1.33.2** eingebaut; authentifizierte Versionsabfrage und Projektzugriff sind belegt.
- Der native Boardwechsel ist an vorhandenen Originalkarten einschließlich ausdrücklicher Mindmap-Bindungen praktisch nachgewiesen. Die führenden Connector-Aufgaben liegen nun in einem gemeinsamen internen Projektboard; bestehende GitHub-Issues behalten ihre feste Zuordnung. Die zusätzliche Kopierfunktion wurde zugunsten des gewählten Verschiebewegs nicht weiterverfolgt.
- Der persönliche Kern **1.32.0-local.1** und die Themenauswahl **0.1.11** wurden unter Windows mit Abschlusscode 0 installiert. Der Nutzer hat LM Studio neu gestartet und meldet die neuen Konnektoren als sichtbar.
- Die native Apphilfe/Policy wurde auf **0.4.0-ui.8** aktualisiert; Sicherung und genau zwei erwartete Dateiänderungen sind geprüft.
- Dieser **installierte Zwischenstand** ersetzt keine vollständige Paket-, Modell- oder Bedienungsabnahme. Die nachstehend veröffentlichten Quellsnapshots behalten ihre älteren Versionsstände; der öffentliche Quellabgleich der neueren Betriebsstände 1.32/1.33 steht aus. [Einbaunachweis und nächste Schritte](docs/updates/1.32.0.md).
- Projekt- und Profilvorstellung sowie vier zugeordnete Entwicklungsaufgaben sind veröffentlicht.
- Der [Online-Quellstand 1.31.1](components/online/connector/README.md) ist als bereinigter AGPL-Snapshot mit gemeinsamen Bibliotheken und Browser-Erweiterung aufbereitet. Worker und Browser-Bündel lassen sich bauen; 503 JavaScript-Prüfungen, zwei Prüfungen der gebauten Ausgabe und 16 Python-Prüfungen bestehen. Sichere Konfigurationsbeispiele, gesperrte historische Wartungsskripte, Herkunft und Fremdhinweise sind enthalten. Die laufende Installation wird dadurch nicht aktualisiert.
- Der [persönliche Quellstand](components/local/lmstudio/README.md) von Kern 1.31.0-local.1/Themen 0.1.10 ist aus dem vollständig hashgeprüften Original-ZIP übernommen: 200 Dateien im bereinigten Quellarchiv, beide Komponenten bauen, 41 JavaScript- und 16 Python-Prüfungen bestehen. Die ältere externe Python-Grundlage 0.1.13 ist nun am dokumentierten Installationscommit mit AGPL-Lizenz und Upstream-Lockfile [zugeordnet](docs/LEGACY_STARTUP_SOURCE.md). Der persönliche Windows-DPAPI-Wrapper, die installierte Paketinventur und ein unabhängiger Erstinstallationspfad bleiben offen.
- Als erstes Quellmodul liegt die [native GitHub-Brücke 0.1.0](components/nextcloud/github-bridge/README.md) unter **AGPL-3.0-or-later** vor: drei PHP-Klassen, vorhandener Kerntest, vollständiger Lizenztext und Dateiherkunft. Vier Syntaxprüfungen und 34 isolierte Kernprüfungen sind erfolgreich.
- Das [Quellpaket der nativen Plattform-App](components/nextcloud/platform/README.md) führt den App-Baum mit Hilfe ui.7 und GitHub-Brücke zusammen. AGPL, Fremdhinweise, inaktive Beispielkonfiguration, Tests und reproduzierbare Quell-/App-Archive sind enthalten.
- Frische vollständige Nextcloud-Testinstallationen **34.0.4 und 35.0.0** mit PHP **8.3.6** und MariaDB **10.11.14** bestehen jeweils **36 native Prüfungen**: Installation, sechs Migrationstabellen, persönliche Anmeldung, Freigabe, CSRF, Identitätstrennung, Hauptschalter, veraltete Formulare, Widerruf und echter Webserver-Neustart. [Testnachweis](components/nextcloud/platform/INTEGRATION_RESULTS.json).
- 32 PHP-Dateien und die isolierten Funktionsprüfungen des App-Pakets sind zusätzlich erfolgreich geprüft. Der ergänzte Quellabgleich bestätigt alle 26 gemeldeten Dateien des laufenden App-Baums einschließlich GitHub-Route und Metadaten. Die frühere XML-Abweichung ist aufgelöst: Die Betriebsmetadaten deklarieren Nextcloud 34–35; praktisch geprüft sind die oben genannten konkreten Kombinationen. Das ist noch kein abgenommenes Produktionsupdate oder Gesamt-Connector-Release; der [Quellstand](docs/SOURCE_STATUS.md) führt die Abgrenzung.

## Arbeitspakete und Aufgaben

| Bereich | Dokumentierter Stand | Führende GitHub-Aufgabe |
|---|---|---|
| Produktweg und verständliche Einrichtung | Zwei von acht Produktbedingungen belegen interne Grundlagen; die allgemeine Produktabnahme ist offen. | [Produktweg](https://github.com/Windwanderer74/novaspace-connector/issues/1) |
| Drei Lieferpakete | Alltag/Planung, Kommunikation/Daten und Fachfunktionen/Office sind abgegrenzt. Noch kein Paket ist als Ganzes abgeschlossen. | [Lieferplan](https://github.com/Windwanderer74/novaspace-connector/issues/2) |
| Paket 1: Alltag und Planung | 21 von 32 technischen Bedingungen sind belegt; 11 Bedingungen einschließlich restlicher Facharbeit und vollständiger Abnahme bleiben offen. Der installierte Zwischenstand schließt das Paket nicht ab. | [Paket 1](https://github.com/Windwanderer74/novaspace-connector/issues/3) |
| Quellübernahme und Entwicklungsablauf | Native Module und bereinigter Online-/Browser-Quellstand 1.31.1 sind mit Lizenz, Herkunft, Bauanleitung und Prüfungen veröffentlicht. Native Neuinstallation auf zwei dokumentierten Nextcloud-Versionen ist belegt. Älterer DPAPI-Startweg, weitere native Apps, Historienprüfung, Updates und erfolgreiche externe Zusatz-App-Abläufe bleiben offen. | [Entwicklungsweg](https://github.com/Windwanderer74/novaspace-connector/issues/4) |

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

- Bei vereinbarter Wiederaufnahme den vorhandenen Prüflauf für den persönlichen Zwischenstand 1.32 gezielt verwenden. Der grundlegende Konto-/Fähigkeits-/Hilfeabruf wurde bereits zurückgemeldet; die umfassende Modell-/Bedienungsabnahme ist derzeit pausiert.
- Die zu den neueren Betriebsständen gehörenden öffentlichen Quellsnapshots mit sicheren Beispielen, Herkunft und Fremdhinweisen gesondert nachführen. Die bisherigen öffentlichen Online-/LM-Studio-Snapshots bleiben bis dahin unverändert auf 1.31.1 beziehungsweise 1.31.0-local.1/Themen 0.1.10.
- Den älteren externen Windows-DPAPI-Startweg des persönlichen Anschlusses mit passendem Quell-/Lizenznachweis aufarbeiten und später den unabhängigen Erstinstallationspfad prüfen.
- Einen konkreten Updatepfad und erfolgreiche Abläufe mit den tatsächlich gewählten externen Zusatz-Apps gesondert abnehmen; weitere PHP-/Datenbank-/Webserverkombinationen bei Bedarf prüfen.
- Für weitere Komponenten die tatsächlich benötigten Abhängigkeiten und übernehmbare Versionsgeschichte vollständig abgrenzen; die [Lizenzzuordnung](LICENSING.md) dateigenau fortführen.
- Den ersten Abgleich der zugeordneten Aufgaben prüfen und sein Ergebnis nachvollziehbar festhalten.
- Erst danach eine begrenzte automatische Zuordnung mit vereinbarten Feldern, Konfliktbehandlung und Abschaltweg erproben.
- Die verbleibenden Abschlussbedingungen von Paket 1 weiterbearbeiten.

## Lizenzrichtung und Bereitstellung

Die eigenen veröffentlichten Dateien der nativen GitHub-Brücke, des zusammengeführten App-Quellpakets und des zusammengehörigen Online-/Browser-Pakets stehen unter **AGPL-3.0-or-later**. Die vollständigen Lizenztexte liegen bei den Komponenten; unveränderte Nextcloud-Testfixtures und fremde Lizenztexte behalten ihre jeweiligen Versions- und Urheberhinweise. Für weitere AGPL-gebundene beziehungsweise entsprechend eingebundene Nextcloud-Bestandteile wird dieselbe Lizenzrichtung umgesetzt.

Für rechtlich eigenständige eigene Bestandteile können gesonderte kommerzielle Nutzungs- und Weiterverwendungsbedingungen vorgesehen werden, soweit die vorhandenen Rechte und Abhängigkeiten dies erlauben. Fremdsoftware behält ihre jeweiligen Lizenzbedingungen.

Die [Lizenzzuordnung](LICENSING.md) nennt den bereits veröffentlichten Umfang. Weitere Komponenten werden jeweils mit ihren erforderlichen Lizenzunterlagen bereitgestellt. Diese Entwicklungsübersicht erteilt keine pauschale Lizenz für unveröffentlichte Software. Das spätere Angebot kann auch vergütete Einrichtung, Wartung oder Betrieb umfassen.

## Fortschreibung

Diese Übersicht und die zugehörigen Aufgaben halten einen datierten Entwicklungsstand fest. Weitere Änderungen werden anhand geprüfter Ergebnisse nachgeführt. Fragen und konkrete Anwendungsfälle können über die [Issues](https://github.com/Windwanderer74/novaspace-connector/issues) eingebracht werden.