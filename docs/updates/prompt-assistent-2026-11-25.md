# Prompt-Assistent und persönlicher Projekt-Leseweg

Stand: **25. November 2026**.

## Aktueller Abschlussstand

Der von der [NovaSpace-Seite](https://novaspace.info/index.php/apps/novaspace_site/ki-einrichten) erzeugte Projekt-Prompt wurde nach den gezielten Korrekturen persönlich verwendet. Bestätigter Stand ist **Profil 0.1.3** mit dem eingebauten **NovaSpace-Connector 0.1.31** in LM Studio und dem Modell **google/gemma-4-e4b**.

Im abschließenden Versuch bearbeitete das Modell einen einzelnen rein lesenden Projektauftrag mit `files_search`, `mindmap_read` und `deck_read_card`. Die vom Projektverantwortlichen übermittelte Antwort nennt die richtige Kartenkennung, den aktuellen Listennamen mit ID, zwei erfüllte und vier offene Bedingungen sowie den maßgeblichen nächsten Schritt als wörtliches Zitat. Eine zusätzliche Nachricht zur nachgeholten Kartenlesung war in diesem Lauf nicht nötig.

Die erste Erprobungsaufgabe und die begrenzte Nachführung des erzeugten Projektprofils sind mit ihrer Auswertung abgeschlossen. Das ersetzt den nachfolgend erhaltenen früheren Zwischenstand als aktuelle Aussage zum persönlichen Lesepiloten.

## Was der persönliche Nachweis umfasst

| Prüfung | Ergebnis und Reichweite |
|---|---|
| Einbau und Oberfläche | Die Installationsausgabe bestätigt Einbau, Sicherung und Rückweg. Der Projektverantwortliche bestätigt die neue Vorschau. |
| Promptübernahme | Die Arbeitsanweisung wurde nach persönlicher Rückmeldung von der Seite kopiert und in LM Studio verwendet. Ein unabhängiger bytegenauer Volltextvergleich ist nicht behauptet. |
| Quellenlesung | Sichtbare Aufrufabfolge: Dateinamenssuche, Mindmap, aktuelle Deckkarte; kein Werkzeugfehler im abschließenden übermittelten Lauf. |
| Kartenposition und Bedingungen | Kartenkennung, aktuelle Liste und gespeicherte Checkliste stimmen mit der nativen Referenzlesung überein. |
| Nächster Schritt | Das Modell wählt den markierten gemeinsamen Aufgabeninhalt und zitiert die maßgebliche Zeile; es ersetzt diese nicht durch den älteren Verlaufsabschnitt. |
| Erhalt des Testbestands | Die Referenzkarte und die Testmindmap haben gegenüber dem festgehaltenen Ausgangsstand unveränderte Versionen. Sichtbar waren ausschließlich Leseaufrufe. |

Die praktische Auswertung beruht auf der übermittelten persönlichen LM-Studio-Ausgabe und dem Abgleich mit den nativen Quellen. Die Assistenz hat die persönliche Sitzung nicht unabhängig live beobachtet. Der Nachweis gilt für diesen dokumentierten Lauf und ist keine allgemeine Zuverlässigkeitsmessung.

## Was gezielt verbessert wurde

- **Namenssuche:** Das Projektprofil nennt `mode=name`, den tatsächlichen Dateinamen als `query` und eine kleine Treffergrenze. `source` entfällt bei der Namenssuche; es bezeichnet eine RAG-Pilotquelle. Nach einem Suchfehler verlangt die Anweisung den sofortigen Stopp.
- **Dateiidentität und Lesereferenz:** Die ausdrücklich gewählte Datei-ID wird am wirklichen Treffer geprüft. Suche, Auswahl und Lesen verwenden eine frische Referenz im tatsächlich handelnden Konto.
- **Kartenposition:** Der Kartenleser bestimmt die aktuelle Position derselben Karte im bekannten Board. Historische Listenkennungen aus Anlagevermerken werden nicht als aktueller Nachweis übernommen.
- **Aufgabeninhalt und Quellenpriorität:** Der Connector liefert `cardReading.currentPosition`, `cardReading.currentTask` und getrennte Checklistenangaben. Das erzeugte Profil erklärt ihre Verwendung und eine Rückfallebene für Clients ohne diese Felder. Die vollständige Kartenhistorie bleibt erhalten.
- **Dokumentation und Betriebsprüfung:** Eine frisch gelesene Datei, Karte oder Erledigt-Markierung bestätigt gespeicherte Projektangaben. Ein heutiger Geräte- oder Dienstzustand benötigt eine tatsächlich durchgeführte passende Prüfung mit Quelle und Zeitpunkt.

Der ursprüngliche Bedienungsversuch verwendete Profil 0.1.1 und Connector 0.1.30. Profil 0.1.2 übernahm anschließend die persönlich erprobte Quellenpriorität. Ein weiterer Versuch scheiterte an `source=file` bei einer Namenssuche und einem nachfolgenden Aufruf mit bloßem Dateinamen. Profil 0.1.3 präzisiert deshalb Suchparameter und Fehlerstopp. Der abschließende persönliche Lauf gelang danach im beschriebenen Umfang.

## Technische Prüfung und verbleibende Grenzen

Die Revision 0.1.3 besteht **13 JavaScript-Prüffälle**, **14 Installer-Prüffälle**, die native Profil-/Funktionskatalogprüfung und die PHP-Syntaxprüfung. Die Prüfungen umfassen erzeugten und kopierten Text, Erhalt der übrigen Profile, Abweichungsstopp und bytegenaue Rücknahme. Diese Revision tauscht ausschließlich die Profildatei aus; sechs weitere Aufgabenprofile, gemeinsame Grundlage, Oberfläche, Controller und Kopierfunktion bleiben erhalten.

Der vorhandene Connector 0.1.31 war zuvor eingebaut. Seine Korrektur zur erwarteten Datei-ID besteht weiterhin die vier gezielten SDK-/Kern-Prüffälle. Die Profilrevision erfordert kein zusätzliches Connector-Update.

In der abschließenden Modellantwort bleibt die Überschrift „Heute geprüfter Zustand“ für das bloße Lesen gespeicherter Häkchen unscharf. Zutreffend ist: Der gespeicherte Erledigt-Stand wurde frisch gelesen; die technische Erfüllung wurde dadurch nicht erneut geprüft. Eine ausgegebene genaue Quellen-Unterpfadangabe ist ebenfalls nicht als tatsächlicher JSON-Pfad belegt. Diese Grenzen sind Teil der Auswertung.

Kein heutiger Geräte-, Host- oder Dienstzustand wurde geprüft. Schreibfähigkeit, weitere Aufgabenprofile und zusätzliche Clients sind nicht pauschal abgenommen. Bestehende Rechte-, Identitäts- und Versionsprüfungen sowie fehlende Bearbeitungsnachweise behalten ihre Wirkung.

## Öffentlicher Veröffentlichungsumfang

README, Roadmap, Quellübersicht und dieser Prüfbericht werden nachgeführt. Die bereits veröffentlichten Programmquellen, Komponentenmanifeste, Prüfsummen und Downloads behalten ihre jeweiligen Versionsstände. Die genannten persönlichen Betriebsfassungen sind damit kein neues allgemeines Installationspaket. Die [Quellübersicht](../SOURCE_STATUS.md) erläutert diese Einordnung.

Die vorhandene NovaSpace-Ankündigung und der vom Projektverantwortlichen als veröffentlicht bestätigte Instagram-Beitrag bleiben bestehen. Diese Dokumentationsfortschreibung ist keine weitere Social-Media-Veröffentlichung.

---

## Historischer Zwischenstand vom selben Tag

Der folgende frühere Bericht bleibt als Entwicklungsverlauf erhalten. Seine Angaben zu Profil 0.1.1, Connector 0.1.30, zwei Nachrichten und noch offenen Pilotbedingungen beschreiben den damaligen Zwischenstand.

### Erste benutzbare Stufe

Der [NovaSpace-Prompt-Assistent](https://novaspace.info/index.php/apps/novaspace_site/ki-einrichten) führt von einer Aufgabe zu einer Arbeitsanweisung für den eigenen KI-Client. Die vier Bereiche sind **Unterlagen verstehen**, **Projekte bearbeiten**, **Arbeit organisieren** und **KI einrichten**.

Für den erprobten Einstieg **Bestehendes Projekt weiterführen** stehen eine Vorschau und eine Kopierfunktion bereit. Freiwillige Angaben können den Auftrag näher bestimmen. Die Arbeitsanweisung beginnt mit dem vorhandenen Stand, den tatsächlich zugänglichen Quellen und den geltenden Berechtigungen.

Der Prompt erteilt keine Zugriffsrechte. Der KI-Client braucht eine passende Verbindung zu NovaSpace; deren Freigaben und die nativen Kontorechte bleiben maßgeblich.

### Was praktisch bestätigt ist

| Prüfung | Bestätigter Umfang |
|---|---|
| Oberfläche | Die erste Stufe ist eingebaut und persönlich aufgerufen. |
| Kopieren | Der Projektverantwortliche bestätigt den blauen Kopierbutton und das anschließende Einfügen. Ein unabhängiger bytegenauer Volltextvergleich ist damit nicht behauptet. |
| Mindmap | Die Dateinamensuche findet die vorhandene Projektdatei; die anschließend gelesene Mindmap liefert den Arbeitsknoten und seine Kartenbindung. |
| Deckkarte | Nach einer ausdrücklichen zweiten Nachricht wird die gebundene Karte gelesen. Kartenkennung, aktuelle Liste und dokumentierter Bedingungsstand sind nachvollziehbar. |
| Projektstand | Die Pilotaufgabe steht bei **4/5 Bedingungen**. Die abschließende Auswertung des durchgängigen Piloten bleibt offen. |

Der persönliche Versuch verwendet **Profil 0.1.1** und den eingebauten **NovaSpace-Connector 0.1.30** in LM Studio. Er bestätigt einen begleiteten Leseweg mit zwei Nachrichten. Im ersten Teil las das Modell Suche und Mindmap, ließ die angeforderte Kartenlesung jedoch aus. Die gezielte Nachfrage ergänzte diese Quellenlesung erfolgreich.

Die gespeicherten Projektangaben bleiben dokumentierter Stand. Dieser Versuch führt keine Geräteabfragen aus und bestätigt keinen heutigen Betriebszustand der im Projekt beschriebenen Systeme.

### Gezielte Korrekturen im persönlichen Anschluss

Die praktische Erprobung machte mehrere unterschiedliche Probleme sichtbar. Die Korrekturen betreffen jeweils den passenden Schritt:

- **Dateiauswahl:** Eine Namenssuche und die Auswahl einer erwarteten Datei-ID werden als Dateiauswahl behandelt. Sie lösen keine Auswahl einer RAG-Pilotquelle aus.
- **Lesereferenz:** Die Datei wird im tatsächlich handelnden Konto ausgewählt. Die nachfolgende Lektüre verwendet eine frische Referenz aus diesem Suchlauf.
- **Werkzeugantworten:** Nachweislich identische doppelte Inhaltsdarstellungen werden für die Modellausgabe zusammengeführt. Andere Inhalte bleiben erhalten.
- **Kartenposition:** Historische Anlageinformationen in einer Mindmap können eine frühere Liste nennen. Der Kartenleser ermittelt die aktuelle Position derselben Karte im bekannten Board und liest anschließend diese Karte. Eine zusätzlich übergebene historische Listen-ID gilt nicht als aktueller Positionsnachweis.

Die vorhandenen Rechte-, Identitäts- und Versionsprüfungen bleiben wirksam. Eine erfolgreich gelesene Karte ist von einem zusätzlichen Nachweis für ihre Bearbeitung getrennt; fehlt dieser Bearbeitungsnachweis, entsteht daraus keine Schreibfreigabe.

Technische Prüfungen der Korrekturen und der bestätigte Einbau sind dokumentiert. Sie ersetzen die gesonderten praktischen Modell- und Bedienungsprüfungen nicht.

### Was bei der Auswertung offen bleibt

Im begleiteten Modellversuch traten neben dem ausgelassenen Kartenaufruf zwei inhaltliche Ungenauigkeiten auf: Ein Listenname wurde falsch wiedergegeben, und ein älterer Wiedereinstiegsabschnitt wurde gegenüber dem neuesten dokumentierten Haltepunkt bevorzugt. Die bloße erfolgreiche Werkzeugausführung reicht deshalb nicht für die vollständige Modellabnahme.

Der nächste überschaubare Bedienungstest ist die Änderung und das Rücksetzen **einer** freiwilligen Antwortoption. Für die weitere Modellprüfung sind anschließend drei Punkte maßgeblich:

1. Mindmap und aktuelle Deckkarte innerhalb eines selbstständig bearbeiteten Auftrags tatsächlich lesen.
2. Den neuesten dokumentierten Haltepunkt anhand der gelesenen Quellen auswählen.
3. Gespeicherten Projektstand, historische Angaben und frisch geprüften Betriebszustand zuverlässig unterscheiden.

Der erfolgreiche begleitete Leseweg und die bestätigte Kopierfunktion bleiben als erreichte Teilergebnisse bestehen.

### Öffentlicher Stand und nächste Fortschreibung

Der Prompt-Assistent wurde in NovaSpace angekündigt. Der Projektverantwortliche hat den zugehörigen Instagram-Beitrag als veröffentlicht bestätigt.

Diese GitHub-Fortschreibung aktualisiert die Projektbeschreibung, die Roadmap und den datierten Prüfbericht. Die öffentlichen Programmquellen und Downloads behalten ihre bisherigen Versionsangaben; ein neues allgemeines Installationspaket wird hiermit nicht ausgeliefert. Die [Quellübersicht](../SOURCE_STATUS.md) beschreibt diese Trennung.

Grundlage dieses Berichts sind das geführte Projektprotokoll, der versionsgeprüfte Aufgabenstand, die vom Projektverantwortlichen bereitgestellten Installations- und LM-Studio-Ausgaben sowie seine persönliche Kopierbestätigung. Interne Kontokennungen, Projektdateien und Zugangsdaten werden für diesen Bericht nicht übernommen.
