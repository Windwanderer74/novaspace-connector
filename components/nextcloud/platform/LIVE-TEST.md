# NovaSpace KI Connector 0.6.0 – kleine Live-Testreihe

Stand: 31.10.2026. Native App 0.6.0 auf Nextcloud 35.0.2.2 / PHP 8.5.12,
Datenbankprovider mysql, Plattformtabellen InnoDB; Online-Connector 1.37.0.
Das hashgeprüfte Bestandsupdate0.5.0→0.6.0 bestätigt Programmdateien, Schema,
private Quellen-/Datenbanksicherung und unveränderte Inhalte aller sieben
Plattformtabellen einschließlich vorhandener Einzelrechte. Kein neues Schema
und keine Einzelregeln durch den Installer angelegt.

Die kurze produktive Stichprobe prüft automatische Speicherung, Erhalt nach
Neuladen, tatsächliche Zugriffssperre und bewusste Rücknahme. Sie ist kein
Volltest aller Werkzeuge, Mehrbenutzertest oder allgemeiner Erstinstallationsnachweis.

| Test | Vorgehen und Erwartung | Ergebnis |
| --- | --- | --- |
| T01 Ausgangslage | Kommentare einer vorhandenen Projektkarte und dieselbe Karte separat lesen. | BESTANDEN: beide MCP-Aufrufe erlaubt, regulär leere Kommentarliste. Bestehende Verbindung aktiv; Ausgangsrevision8, bereits konfigurierte Policyv2. |
| T02 Automatisch ausschalten | Nur „Kommentare einer Karte lesen“ ausschalten, automatische Rückmeldung abwarten, neu laden. Kommentarabruf muss gesperrt sein; Kartenlesen bleibt erlaubt. | BESTANDEN: Anwender bestätigt automatische Speicherung und Neuladen. Ausgeschaltete Auswahl unabhängig über Policy und MCP geprüft: `function_access_disabled` für `deck_list_comments`, Kartenlesen erfolgreich. Revision 9; exakt eine Funktion entfernt, übrige Einzelwahl, Hauptschalter, Bereichsmodi und zusätzliche Connectorrechte unverändert. |
| T03 Automatisch wieder einschalten | Dieselbe Funktion einschalten, „Gespeichert“ abwarten, neu laden. Kommentarabruf wieder erlaubt; ursprüngliche Auswahl vollständig wiederhergestellt. | BESTANDEN: Anwender bestätigt „Bleibt an“. Kommentarabruf wieder erfolgreich, gültiger Leerbefund. Revision 10; exakt dieselbe Funktion wieder hinzugefügt, keine andere entfernt. Vollständige ursprüngliche Policy und zusätzliche Rechte exakt wie vor der Probe; Verbindung aktiv. |

**Ergebnis: 3/3 bestanden.** Kein Kommentar oder künstlicher Fachinhalt angelegt;
keine Neuanmeldung und keine neue Verbindung. Geprüfte Funktion:
`deck_list_comments`; unabhängige Gegenprobe:`deck_read_card`.

Die lokalen Queue-/Controllerprüfungen ergänzen diese Stichprobe um schnelle
Eingaben, verlorene Antworten, identische Wiederholung und Versionskonflikte.
Solche Fehler wurden nicht künstlich in der produktiven Verbindung erzeugt.
Die Browserprüfung bei 390 px nutzte eine isolierte Vorschau; daraus folgt keine
vollständige Abnahme jedes Mobilgeräts oder Nextcloud-Themes.

Die vorherige manuelle Probe der App 0.5.0 bleibt als datierter Bericht in
[LIVE-TEST-0.5.0.md](LIVE-TEST-0.5.0.md) erhalten.
