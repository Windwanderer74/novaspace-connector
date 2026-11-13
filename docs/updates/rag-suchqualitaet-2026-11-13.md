# RAG-Ausbau: weitere Ordner und gezielte PDF-Seitenfunde

Stand: **13. November 2026 · weiterer Importstand und gezielte Suchkorrektur**

Der bestehende RAG-Ordnerbetrieb wurde erweitert und mit einem festen Suchprüfsatz untersucht. Zwei dabei belegte Lücken bei der Auswahl der PDF-Seite sind im laufenden Online-Anschluss **1.37.8** korrigiert. Der passende persönliche LM-Studio-Anschluss ist eingebaut; ein tatsächlicher Werkzeugaufruf belegt den neuen Suchschritt.

## Weitere Importetappe

Eine zusätzliche Etappe mit sieben ausdrücklich freigegebenen Bereichen umfasst **371 unterschiedliche Dateien**. Die lesende Prüfung vom 13. November bestätigt je Bereich einen aktuellen Import- und Prüfstand, einen zugeordneten Importjob, keinen gemeldeten Jobfehler und keinen verbliebenen Transfercheckpoint. Die neun vorher bestehenden Wurzeln und ihre Zuordnungen blieben in der Prüfung erhalten.

| Zustand der zusätzlichen Etappe | Dateien |
|---|---:|
| Indexiert | 288 |
| Weiterer OCR-Bedarf | 34 |
| Nicht unterstütztes Format | 47 |
| Nicht unterstützter E-Mail-Text | 2 |
| Gesamt | 371 |

Diese Zahlen beschreiben die zusätzliche Etappe zum Prüfzeitpunkt. Sie sind keine laufend aktuelle Gesamtstatistik aller Ordner. Ein abgeschlossener Import mit dokumentierten Ausnahmen bedeutet nicht, dass sämtliche Inhalte vollständig durchsuchbar sind. Die 83 Restfälle bleiben gesammelt für eine eigene Bearbeitung.

Der vorhandene Importjob wird inzwischen nach fünf statt fünfzehn Minuten fällig. Zeit-/Mengenbudget und Parallelitätsschutz bleiben erhalten. Das Intervall ist keine Zusage einer sofortigen Verarbeitung jeder Datei.

## Suchqualität mit festem Prüfsatz

Vor dem Lauf wurden 20 Fälle mit unveränderten Sollbelegen festgeschrieben: sechs genaue Suchbegriffe, sechs frei formulierte Fragen, vier Fragen mit Ablenkern und vier Negativfälle.

In der Basismessung des Online-Anschlusses 1.37.6 lag bei den 16 als beantwortbar festgelegten Fragen die erwartete Datei-/Seitenfassung in **9 Fällen auf Rang 1** und in **13 Fällen unter den ersten drei Treffern**. In 15 Fällen wurde zumindest die richtige Datei gefunden. Die Bewertung bindet die Treffer an die festgelegte Seite sowie die geprüfte Dateifassung.

Der gezielte kleine Prüfsatz ist keine statistische Schätzung für sämtliche Nutzerfragen. Er misst Fundstellen, keine vollständige generierte Antwortqualität. Bei zwei Negativfällen blieb die Suche leer; zwei weitere lieferten Dokumentkandidaten, ohne die fehlende Antwortinformation nachzuweisen.

Für die 20 Fallabfragen waren wegen acht zwischenzeitlicher HTTP-503-Abbrüche insgesamt 28 Werkzeugaufrufe nötig. Alle Fälle lieferten schließlich eine auswertbare Antwort. Technische Abbrüche bleiben im Versuchsnachweis und gelten weder als leere Suche noch als bewiesen behobene Fehlerursache. Der Lauf ist kein belastbarer Geschwindigkeitsvergleich.

## Korrektur der passenden PDF-Seite

Zwei freie Fragen fanden die richtige Bestellbestätigung, lieferten jedoch Seite 1 statt der benötigten Seite 2. Gesucht waren die Gesamtsumme beziehungsweise die Versandmethode.

