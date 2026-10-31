# NovaSpace KI-Verbindungen 0.5.0 – kleine Live-Testreihe

Stand: 31.10.2026. Native App 0.5.0 auf Nextcloud 35.0.2.2 / PHP 8.5.12;
Online-Connector 1.37.0. Der Hosting-Installer hat Quellen, Schema, Sicherung
und Erhalt der bisherigen Verbindungsdaten bestätigt. Die Oberfläche mit
Arbeit, Kommunikation, Verwaltung und aufklappbaren Einzelrechten wurde vom
Anwender angesehen und positiv bestätigt.

Diese kurze produktive Stichprobe prüft gezielt Speichern, Durchsetzung und
Rücknahme einer Einzelberechtigung. Sie ist kein Volltest aller Werkzeuge,
kein Mehrbenutzertest und kein vollständiger externer Onboarding-Nachweis.

| Test | Vorgehen / Erwartung | Ergebnis |
| --- | --- | --- |
| T01 Ausgangslage | Kommentare einer vorhandenen Projektkarte lesen; dieselbe Karte separat lesen. Beide Aufrufe müssen erlaubt sein. | BESTANDEN: beide MCP-Aufrufe erfolgreich; regulär leere Kommentarliste. Verbindung aktiv. |
| T02 Einzelrecht aus | Nur „Deck-Kommentare einer Karte lesen“ ausschalten, speichern, Seite neu laden. Auswahl bleibt aus; direkter Kommentarabruf muss wegen Einzelregel abgewiesen werden, separater Kartenabruf weiterhin erfolgreich. | BESTANDEN: Anwender bestätigt gespeicherte Auswahl nach Neuladen. Direkter MCP-Aufruf liefert `function_access_disabled` für `deck_list_comments`; Kartenabruf erfolgreich. Verbindung aktiv, Bereichsrechte unverändert, v2-Einzelregel gespeichert. Keine erneute Anmeldung erforderlich. |
| T03 Wiederfreigabe | Dasselbe Einzelrecht einschalten, speichern, neu laden. Auswahl bleibt an; direkter Kommentarabruf wieder erfolgreich. Übrige Regeln bleiben erhalten. | BESTANDEN: Anwender bestätigt gespeicherte Auswahl nach Neuladen. Kommentar- und Kartenabruf erfolgreich. Exakt eine Funktion wieder aufgenommen; alle anderen Einzelwahlen, Bereichsstufen und bisherigen App-Rechte unverändert. Verbindung aktiv. |

Testfunktion: `deck_list_comments`, Bereich `deck`, ausschließlich lesend.
Kontrollfunktion: `deck_read_card`.
Die Testreihe legt keine Kommentare oder künstlichen Fachinhalte an.
Ausgangspunkt: gespeicherte Bereichspolicy v1, noch keine expliziten Einzelregeln.
Das erste Speichern darf die neue v2-Policy bewusst anlegen; verglichen werden
wirksame Bereichs- und Einzelrechte, nicht die ursprüngliche technische Revision.

Ergebnis: 3/3 bestanden. Die gezielte Sperre wirkt beim tatsächlichen MCP-Aufruf;
eine andere Funktion bleibt nutzbar. Nach Wiederfreigabe ist der ursprüngliche
wirksame Umfang wiederhergestellt. Die bewusst gespeicherte v2-Policy bleibt.
Keine erneute Anmeldung und keine Neuanlage der Verbindung erforderlich.

Die drei Tests ersetzen keine darüber hinausgehenden Produktabnahmen.
