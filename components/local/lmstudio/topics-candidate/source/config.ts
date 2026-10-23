// SPDX-License-Identifier: AGPL-3.0-or-later
import {createConfigSchematics} from '@lmstudio/sdk';

export const configSchematics = createConfigSchematics()
  .field('files','boolean',{displayName:'Datei',subtitle:'Dateien suchen, lesen, kopieren, anlegen und ordnen.'},false)
  .field('deck','boolean',{displayName:'Deck',subtitle:'Karten, Boards und Listen pflegen; Kommentare und Dateiverknüpfungen mit zusätzlichen Rechten.'},false)
  .field('mindmap','boolean',{displayName:'Mindmap',subtitle:'Mit benötigten Dateifunktionen. Für Karten-Verknüpfungen auch Deck wählen.'},false)
  .field('tasks','boolean',{displayName:'Aufgaben',subtitle:'Eigene Aufgabenlisten und Aufgaben pflegen; zusätzliche lokale Aufgabenrechte und native Rechte nötig.'},false)
  .field('contacts','boolean',{displayName:'Kontakte',subtitle:'Eigene Adressbücher pflegen, Kontakte bearbeiten und einzelne vCards nach Vorschau austauschen; Zusatzrechte gelten.'},false)
  .field('notes','boolean',{displayName:'Notizen',subtitle:'Notizen, Bilder und Textaustausch; gezieltes Löschen zusätzlich mit Papierkorbrecht. Lokale Zusatzrechte gelten.'},false)
  .field('calendar','boolean',{displayName:'Kalender',subtitle:'Termine und einfache Serien pflegen, gezielten ICS-Austausch nach Vorschau nutzen und freie Zeitfenster planen.'},false)
  .field('mail','boolean',{displayName:'E-Mails',subtitle:'Konten, Ordner und Nachrichten lesen. Kein Versand.'},false)
  .field('tables','boolean',{displayName:'Zusatz: Tabellen/Register',subtitle:'Tabellen lesen. Register- und Tabellen-Schreiben bleibt ein späterer Ausbau.'},false)
  .field('talk','boolean',{displayName:'Zusatz: Talk',subtitle:'Gespräche lesen. Kein Versand.'},false)
  .field('announcements','boolean',{displayName:'Zusatz: Mitteilungen',subtitle:'Mitteilungen lesen.'},false)
  .field('inventory','boolean',{displayName:'Altbestand: Inventory',subtitle:'Stillgelegte alte App; ausgeschaltet lassen. Die neue Geräte-App folgt separat.'},false)
  .field('sharing','boolean',{displayName:'Zusatz: Dateifreigaben ändern',subtitle:'Eigene Nutzer-/Gruppen-/geschützte Linkfreigaben verwalten; zusätzlich files:share am PC freigeben.'},false)
  .field('trash','boolean',{displayName:'Zusatz: Papierkorb verwalten',subtitle:'Eigene Heimspeicherobjekte löschen und gezielt wiederherstellen; zusätzlich files:trash am PC freigeben.'},false)
  .field('extraTools','stringArray',{displayName:'Einzelwerkzeuge zusätzlich',subtitle:'Optional: genaue Werkzeugnamen, ein Name pro Eintrag.',allowEmptyStrings:false},[])
  .field('excludedTools','stringArray',{displayName:'Einzelwerkzeuge ausnehmen',subtitle:'Optional: genaue Werkzeugnamen; Ausschluss hat Vorrang.',allowEmptyStrings:false},[])
  .build();
