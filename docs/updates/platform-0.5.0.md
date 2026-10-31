# Plattform-App 0.5.0 · 31. Oktober 2026

Die App **KI-Verbindungen** ergänzt den **NovaSpace Connector** um gespeicherte
Einzelrechte je Verbindung. **Arbeit**, **Kommunikation** und **Verwaltung**
gliedern die 19 vorhandenen Bereiche. Unter den Bereichs-Dropdowns lassen sich
einzelne Funktionen aufklappen und gezielt einschränken.

Das Update auf0.5.0 ist im bestehenden Betrieb installiert. Quell-/Datenbanksicherung,
native Migration und Erhalt der bisherigen Verbindungsdaten wurden bestätigt.
Der Online-Connector1.37.0 setzt die Auswahl bei tatsächlichen Aufrufen und
bestehenden Übertragungstickets durch.

| Kleine Live-Testreihe | Ergebnis |
| --- | --- |
| Ausgangslage: Kommentar- und Kartenabruf erlaubt | Bestanden |
| Einzelnes Kommentar-Leserecht aus, gespeichert und nach Neuladen erhalten; Kommentarabruf gesperrt, Kartenlesen weiter möglich | Bestanden |
| Wieder eingeschaltet und nach Neuladen erhalten; Kommentarabruf wieder erlaubt, übrige Auswahl unverändert | Bestanden |

**3/3 bestanden.** [Vollständiger kurzer Testbericht](../../components/nextcloud/platform/LIVE-TEST.md).

[App herunterladen](../../downloads/novaspace-platform-app-0.5.0.tar.gz) ·
[Prüfsummen](../../downloads/SHA256SUMS.txt) ·
[App-Quellen und Einbauhinweise](../../components/nextcloud/platform/README.md).

Die native App enthält sichere inaktive Gateway-Beispiele. Der ausgeführte Pilot
betrifft eine bestehende Verbindung auf Nextcloud35.0.2.2/PHP8.5.12; andere
Installations-/Mehrbenutzerabläufe behalten ihren eigenen Prüfbedarf. Paket1
bleibt mit32/32 gemeinsam abgenommen. Der persönliche LM-Studio-Anschluss bleibt
Kern1.36.3-local.1 / Plugin0.1.26; seine nächste Oberflächenfortschreibung ist
weiterhin gesondert.
