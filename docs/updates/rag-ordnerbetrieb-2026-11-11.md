# Automatischer RAG-Ordnerbetrieb: erste Ausbauetappe abgenommen

Stand: **11. November 2026 · Abschluss der ersten Ausbauetappe, 5/5 Aufgabenbedingungen**

Der bisherige NovaSpace-RAG-Pilot wurde vom einzelnen Dokument auf ausdrücklich freigegebene Ordner erweitert. Nextcloud hält Originale und aktuelle Dateirechte; der Suchdienst läuft auf dem vorhandenen ROCK 5C.

## Was hinzugekommen ist

Ein Hintergrundjob prüft freigegebene Ordner einschließlich ihrer Unterordner. Das konfigurierte Intervall beträgt 15 Minuten; es ist keine Zusage einer sofortigen Indexierung nach dem Upload. Neue und geänderte Dateifassungen werden übernommen. Bereits bestätigte unveränderte Fassungen werden weiterverwendet.

Der getrennte OCR-Ablauf ergänzt bei erfassten Scan-PDFs eine Textschicht. Der RAG-Import verarbeitet anschließend die daraus entstandene Dateifassung. Im Pilot wurde eine ursprünglich bildbasierte PDF vom Upload bis zum Treffer mit richtigem Seiten- und Versionsbeleg verfolgt.

Eine kontrolliert unterbrochene Übertragung setzte im selben Lauf an der bestätigten Byteposition fort; die abschließende Prüfsumme stimmte. Ein zweiter Ordner wurde über seine Freigabe aufgenommen. Nach Entzug der Freigabe war die Suche ausdrücklich gesperrt.

In der Dateiansicht zeigen OCR- und RAG-Marken den Zustand der jeweiligen Fassung. „RAG aktiv“ bezeichnet die Ordnerfreigabe. Daraus folgt nicht, dass jede Datei bereits erfolgreich indexiert ist.

## Erreichter Ausbau

Nach dem abgenommenen Ordnerpiloten wurden vier bestehende Arbeitsbereiche als nächste Etappe zugeschaltet. Die Importbelege passten zum geprüften Bestand, und aus jedem Bereich wurde eine Indexfundstelle bestätigt. Ein Unterordner wird über die Freigabe seiner Wurzel durchsucht.

Die gemeinsame Nutzung bereits indexierter Fassungen und die allgemeine Statusroute sind eingebaut. Nach einer Korrektur des Anzeigestarts wurde die sichtbare OCR-/RAG-Anzeige in einem bestehenden Arbeitsordner bestätigt.

Die Projektplanung verbindet die Aufgaben mit ihrer Mindmap und den zugehörigen Nachweisen. Eine korrigierte Projektzuordnung erhielt die Originalkarten und ihre Dokumentation.

## Abnahme der ersten Ausbauetappe

Die fünf Aufgabenbedingungen der Etappe mit vier bestehenden Arbeitsbereichen sind erfüllt. Die vorhandenen Import-, Unterordner- und Nachführungsnachweise werden durch den allgemeinen persönlichen Dateistatus und einen zusammenhängenden Betriebsnachweis ergänzt.

Nach dem Einbau bestätigt der persönliche Selbsttest den Dateistatus in allen vier freigegebenen Wurzeln und einem vorhandenen Unterordner über die Freigabe seiner Wurzel. Bestehende PDF- und Suchprüfungen sowie die persönliche Nextcloud-Identität blieben erfolgreich.

Der normale LM-Studio-Bedienweg wurde anschließend mit Statusprüfung und Inhaltssuche in einem bestehenden Arbeitsordner bestätigt. Eine PDF meldet eine vorhandene Textschicht und den RAG-Zustand `indexed`; die Inhaltssuche liefert eine Fundstelle auf Originalseite 2. Die im persönlichen Ergebnis gemeldete SHA-256-Prüfsumme stimmt mit der unabhängig vollständig gelesenen Originaldatei überein. Die Trefferseite wurde zusätzlich gerendert und visuell geprüft. Datei-ID, ETag und Größe waren nach dem Originalabruf unverändert.

Der Abschluss verbindet den bestehenden automatischen Importbeleg mit der aktuellen persönlichen Status-/Suchantwort und der geprüften Originalfundstelle. Für den erfolgreichen normalen LM-Studio-Aufruf liegt die Ergebniszusammenfassung des Nutzers vor; die Originalprüfung erfolgte gesondert. Die bisherigen Importbelege wurden weiterverwendet. Aufgabenkarte, führender Mindmap-Knoten und Arbeitsprotokoll sind auf den Abschlussstand abgeglichen.

## Grenzen und nächste Etappe

- Die Verarbeitung gilt für ausdrücklich freigegebene Bereiche und bleibt an Konto, aktuelle Dateirechte und Dateifassung gebunden.
- Unterstützte Textformate, OCR-Bedarf und nicht unterstützte Formate werden getrennt ausgewiesen. Eine lesbare Datei ist nicht automatisch indexierbar.
- Die Wirkung von Löschung und Ordnerwechsel wurde ergänzend lokal geprüft. Das ist von den beschriebenen Live-Nachweisen zu unterscheiden.
- Die persönliche Nutzung verwendet die tatsächliche Nextcloud-Anmeldung und lokale Werkzeugauswahl. Der RAG-Schalter des Cloud-Anschlusses gilt weiterhin je Verbindung.
- Die aktuellen persönlichen Aufrufe benötigen einen genauen Ordnerpfad; die Statusabfrage außerdem eine ausdrückliche Datei-ID. Einfachere Auflösung von Ordnernamen bleibt eine mögliche Bedienverbesserung.
- Größere vorhandene Bereiche werden als nächste Etappe zunächst erfasst und ausgewählt, anschließend erschlossen. Die allgemeine Cloud-RAG-Anbindung für denselben Bestand folgt danach.
- Die Indexsuche verwendet SQLite FTS5 für Volltextsuche. Die Abnahme gilt für die vier freigegebenen Wurzeln mit ihren berechtigten Unterordnern. Eine flächendeckende Indexierung sämtlicher Nutzer und Dateien oder eine allgemeine semantische Vektorsuche ist damit nicht abgenommen.

Diese Fortschreibung beschreibt den belegten Betrieb und seine Grenzen. Die vorhandenen öffentlichen Programmquellen und Downloads behalten ihren jeweils datierten Stand; dieser Bericht veröffentlicht kein neues Installationspaket.

Die bisherige [Pilotabnahme](rag-pilot-2026-11-08.md) bleibt als historischer Nachweis erhalten.
