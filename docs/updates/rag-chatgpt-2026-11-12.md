# RAG-Ausbau: weitere Ordner und Inhaltssuche im ChatGPT-Anschluss

Stand: **12. November 2026 · zweite Ordneretappe und Anschluss an ChatGPT abgenommen**

Der bestehende NovaSpace-RAG-Pilot erschließt weitere ausdrücklich freigegebene Arbeitsbereiche. Die Inhaltssuche und der OCR-/RAG-Dateistatus sind jetzt auch über den vorhandenen ChatGPT-Anschluss praktisch bestätigt. Der Suchdienst und die vorhandenen Indizes bleiben auf dem ROCK 5C; Nextcloud bleibt die Quelle für Originale, aktuelle Dateirechte und Fassungen.

## Vier weitere Arbeitsbereiche

Nach der [ersten Ausbauetappe](rag-ordnerbetrieb-2026-11-11.md) wurden vier weitere bestehende Bereiche als gemeinsames Paket erschlossen. Das geprüfte Inventar dieser zweiten Etappe umfasst 124 Dateien mit rund 168,94 MB. Freigabe, Import und Ausnahmen, persönlicher Dateistatus, Suchfundstelle und Originalvergleich wurden je Bereich dokumentiert. Die sichtbaren OCR-/RAG-Marken wurden vom Projektverantwortlichen in allen vier repräsentativen Unterordnern bestätigt. Die zweite Etappe ist mit **18/18 Aufgabenbedingungen** abgeschlossen.

Ein dokumentierter Zwischenstand dieser Etappe unterscheidet 104 indexierte Dateien und 20 Dateiausnahmen: 15 Fälle mit weiterem OCR-Bedarf, eine verschlüsselte PDF, drei nicht unterstützte Formate und einen nicht unterstützten E-Mail-Text. Das ist eine datierte Bestandsaufnahme und keine fortlaufend aktuelle Gesamtstatistik. Die Ausnahmen sind für eine gesonderte Korrekturrunde gesammelt; sie werden nicht als vollständig durchsuchbar ausgewiesen. Der Abschluss dieser Ausbauetappe umfasst den belegten Betrieb mit diesen dokumentierten Ausnahmen.

## Fortsetzung und verbleibende Dateiprobleme

Der Import arbeitet in begrenzten Etappen und setzt Übertragungen an bestätigten Zwischenständen fort. Unveränderte bestätigte Dateifassungen werden wiederverwendet. Ein unabhängiger Kontrolljob ist für die Wiederaufnahme nach einer nachweislich verwaisten Reservierung eingebaut. Ein lebender oder fremder Lauf darf dabei nicht freigegeben werden.

Begrenzte Wiederholungen und Wartezeiten trennen vorübergehende Übertragungsfehler von verbleibenden Dateiproblemen. Für Restfälle ist ein gebündelter Benachrichtigungsweg je Ordner über das vorhandene Glockensystem eingebaut. Zustellung, Wiederaufnahme der gespeicherten Meldung, Vermeidung von Doppelmeldungen und veränderte Rechte wurden isoliert geprüft. Eine tatsächliche erste Glockenzustellung aus diesem Lauf wurde nicht zusätzlich beobachtet. Ein einzelnes Dateiproblem soll unabhängige neue Dateien nicht dauerhaft blockieren.

## Inhaltssuche auch über ChatGPT

Der laufende Online-Connector **1.37.5** erweitert das bestehende Werkzeug `files_search`:

- `mode=content`: Inhaltssuche mit vollständigem sichtbarem Ordnerpfad und Suchbegriff in einem bereits freigegebenen Index, einschließlich berechtigter Unterordner.
- `mode=file_status`: OCR-/RAG-Zustand einer ausdrücklich ausgewählten Datei im gewählten Ordner.
- Die bisherige Namenssuche und die begrenzten Suchproben bleiben erhalten.

