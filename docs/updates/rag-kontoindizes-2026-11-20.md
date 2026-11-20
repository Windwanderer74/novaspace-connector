# RAG-Ausbau · Dateiformate und automatische Kontoindizes

Stand **20. November 2026**.

## Automatische Kontoimporte

Administratoren können RAG für ausgewählte Nextcloud-Gruppen freischalten. Der reguläre Hintergrundjob erkennt die berechtigten Konten und indexiert deren eigene Dateien in getrennten Kontoindizes. Für die Suche in geteilten Ordnern prüft NovaSpace die aktuelle Gruppenmitgliedschaft und die Leserechte an der Quelle. Die Suche setzt eine Anmeldung voraus.

Im laufenden System wurden **sieben Kontoaufträge** angelegt. Beim Statusabruf hatten **vier** einen Start verzeichnet. Für **mindestens einen zusätzlichen Kontoindex** hat der Indexdienst Suchbereitschaft bestätigt. Für die Abnahme der Mehrnutzer-Suche folgt eine Inhaltssuche unter der persönlichen Anmeldung eines neu freigeschalteten Kontos.

Die Kontoverarbeitung ist in dieser Ausbaustufe auf 2.000 Dateisystemeinträge und 4 GiB pro neuem Konto begrenzt. Pro Datei gilt eine Grenze von 64 MiB. Dateistatus und dokumentierte Ausnahmen zeigen, wie weit die Verarbeitung reicht.

## Dateibestand und Fundstellen

Beim Bestandsabgleich vom 20. November wurden **2.875 Dateifassungen** in **37 freigegebenen Bereichen** geprüft. **2.489 Dateien** waren indexiert. Die übrigen **386 Dateien** hatten andere dokumentierte Zustände. Dazu zählten OCR-Bedarf, Format- und Größengrenzen sowie teilweise verarbeitete Archive. Die Zahlen gelten für den Zeitpunkt dieses Abgleichs.

Die Hintergrundverarbeitung unterstützt PDF-Text, DOCX, XLSX und XML. Für einzelne PNG- und JPEG-Dateien kann die Texterkennung Inhalte durchsuchbar machen. Bei aktivierter ZIP-Verarbeitung benennt ein Treffer den betreffenden Archiveintrag. Für teilweise verarbeitete Archive gibt es einen eigenen Status.

Praktische Suchproben haben einen bekannten PDF-Text mit Seitenbezug, eine Markdown-Fundstelle und Text aus einer XML-Originaldatei geliefert. Die Fundstellen wurden mit Dateiversion und Prüfsumme belegt.

Der Bericht dokumentiert den Betriebsstand. Die veröffentlichten Programmquellen und Downloads sind in der [Quellübersicht](../SOURCE_STATUS.md) separat datiert.
