# Automatischer RAG-Ordnerbetrieb: geprüfter Pilot und Ausbau in Etappen

Stand: **11. November 2026**

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

## Grenzen und verbleibende Arbeit

- Die Verarbeitung gilt für ausdrücklich freigegebene Bereiche und bleibt an Konto, aktuelle Dateirechte und Dateifassung gebunden.
- Unterstützte Textformate, OCR-Bedarf und nicht unterstützte Formate werden getrennt ausgewiesen. Eine lesbare Datei ist nicht automatisch indexierbar.
- Die Wirkung von Löschung und Ordnerwechsel wurde ergänzend lokal geprüft. Das ist von den beschriebenen Live-Nachweisen zu unterscheiden.
- Der allgemeine Dateistatus im persönlichen LM-Studio-Anschluss und der abschließende zusammenhängende Betriebsnachweis des erweiterten Umfangs bleiben offen.
- Eine flächendeckende Indexierung sämtlicher Nutzer und Dateien oder eine allgemeine semantische Vektorsuche wird damit nicht behauptet.

Diese Fortschreibung beschreibt den belegten Betrieb und seine Grenzen. Die vorhandenen öffentlichen Programmquellen und Downloads behalten ihren jeweils datierten Stand; dieser Bericht veröffentlicht kein neues Installationspaket.

Die bisherige [Pilotabnahme](rag-pilot-2026-11-08.md) bleibt als historischer Nachweis erhalten.