Das Konto ergibt sich aus der aktiven registrierten Verbindung, nicht aus einer frei gewählten Nutzerkennung im Suchargument. Der technische Zugriffspfad und die Ordner-ID werden gemeinsam signiert. Auf dem Hosting werden aktuelle Eigentümer- und technische Dateisicht, Ordnerrechte, Fassungen und Verbindung geprüft. Unterschiede oder Änderungen während der Anfrage führen zur Ablehnung.

Bei der ersten Live-Anbindung wurde die technische Ordnerauflösung mit HTTP 403 abgewiesen, obwohl der normale Dateizugang den Ordner lesen konnte. Die Ergänzung des ausdrücklich gebundenen Zugriffspfads wurde zunächst auf dem Hosting gegen eine bekannte Dateifassung geprüft und danach mit privater Sicherung eingebaut. Anschließend lieferten der tatsächliche ChatGPT-Dateistatus und die Inhaltssuche erfolgreiche Antworten. Bestehende Indizes wurden dafür nicht erneut importiert.

## Tatsächliche Nachweise

Im ChatGPT-Anschluss wurde für eine repräsentative PDF eine vorhandene Textschicht und der Zustand `indexed` bestätigt. Die Inhaltssuche im zugehörigen Unterordner lieferte zwei aktuelle Dokumente mit Fundstellen auf Seite 1. Datei-ID, ETag und SHA-256 der geprüften Zielquelle stimmen mit der bereits unabhängig abgenommenen Originalfassung überein.

Eine zweite echte Inhaltssuche in einem Bereich der ersten Ausbauetappe lieferte die bekannte PDF-Fundstelle auf Seite 2. Auch deren Dateiversion und Prüfsumme stimmen mit dem früheren Originalnachweis überein. Damit ist die Nutzung vorhandener Indizes aus beiden Ausbauetappen über diesen Anschluss belegt.

Die neue Anschlussgrenze wurde zusätzlich in fünf MCP-Testgruppen und 19 PHP-Grenzfällen geprüft. Dazu gehören signierte Anfragebindung, Pfad-/Ordner-ID-Wechsel, fehlende Rechte, geänderte Fassungen, Verbindungsentzug und technische Fehler. Installer-Syntax und produktiver Build sind geprüft. Simulierte Fehlerfälle sind von den beschriebenen echten Anfragen zu unterscheiden.

## Grenzen und weitere Arbeit

- Die Suche verwendet **SQLite FTS5 für Volltextsuche**, keine allgemeine semantische Vektorsuche.
- Die Abnahme gilt für den bestehenden berechtigten Pilotbestand. Eine allgemeine Erstinstallation für weitere Konten oder Kunden ist damit nicht abgenommen.
- Eine Anfrage liefert höchstens fünf Fundstellen. Eine erfolgreiche Suchantwort ist keine Vollständigkeitszusage für sämtliche Inhalte eines Ordners.
- OCR-Bedarf, verschlüsselte Dateien und nicht unterstützte Formate bleiben sichtbar und sind Teil der vorgesehenen Korrekturrunde.
- Die Verbindung erhält durch diese Erweiterung keine zusätzlichen pauschalen Dateirechte. Bestehende und neue technische Fehler werden als Fehler ausgegeben, nicht als angeblich leere Suchergebnisse.
- Aufgaben, Abnahmepunkte und Nachweise sind in der bestehenden Mindmap und im Deck verknüpft. Die erste Ausbauetappe bleibt abgeschlossen.

Diese Veröffentlichung dokumentiert den bestätigten Pilotbetrieb und seine Grenzen. Persönliche Dokumentnamen, Pfade, Kontodaten und Originalprüfsummen werden nicht veröffentlicht. Die vorhandenen öffentlichen Programmquellen und Downloads behalten ihren jeweils datierten Stand; dieser Bericht veröffentlicht kein neues allgemeines Installationspaket.
