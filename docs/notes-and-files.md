# Notizen mit Dateien und Deck verwenden

Die vorhandenen Notiz- und Dateiwerkzeuge arbeiten mit denselben nativen Dateien.
Zusätzliche Kopien oder eine zweite Aufgabenliste sind dafür nicht erforderlich.

| Ziel | Vorhandener Weg | Grenze |
| --- | --- | --- |
| Notizdatei finden | `notes_read`, danach `notes_resolve_file` | Tatsächliche Datei-ID und Originalpfad prüfen; keinen Pfad aus dem Titel erfinden. |
| Notiz teilen | Die geprüfte Originaldatei mit den vorhandenen Dateifreigabewerkzeugen gezielt freigeben | Eigenes Dateifreigaberecht und native Weitergabeberechtigung erforderlich. |
| Notiz mit einer Deckaufgabe verbinden | Notizlink im gewünschten Inhalt verwenden oder die Originaldatei mit `deck_attach_file` zuordnen | Eine Dateizuordnung gewährt aktuellen und späteren Kartenlesern Zugriff; ausdrücklich bestätigen. |
| Eigene Bilder prüfen | `notes_list_attachments` und vorhandene Dateileser | Nur der eigene Notiz-Anhangsordner; alte flache Verweise bleiben im Text. |
| Ein Bild einbinden | `notes_attach_image`, danach frisch lesen und den gelieferten Verweis mit `notes_update` einfügen | Bildkopie und sichtbare Texteinbindung sind zwei getrennte Schritte. |
| Notiztext austauschen | Vorhandener Textimport/-export | Bilder werden nicht automatisch kopiert; relative Links können am neuen Ort ungültig sein. |

**Eine freigegebene Notizdatei gibt die zugehörigen Bilddateien nicht automatisch
frei.** Vor einer zusätzlichen Freigabe jedes gewählte Objekt und dessen Empfänger
prüfen. Ein Link oder Textexport garantiert keine identische Darstellung beim
Empfänger. Eine allgemeine Mehrbenutzeransicht der Notizen-App ist keine Aussage
dieses technischen Abgleichs.

Notiz-, Datei-, Download- und Freigaberechte gelten jeweils für ihren eigenen
Schritt. Die Werkzeuge vergeben keine neuen Connectorrechte. Bei widersprüchlichen
Versionen frisch lesen; nach unklarem Upload denselben Anhangsbestand prüfen.
Keine automatische Wiederholung, Bereinigung oder Gesamtfreigabe auslösen.

Der technische Abgleich verwendet vorhandenen Code und 43 isolierte Prüfungen
zu Dateibindung, Bildbytes, Freigaben, Versionskonflikten und Rechte-/App-Grenzen.
Es wurden dafür keine echten Freigaben versendet oder neuen Testnotizen angelegt.