Die begrenzte lexikalische Suchplanung prüft zuerst die Originalfrage und passende Inhaltswörter. Bei geeigneten Fragen mit einer Dokumentkennung kommt vor dem Rückfall auf die Kennung ein zusätzlicher Inhaltsbegriff hinzu. Dieser Schritt übernimmt nur PDF-Seiten, deren Dateiname die gefragte Kennung als abgegrenzten Bestandteil enthält. Bloße Teilkennungen und Textnotizen ersetzen dort keinen PDF-Beleg.

Fragen mit ausdrücklichen Ausschlüssen behalten vorerst den bisherigen Suchweg. Höchstens vier native Abfragen teilen sich ein Zeitbudget von 45 Sekunden. Konto, Freigabe, Ordner und aktuelle Dateifassungen werden weiter geprüft. Die gemeinsame Suchplanung gilt für die bereits berechtigten RAG-Ordner.

Beide ursprünglichen Seitenfragen lieferten online anschließend den erwarteten Beleg auf **Seite 2 und Rang 1**, mit passender Dateiversion und Prüfsumme. Ein zuvor erfolgreicher Vergleichsfall zum Auftragsdatum lieferte nach Eingrenzung eines Seiteneffekts wieder seinen bisherigen Beleg auf Seite 1.

Diese gezielte Nachprüfung ersetzt keinen neuen vollständigen 20-Fälle-Durchlauf. Der ursprüngliche Wert 13/16 bleibt als Basismessung erhalten.

## Persönlicher LM-Studio-Anschluss

Der vorhandene persönliche Kern **1.37.3-local.1** wurde mit dem Patch **NS-RAG-Seiten-r1** ergänzt. Die vollständige Windows-Einbauausgabe bestätigt Programmprüfung, erfolgreiche persönliche Startprüfungen und Aktivierung. Vorhandene Einstellungen und der vorherige Anschluss werden durch den geprüften Einbauweg erhalten.

Für die Gesamtsummenfrage liegt ein passender Ergebnisbericht aus LM Studio vor. Dessen Begleittext enthält allerdings eine alte Suchbezeichnung; er wird deshalb als Ergebnisbericht und nicht als vollständiger Werkzeugnachweis gewertet.

Für die Versandfrage liegt dagegen die direkte `files_search`-Ausgabe vor. Sie zeigt die unveränderte Originalfrage, zwei zunächst leere Suchschritte und anschließend `page_focus` mit dem Inhaltsbegriff „Versandmethode“. Der richtige PDF-Beleg erscheint auf Seite 2 mit passendem ETag und SHA-256. Die abschließende Modellantwort entspricht der Fundstelle.

Die Werkzeugantwort kennzeichnet Fundstellen weiterhin mit `answerVerified=false`. Ein passender Seitenbeleg ist von einer automatisch verifizierten Antwort zu unterscheiden. Die Methode bleibt **SQLite-FTS5-Volltextsuche mit begrenzter lexikalischer Fragenaufbereitung**.

## Offene Punkte und nächste Etappe

- Die Unterscheidung zweier ausdrücklich gegeneinander abgegrenzter Datumsfassungen ist als eigener Suchfall offen.
- Die Suchpegel „Schnell/Gründlich“ sind noch nicht umgesetzt oder verglichen.
- Die dokumentierten OCR- und Formatrestfälle bleiben getrennt gesammelt.
- Weitere vorhandene Ordner werden in einer überschaubaren Etappe ausgewählt, auf bestehende Freigaben und Überschneidungen geprüft und anschließend schrittweise erschlossen.
- Allgemeine Erstinstallation, weitere Konten und eine semantische Vektorsuche sind durch diese Nachweise nicht abgenommen.

Diese Fortschreibung führt den öffentlichen Entwicklungsstand fort. Persönliche Dokumentnamen, Pfade, Kontodaten und Originalprüfsummen werden nicht veröffentlicht. Die vorhandenen öffentlichen Programmquellen und Downloads behalten ihren jeweils datierten Stand; diese Dokumentationsveröffentlichung enthält kein neues Installationspaket und keinen neuen Release-Tag.

Der [Bericht vom 12. November](rag-chatgpt-2026-11-12.md) bleibt als historischer Nachweis erhalten.
