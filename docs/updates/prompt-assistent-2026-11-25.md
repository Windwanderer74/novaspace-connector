# Prompt-Assistent und persönlicher Projekt-Leseweg

Stand: **25. November 2026**.

## Erste benutzbare Stufe

Der [NovaSpace-Prompt-Assistent](https://novaspace.info/index.php/apps/novaspace_site/ki-einrichten) führt von einer Aufgabe zu einer Arbeitsanweisung für den eigenen KI-Client. Die vier Bereiche sind **Unterlagen verstehen**, **Projekte bearbeiten**, **Arbeit organisieren** und **KI einrichten**.

Für den erprobten Einstieg **Bestehendes Projekt weiterführen** stehen eine Vorschau und eine Kopierfunktion bereit. Freiwillige Angaben können den Auftrag näher bestimmen. Die Arbeitsanweisung beginnt mit dem vorhandenen Stand, den tatsächlich zugänglichen Quellen und den geltenden Berechtigungen.

Der Prompt erteilt keine Zugriffsrechte. Der KI-Client braucht eine passende Verbindung zu NovaSpace; deren Freigaben und die nativen Kontorechte bleiben maßgeblich.

## Was praktisch bestätigt ist

| Prüfung | Bestätigter Umfang |
|---|---|
| Oberfläche | Die erste Stufe ist eingebaut und persönlich aufgerufen. |
| Kopieren | Der Projektverantwortliche bestätigt den blauen Kopierbutton und das anschließende Einfügen. Ein unabhängiger bytegenauer Volltextvergleich ist damit nicht behauptet. |
| Mindmap | Die Dateinamensuche findet die vorhandene Projektdatei; die anschließend gelesene Mindmap liefert den Arbeitsknoten und seine Kartenbindung. |
| Deckkarte | Nach einer ausdrücklichen zweiten Nachricht wird die gebundene Karte gelesen. Kartenkennung, aktuelle Liste und dokumentierter Bedingungsstand sind nachvollziehbar. |
| Projektstand | Die Pilotaufgabe steht bei **4/5 Bedingungen**. Die abschließende Auswertung des durchgängigen Piloten bleibt offen. |

Der persönliche Versuch verwendet **Profil 0.1.1** und den eingebauten **NovaSpace-Connector 0.1.30** in LM Studio. Er bestätigt einen begleiteten Leseweg mit zwei Nachrichten. Im ersten Teil las das Modell Suche und Mindmap, ließ die angeforderte Kartenlesung jedoch aus. Die gezielte Nachfrage ergänzte diese Quellenlesung erfolgreich.

Die gespeicherten Projektangaben bleiben dokumentierter Stand. Dieser Versuch führt keine Geräteabfragen aus und bestätigt keinen heutigen Betriebszustand der im Projekt beschriebenen Systeme.

## Gezielte Korrekturen im persönlichen Anschluss

Die praktische Erprobung machte mehrere unterschiedliche Probleme sichtbar. Die Korrekturen betreffen jeweils den passenden Schritt:

- **Dateiauswahl:** Eine Namenssuche und die Auswahl einer erwarteten Datei-ID werden als Dateiauswahl behandelt. Sie lösen keine Auswahl einer RAG-Pilotquelle aus.
- **Lesereferenz:** Die Datei wird im tatsächlich handelnden Konto ausgewählt. Die nachfolgende Lektüre verwendet eine frische Referenz aus diesem Suchlauf.
- **Werkzeugantworten:** Nachweislich identische doppelte Inhaltsdarstellungen werden für die Modellausgabe zusammengeführt. Andere Inhalte bleiben erhalten.
- **Kartenposition:** Historische Anlageinformationen in einer Mindmap können eine frühere Liste nennen. Der Kartenleser ermittelt die aktuelle Position derselben Karte im bekannten Board und liest anschließend diese Karte. Eine zusätzlich übergebene historische Listen-ID gilt nicht als aktueller Positionsnachweis.

Die vorhandenen Rechte-, Identitäts- und Versionsprüfungen bleiben wirksam. Eine erfolgreich gelesene Karte ist von einem zusätzlichen Nachweis für ihre Bearbeitung getrennt; fehlt dieser Bearbeitungsnachweis, entsteht daraus keine Schreibfreigabe.

Technische Prüfungen der Korrekturen und der bestätigte Einbau sind dokumentiert. Sie ersetzen die gesonderten praktischen Modell- und Bedienungsprüfungen nicht.

## Was bei der Auswertung offen bleibt

Im begleiteten Modellversuch traten neben dem ausgelassenen Kartenaufruf zwei inhaltliche Ungenauigkeiten auf: Ein Listenname wurde falsch wiedergegeben, und ein älterer Wiedereinstiegsabschnitt wurde gegenüber dem neuesten dokumentierten Haltepunkt bevorzugt. Die bloße erfolgreiche Werkzeugausführung reicht deshalb nicht für die vollständige Modellabnahme.

Der nächste überschaubare Bedienungstest ist die Änderung und das Rücksetzen **einer** freiwilligen Antwortoption. Für die weitere Modellprüfung sind anschließend drei Punkte maßgeblich:

1. Mindmap und aktuelle Deckkarte innerhalb eines selbstständig bearbeiteten Auftrags tatsächlich lesen.
2. Den neuesten dokumentierten Haltepunkt anhand der gelesenen Quellen auswählen.
3. Gespeicherten Projektstand, historische Angaben und frisch geprüften Betriebszustand zuverlässig unterscheiden.

Der erfolgreiche begleitete Leseweg und die bestätigte Kopierfunktion bleiben als erreichte Teilergebnisse bestehen.

## Öffentlicher Stand und nächste Fortschreibung

Der Prompt-Assistent wurde in NovaSpace angekündigt. Der Projektverantwortliche hat den zugehörigen Instagram-Beitrag als veröffentlicht bestätigt.

Diese GitHub-Fortschreibung aktualisiert die Projektbeschreibung, die Roadmap und den datierten Prüfbericht. Die öffentlichen Programmquellen und Downloads behalten ihre bisherigen Versionsangaben; ein neues allgemeines Installationspaket wird hiermit nicht ausgeliefert. Die [Quellübersicht](../SOURCE_STATUS.md) beschreibt diese Trennung.

Grundlage dieses Berichts sind das geführte Projektprotokoll, der versionsgeprüfte Aufgabenstand, die vom Projektverantwortlichen bereitgestellten Installations- und LM-Studio-Ausgaben sowie seine persönliche Kopierbestätigung. Interne Kontokennungen, Projektdateien und Zugangsdaten werden für diesen Bericht nicht übernommen.
