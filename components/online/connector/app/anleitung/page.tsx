// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";

export const metadata = {
  title: "Kurzanleitung · NovaSpace Connector",
  description: "Einrichten, Freigaben verstehen und mit konkreten Beispielen in NovaSpace arbeiten.",
};

const examples = [
  {
    title: "Den Überblick bekommen",
    prompt: "Zeige mir die offenen Deckkarten im Board [Name]. Fasse zusammen, was als Nächstes ansteht. Ändere dabei nichts.",
    note: "Nenne das Board oder eine bekannte Kartennummer. Aktive und archivierte Karten lassen sich gezielt auswählen; Labels und Zuständigkeiten können nach deiner Freigabe gesetzt werden.",
  },
  {
    title: "Eine Datei verstehen",
    prompt: "Öffne die Datei [Pfad oder genauer Name] und erkläre mir die wichtigsten Punkte. Nenne die verwendete Datei und bei einer PDF die Seiten.",
    note: "Bei einer gescannten PDF kann eine zusätzliche Texterkennung nötig sein. Die KI soll sagen, wenn sie den Inhalt nicht lesen kann.",
  },
  {
    title: "Einen Termin vorbereiten",
    prompt: "Schau in meinen Kalender [Name] für Donnerstag. Schlage mir ab 19 Uhr eine freie Stunde vor. Lege noch keinen Termin an.",
    note: "Nach deiner Entscheidung kannst du einen Einzeltermin mit Uhrzeit/UTC-Offset oder ganztägig anlegen lassen. Bei Ganztag endet der Zeitraum exklusiv am Folgetag. Eine lokale Erinnerung lässt sich ändern oder entfernen. Für eine Serie nenne Wiederholung, Serienende und Zeitzone ausdrücklich. Einladungen bleiben gesondert.",
  },
  {
    title: "Eine native Notiz bearbeiten",
    prompt: "Lies die Notiz [Titel] in der Notizen-App. Ergänze nach meiner Freigabe die besprochenen Punkte und lies sie anschließend zurück.",
    note: "Notizen startet als neuer Bereich ausgeschaltet und benötigt zusätzlich Notizlese-/Schreibrechte. Lesen, Suchen, Anlegen und versionsgebundenes Bearbeiten sind eingebaut; Originaldatei und eigene Bildanhänge lassen sich prüfen. Ausgewählte Bilder können als Notizkopie angelegt und anschließend gezielt im Notiztext eingebunden werden. Gezieltes Löschen benötigt zusätzlich das Papierkorbrecht und einen zuvor geprüften Umfang. Textimport und Textexport nutzen zusätzliche Dateirechte.",
  },
  {
    title: "Nachrichten nachlesen",
    prompt: "Zeige mir die neuesten E-Mails im Ordner [Name] des Kontos [Name]. Lies anschließend die Nachricht [Betreff] und fasse sie zusammen.",
    note: "Mail und Talk unterstützen im jetzigen Stand Lesen. Schreiben, Entwürfe und Versand werden schrittweise ergänzt.",
  },
];

export default function ConnectorGuide() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100 sm:px-8">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-blue-300 underline underline-offset-4">← NovaSpace Connector</Link>
        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">Kurzanleitung</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Deine KI arbeitet mit dir.</h1>
        <p className="mt-5 text-lg leading-8 text-slate-300">
          Der NovaSpace Connector verbindet deine KI mit den Arbeitsbereichen, die du
          freigegeben hast. Du kannst Inhalte finden und erklären lassen oder konkrete
          Änderungen beauftragen. Ein genauer Auftrag hilft beim gemeinsamen Arbeiten.
        </p>

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8" aria-labelledby="start">
          <h2 id="start" className="text-2xl font-semibold">In drei Schritten loslegen</h2>
          <ol className="mt-5 list-decimal space-y-4 pl-5 leading-7 text-slate-300">
            <li><strong className="text-slate-100">Vorhandene Verbindung nutzen.</strong> Wenn du bereits verbunden bist, arbeite damit weiter. Für eine neue Verbindung folgst du der Einrichtung in deinem KI-Programm und bestätigst die vorgesehenen Zugriffe selbst.</li>
            <li><strong className="text-slate-100">In NovaSpace „KI-Verbindungen“ öffnen.</strong> Prüfe das angezeigte Konto und die richtige Verbindung. Schalte die benötigten Bereiche auf „Lesen“ oder „Lesen und unterstützte Änderungen“ und speichere die Auswahl. Vorhandene Rechte an Dateien und anderen Inhalten gelten zusätzlich.</li>
            <li><strong className="text-slate-100">Einen konkreten Auftrag geben.</strong> Nenne Bereich, Datei, Karte oder Kalender und das gewünschte Ergebnis. Du kannst ausdrücklich erst einen Vorschlag verlangen und anschließend das Speichern beauftragen.</li>
          </ol>
          <p className="mt-5 text-sm leading-6 text-slate-400">Für LM Studio verwendest du die dort eingerichtete MCP-Anbindung. Eine Verbindung in einem anderen KI-Programm richtet LM Studio nicht automatisch mit ein. Der konkrete Funktionsstand kann sich zwischen Anbindungen unterscheiden.</p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-label="Aufgaben und Kontakte">
          <h2 className="text-2xl font-semibold">Aufgaben und Kontakte</h2>
          <p className="mt-4 leading-7 text-slate-300">Bei einem ausgewählten Kontakt kannst du Kategorien und den persönlichen Favoriten pflegen. Ein eingebettetes Kontaktbild lässt sich anzeigen, aus einer gewählten Bilddatei ersetzen oder gezielt entfernen. Das Bild darf bis 128 KiB groß sein und wird für die Leser des Kontakts sichtbar. Andere Kontaktfelder und die ursprüngliche Bilddatei bleiben erhalten. Externe Fotoverweise werden nicht nachgeladen.</p>
          <p className="mt-4 leading-7 text-slate-300">Einen Kontakt kannst du nach einer geprüften Vorschau in ein eigenes Adressbuch kopieren oder aus einem eigenen Adressbuch dorthin verschieben. Die Kontaktidentität bleibt erhalten; ein vorhandenes Ziel oder dieselbe Identität im Ziel stoppt die Übertragung. Beim Verschieben entfällt der ursprüngliche Kontaktpfad. Die Leser des Zieladressbuchs können den Kontakt sehen.</p>
          <p className="mt-4 leading-7 text-slate-300">Mögliche Kontakt-Dubletten kannst du in ausgewählten Adressbüchern anhand gleicher Mailadressen, Telefonnummern, Namen oder Identitäten suchen lassen. Ein Treffer ist ein Hinweis: Vergleiche die beiden Kontakte und wähle die Werte, die du übernehmen möchtest. Die Vorschau zeigt Ergänzungen und ausdrücklich gewählte Ersetzungen. Die Zielidentität und der zweite Kontakt bleiben erhalten; dessen Löschen ist ein eigener Auftrag. Bilder und besondere Kodierungen pflegst du getrennt.</p>
          <p className="mt-4 leading-7 text-slate-300">Für einen Kontaktbezug in einer Deckkarte, einem Termintext oder einer gelesenen Mail wählst du die benötigten Angaben einzeln aus. Bei mehreren Mailadressen oder Telefonnummern wird keine automatisch genommen. Quelle und Kontaktversion begleiten die Auswahl. Der nächste Schritt am gewählten Ziel braucht seine eigenen Rechte und einen bewussten Auftrag; Kontaktleser und Zielleser können verschieden sein. Ein Kalenderbezug verschickt keine Einladung, ein Mailbezug erstellt oder versendet keine Nachricht.</p>
          <p className="mt-4 leading-7 text-slate-300">Neue Bereiche zuerst bewusst freigeben: Aufgaben und Kontakte starten ausgeschaltet und benötigen eigene Lese-/Schreibrechte. Du kannst eine konkrete Aufgabenliste oder ein Adressbuch wählen, darin suchen und einzelne Objekte pflegen. Eine Aufgabe erledigen oder einen Kontakt ändern lässt andere Felder erhalten; Löschen braucht einen ausdrücklichen Auftrag.</p>
          <p className="mt-3 leading-7 text-slate-300">Du kannst eine eigene Aufgabenliste anlegen und ihren Namen, ihre Beschreibung, Farbe oder Reihenfolge ändern lassen. Neue Listen gehören dem tatsächlich verbundenen Konto. Aufgabeninhalte und Freigaben bleiben dabei erhalten. Für die Verwaltung eignen sich reine eigene Aufgabenlisten; freigegebene, abonnierte, gemischte Kalender und abgeleitete Deckansichten bleiben ausgenommen. Bei unklarem Ergebnis denselben Listenpfad prüfen lassen.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Schreibgeschützte Deckansichten und Systemadressbücher bleiben geschützt. Keine automatische Doppelpflege von Deckkarten, Kontaktzusammenführung oder externe Adressauflösung.</p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-label="Adressbücher und vCard-Austausch">
          <h2 className="text-2xl font-semibold">Adressbücher und vCard-Austausch</h2>
          <p className="mt-4 leading-7 text-slate-300">Du kannst eigene Adressbücher anlegen und deren Namen oder Beschreibung gezielt ändern lassen. Ein neues Adressbuch gehört dem tatsächlich verbundenen Konto. Einen ausgewählten Kontakt kannst du als neue vCard-Datei bis 128 KiB exportieren. Zum Import eine einzelne vCard-Datei und ein eigenes Zieladressbuch wählen und zuerst die Vorschau prüfen lassen. Die Originalidentität bleibt erhalten; vorhandene gleiche Identitäten oder Zielkennungen stoppen den Import. Quelle und Ergebnis werden geprüft. Persönliche Daten und Fotoverweise können enthalten sein; Fotos und Links werden nicht nachgeladen. Für ausgewählte Kontaktwerte gibt es einen eigenen Vergleich mit Übernahmevorschau. Sammelimporte bleiben offen. Bei unklarem Ergebnis dieselben Kennungen beibehalten.</p>
          <p className="mt-4 leading-7 text-slate-300">Ein eigenes Adressbuch kannst du mit dem Zusatzrecht für Adressbuchfreigaben für einen genau gewählten lokalen Nutzer oder eine Gruppe freigeben: nur lesen oder bearbeiten. Die Freigabe gilt für bestehende und künftige Kontakte. Eine direkte Freigabe lässt sich ändern oder aufheben; andere Zugriffswege können bestehen bleiben. Zum Entfernen eines ganzen eigenen Adressbuchs brauchst du ein getrenntes Zusatzrecht. Prüfe zuerst die Vorschau: Alle enthaltenen Kontakte und direkten Freigaben werden dauerhaft entfernt. Dafür gibt es keinen zugesagten Papierkorb- oder Wiederherstellungsweg.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Der Export braucht Kontaktlese- und Dateischreibrecht. Die Importvorschau braucht Kontaktlese-, Dateilese- und Downloadrecht, die bestätigte Anlage zusätzlich Kontaktschreibrecht. Native Eigentümer- und Objektberechtigungen gelten. Die Prüfung verbindet getrennte Speicher und ist keine atomare Gesamttransaktion.</p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-label="Notizen löschen und Text austauschen">
          <h2 className="text-2xl font-semibold">Notizen löschen und Text austauschen</h2>
          <p className="mt-4 leading-7 text-slate-300">Nenne die konkrete Notiz und lass zuerst ihren Löschumfang prüfen. Zusätzlich brauchst du das Recht „Papierkorb verwalten“. Ein vorhandener eigener Bildordner muss ausdrücklich eingeschlossen werden. Die Notiz und dieser Ordner werden getrennt in den persönlichen Papierkorb gelegt; Kategorien und alte flache Bilddateien bleiben erhalten. Bei einem Teilabschluss die vorhandenen Belege und Pfade prüfen lassen.</p>
          <p className="mt-4 leading-7 text-slate-300">Für den Textexport wählst du einen neuen .md- oder .txt-Pfad. Die Datei enthält den nativen Notiztext und überschreibt kein vorhandenes Ziel. Beim Textimport nennst du eine bestehende Notiz und bestätigst ausdrücklich, ihren Inhalt durch die ausgewählte Textdatei zu ersetzen. Titel, Kategorie, Favorit und Quelldatei bleiben erhalten.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Textaustausch bis 128 KiB UTF-8 mit passenden Datei- und Downloadrechten. Bilder und Links werden dabei nicht geladen oder kopiert; relative Bildverweise können am neuen Ort ungültig sein. Bei unklarem Ergebnis dieselben Objekte prüfen lassen. Papierkorbfristen und Quoten gelten weiterhin.</p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-label="Kalender und freie Zeitfenster">
          <h2 className="text-2xl font-semibold">Kalender und freie Zeitfenster</h2>
          <p className="mt-4 leading-7 text-slate-300">Du kannst eigene Terminkalender anlegen und Name, Beschreibung, Farbe oder Reihenfolge gezielt pflegen lassen. Ein neuer Kalender gehört dem tatsächlich verbundenen Konto. Ereignisse und Freigaben werden dabei nicht geändert.</p>
          <p className="mt-4 leading-7 text-slate-300">Für freie Zeitfenster nenne die ausgewählten eigenen Kalender, deine möglichen Arbeitszeiten, die gewünschte Dauer und einen Puffer. Zusätzliche Abwesenheiten kannst du einbeziehen. Zeitzone und Uhrzeit müssen zum konkreten Datum passen, etwa Europe/Berlin mit dem richtigen Sommer- oder Winterzeitoffset. Ein Vorschlag legt noch keinen Termin an.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Die Planung braucht vollständige Belegungsdaten. Der native Server blendet private Termine in freigegebenen Kalendern aus; solche Quellen werden für diese Planung abgewiesen. Auch dichte oder unbekannte Serien können die Prüfung stoppen. Vor dem Buchen erneut prüfen.</p>
          <p className="mt-4 leading-7 text-slate-300">Einfache Serien in eigenen Kalendern kannst du täglich, wöchentlich, monatlich oder jährlich mit ausdrücklichem Ende anlegen lassen. Bei einer Wochenserie kannst du Wochentage wählen. Höchstens 500 Vorkommen in fünf Jahren; monatliche oder jährliche Termine an ungültigen Daten werden nach Kalenderregel übersprungen. Ganztägige Serien behalten ihr exklusives Enddatum. Bei lokaler Uhrzeit muss die vollständige passende Kalenderzeitzone vorhanden sein; UTC bleibt eine feste UTC-Uhrzeit.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Vor einer Änderung die Originalserie lesen lassen und die Wirkung auf die gesamte Serie bestätigen. Titel, Beschreibung und Ort lassen sich gezielt pflegen, eine einfache Wiederholungsregel nur ohne vorhandene Ausschlüsse ändern. Ein bestätigtes Originalvorkommen lässt sich ausschließen. Ganze Serien mit vorhandenen Einzelabweichungen, komplexe Regeln und Einladungsserien bleiben in der nativen Kalender-App. Bei unklarem Ergebnis dieselbe Serienkennung prüfen lassen.</p>
          <p className="mt-4 leading-7 text-slate-300">Ein einzelnes Vorkommen einer einfachen begrenzten Serie kannst du zuerst prüfen und danach gezielt ändern oder verschieben lassen. Nenne immer den ursprünglichen Serienbeginn dieses Vorkommens, auch nach einer Verschiebung. Titel, Beschreibung, Ort oder beide neuen Zeitpunkte sind möglich; ganztägig bleibt ganztägig, die Serienzeitzone bleibt erhalten. Eine gespeicherte Einzelabweichung lässt sich ausdrücklich zur Serienbasis zurücksetzen. Master und andere Ausnahmen bleiben erhalten.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Nur eigene reguläre Kalender ohne Einladungen oder Anhänge, höchstens 500 Vorkommen in fünf Jahren und 50 Einzelabweichungen. Mehrdeutige Uhrzeiten oder Zeitlücken am Zeitzonenwechsel stoppen die Änderung. Ausgeschlossene Vorkommen werden nicht still wiederhergestellt. Dies prüft keine freie Zeit und verändert weder die ganze Serie noch „diesen und alle folgenden Termine“. Vor jeder Änderung frisch lesen; bei unklarem Ergebnis dieselbe Originalkennung prüfen lassen.</p>
          <p className="mt-4 leading-7 text-slate-300">Für die gesamte Serie kannst du eine Vorschau einschließlich Einzelabweichungen und Ausschlüssen anfordern. Gewählte Textfelder gelten dann für die ganze Serie. Bei neuen Zeiten oder Regeln entscheidest du ausdrücklich, ob abweichende Termine ihre absoluten Zeitpunkte behalten oder ihre zeitliche Abweichung zum jeweiligen regulären Termin mitnehmen. Die Vorschau zeigt jede betroffene Ausnahme; sie wird anhand ihrer ursprünglichen Position zugeordnet. Ausschlüsse lassen sich gezielt zurücknehmen, Einzelabweichungen nur ausdrücklich ausgewählt entfernen. Die begrenzte Prüfung umfasst bis zu 500 Vorkommen in fünf Jahren und 50 Einzelabweichungen. Änderung ab einem Termin und ein automatisches Aufteilen der Serie sind damit nicht zugesagt.</p>
          <p className="mt-4 leading-7 text-slate-300">Eine bereits gespeicherte Einladung kannst du mit Organisator und eigenem Teilnehmerstatus prüfen lassen. Für einen einzelnen Termin oder ausdrücklich die ganze gespeicherte Masterserie ohne abweichende Einzeltermine ist eine Zusage, vorläufige Zusage oder Absage möglich. Nenne den gewünschten Umfang bereits beim Lesen und bestätige ihn für die Antwort. Dafür brauchst du zusätzlich das bewusst erteilte Recht „Kalenderantworten übermitteln“ und den passenden Themenzusatz. Es gilt die native Kalenderadresse des verbundenen Kontos.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Eine Antwort kann eine native Mitteilung oder E-Mail an den vorhandenen Organisator auslösen. Geprüft wird der gespeicherte eigene Status; die tatsächliche Zustellung wird dadurch nicht bestätigt. Andere Teilnehmer, Zeiten, Wiederholung, Ausschlüsse und Organisator bleiben erhalten. Antworten auf abweichende Einzeltermine und Stellvertretung sind noch offen. Bei unklarem Ergebnis zuerst dasselbe Original lesen lassen und nicht automatisch erneut senden.</p>
          <h3 className="mt-6 text-xl font-semibold">Eigene Einladungen und Besprechungen</h3>
          <p className="mt-3 leading-7 text-slate-300">Einen ganzen eigenen Kalender zuerst mit allen Originalen, vorhandenen Freigaben und der nativen Aufbewahrung prüfen lassen. Entfernen und Wiederherstellen brauchen das getrennte Zusatzrecht zur Kalenderverwaltung. Bei aktivem Papierkorb bleibt dieselbe Kalenderkennung erhalten; bei ausgeschaltetem Papierkorb ist die Entfernung dauerhaft, auch für vorher einzeln gelöschte Originale. Kalenderentfernen sagt einzelne Besprechungen bei anderen Teilnehmern nicht ab. Eine Wiederherstellung kann bisherige Zugriffe wieder wirksam machen. Direkte lokale Nutzer- und Gruppenfreigaben brauchen ein eigenes zusätzliches Freigaberecht.</p>
          <p className="mt-3 leading-7 text-slate-300">Gespeicherte Links zu Dateien, Deck, Kontakten, Mail und Talk kannst du prüfen lassen, ohne sie automatisch aufzurufen. Eine ausgewählte vorhandene Datei lässt sich nach Vorschau als Verweis an einen eigenen Einzeltermin ohne Besprechung oder Serie hängen. Kalenderleser sehen den Verweis und benötigen weiterhin eigene Dateirechte. Die Datei wird dabei weder kopiert noch freigegeben oder gelöscht. Native Uploadanhänge bleiben in ihrer bisherigen Verwaltung. Ein einzelnes eigenes gelöschtes Kalenderoriginal kann nach Vorschau über seinen nativen Rückweg wiederhergestellt werden; UID, ursprünglicher Inhalt und bestehende Zugriffe bleiben maßgeblich.</p>
          <p className="mt-3 leading-7 text-slate-300">Für eine neue Besprechung wählst du den eigenen Kalender, die tatsächliche eigene Organisatoradresse, Zeiten und konkrete Teilnehmer. Lass zunächst eine Vorschau erstellen. Sie zeigt den Termininhalt, die Empfänger und die Wirkung des Auftrags. Neue Einladungen, Änderungen und Absagen brauchen das getrennte zusätzliche Recht zum Organisieren von Kalendereinladungen sowie Kalender-Lese- und Schreibrecht. Im persönlichen Anschluss gehört dazu der zunächst ausgeschaltete Zusatz „Einladungen organisieren“.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Eine Ausführung kann native Einladungen, Änderungen oder Absagen auslösen. Die gewählten Teilnehmer bekommen Zugriff auf den vollständigen Termininhalt. Eine Absage entfernt das gespeicherte Besprechungsoriginal. Neue oder entfernte Teilnehmer vorher in der Vorschau prüfen; eine tatsächliche Zeitverschiebung setzt die Antworten der anderen Teilnehmer zurück. Dieser Weg gilt zunächst für Einzeltermine. Gespeichertes Ergebnis und tatsächliche Zustellung bleiben getrennt. Bei unklarem Ergebnis dieselbe Ereigniskennung lesen lassen; nicht automatisch erneut senden oder eine andere Kennung versuchen.</p>
          <p className="mt-4 leading-7 text-slate-300">Für eine gemeinsame Agenda wählst du bis zu vier Kalender und einen Zeitraum bis zu einem Jahr. Titel, Beschreibung und Ort lassen sich durchsuchen. Gib die Zeitzone für die Anzeige an; ganztägige Termine behalten ihr Datum. Änderungen am Kalender während der Abfrage stoppen die Suche.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Einzeltermine lassen sich nach Vorschau unabhängig kopieren. Die Kopie erhält eine neue Identität, die Quelle bleibt bestehen. Besprechungen, Serien, Anhänge und Terminrelationen sind dafür ausgeschlossen. Bei der normalen Terminpflege kannst du Webadresse, Status, Sichtbarkeitskennzeichnung, Belegungsstatus und Kategorien ändern sowie mehrere lokale Erinnerungen einzeln ergänzen, ändern oder entfernen. Eine Sichtbarkeitskennzeichnung ersetzt keine Kalenderfreigabe. Gespeicherte Erinnerungen bestätigen keine tatsächliche Benachrichtigung; dafür müssen Kalenderdienste und Hintergrundaufgaben funktionieren.</p>
          <p className="mt-4 leading-7 text-slate-300">Ein ausgewähltes Kalenderoriginal kannst du als neue ICS-Datei bis 128 KiB sichern lassen. Vorhandene Dateien werden nicht überschrieben. Persönliche Daten und vorhandene Verweise bleiben dabei im Text; Anhänge und Links werden nicht nachgeladen oder versendet.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Zum Import eine einzelne ICS-Datei und einen eigenen Zielkalender wählen und zuerst die Vorschau prüfen lassen. Unterstützt sind Einzeltermine mit ausdrücklichem Ende und die beschriebenen einfachen begrenzten Serien. Eine einfache lokale Erinnerung aus der bestätigten Vorschau kann aktiv werden. Die Originalidentität bleibt erhalten; vorhandene gleiche Termine und gleiche Identitäten im sichtbaren Kalenderpapierkorb stoppen den Import. Kann der Papierkorb nicht vollständig innerhalb von 100 Einträgen und 2 MiB geprüft werden, stoppt der Import ebenfalls. Diese Vorprüfung ist eine Momentaufnahme. Einladungen, Anhänge, Sammeldateien und abweichende Einzelvorkommen werden nicht importiert. Quelldatei und Ergebnis werden rückgeprüft; bei unklarem Ergebnis dieselben Kennungen beibehalten.</p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-label="Deck organisieren und kommentieren">
          <h2 className="text-2xl font-semibold">Deck organisieren und kommentieren</h2>
          <p className="mt-4 leading-7 text-slate-300">Mit dem gesonderten Recht für den Deck-Papierkorb kannst du eine ausgewählte Karte oder eine ganze Liste zuerst zum Löschen prüfen lassen und anschließend gezielt löschen oder wiederherstellen. Das unterscheidet sich von Archivieren und Erledigen. Eine gelöschte Liste blendet ihre Karten mit aus; bereits einzeln gelöschte Karten brauchen ihren eigenen Rückweg. Die Wiederherstellung erhält den vorherigen Erledigt- und Archivstatus. Verknüpfte Mindmaps bleiben der letzte dokumentierte Stand und werden dabei nicht automatisch umgeschrieben. Endgültig entfernte Objekte lassen sich hier nicht zurückholen.</p>
          <p className="mt-4 leading-7 text-slate-300">Deckkarten kannst du nach Text, Status, Tag, bestätigter Zuständigkeit und Termin auswählen: mit Termin, ohne Termin oder in einem bestimmten Zeitraum. Nenne für überfällige Karten auch den Stichtag. Archivierte Karten lassen sich ausdrücklich einbeziehen; Zuständigkeiten im Archiv müssen einzeln geprüft werden. Einen Checklistenpunkt bearbeiten wir aus der frisch gelesenen Beschreibung, erhalten die übrigen Inhalte und prüfen die Karte samt verknüpfter Mindmap zurück.</p>
          <p className="mt-4 leading-7 text-slate-300">Bei einer ausdrücklich mit der Mindmap verbundenen Aufgabe kannst du den gemeinsamen Namen und die Aufgabenbeschreibung gezielt ändern lassen. Die KI liest zuerst Karte und Mindmap und bindet die Beschreibungseingabe an beide gelesenen Versionen. Ziele, übrige Karteninhalte und eigene Mindmap-Planungsnotizen bleiben erhalten. Unterschiedliche Änderungen am gleichen gemeinsamen Feld müssen zuerst geklärt werden. Ist die Karte schon gespeichert und nur der Mindmap-Abgleich offen, lässt sich das vorhandene Paar gezielt erneut abgleichen; die ursprüngliche Bearbeitung wird dabei nicht wiederholt.</p>
          <p className="mt-4 leading-7 text-slate-300">Mit der Projekt-App ab Version 0.2.12 kannst du auch über den Connector ein Projekt mit Board und verknüpfter Mindmap anlegen lassen. Nenne den Projektnamen und die Beschreibung. Die persönliche Standardablage wird automatisch verwendet; einen vorhandenen anderen Ordner kannst du ausdrücklich auswählen. Das Projekt gehört dem tatsächlich verbundenen Konto. Vor der Anlage wird eine feste Vorgangskennung festgelegt. Bei einer Unterbrechung prüfen wir denselben Vorgang und setzen ihn bei Bedarf ausdrücklich fort. Im persönlichen Anschluss wählst du dafür Mindmap und Deck gemeinsam aus.</p>
          <p className="mt-4 leading-7 text-slate-300">Mit den passenden Deckrechten kannst du ein Board anlegen, benennen, färben oder archivieren sowie Listen anlegen, benennen und einsortieren lassen. Archivieren betrifft das ganze Board und löscht es nicht. Die native Verwaltungsberechtigung gilt zusätzlich zu deiner KI-Freigabe.</p>
          <p className="mt-4 leading-7 text-slate-300">Boardfreigaben kannst du zuerst lesen lassen. Zum Anlegen oder Ändern nenne die genaue lokale Nutzer- oder Gruppenkennung und die gewünschten Rechte ausdrücklich. Das zusätzliche Recht „Boardfreigaben verwalten“ wird bestehenden Verbindungen nicht automatisch erteilt. Lesen ist bei einer direkten Freigabe enthalten; Bearbeiten, Weiterteilen und Verwalten sind zusätzliche Rechte. Native Benachrichtigungen sind möglich.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Wichtig beim Aufheben einer persönlichen Boardfreigabe: Deck entfernt auch die Kartenzuständigkeiten dieser Person im gesamten Board. Diese Wirkung muss zum Auftrag gehören. Andere Gruppen- oder Direktfreigaben können weiter Zugriff geben. Eigentümer und die direkte eigene Zugangsfreigabe bleiben geschützt. Föderierte, Team- und öffentliche Linkfreigaben sind von dieser Verwaltung ausgenommen. Bei unklarem Ergebnis dieselbe Board- und Freigabekennung prüfen lassen.</p>
          <p className="mt-4 leading-7 text-slate-300">Kommentare kannst du zuerst lesen lassen. Zum Verfassen nenne die konkrete Karte und den gewünschten Text ausdrücklich. Eine Antwort kann sich auf einen vorhandenen Kommentar derselben Karte beziehen. Erwähnungen können andere Personen benachrichtigen. Bearbeiten lässt sich nur ein Kommentar des tatsächlich verbundenen Kontos.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Beispiel: „Lies die Kommentare auf Karte [Nummer]. Bereite eine Antwort vor und warte mit dem Veröffentlichen.“ Bei einer unklaren Übermittlung zuerst die Karte erneut lesen lassen, damit kein Beitrag doppelt gesendet wird.</p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6" aria-label="Dateien an Karten und Notizen">
          <h2 className="text-2xl font-semibold">Dateien an Karten und Notizen</h2>
          <p className="mt-4 leading-7 text-slate-300">Eine vorhandene Datei kannst du ausdrücklich an eine Deck-Karte verknüpfen lassen. Dafür brauchst du zusätzlich das Recht „Dateifreigaben verwalten“. Die Datei wird für aktuelle und spätere Kartenleser lesbar; native Benachrichtigungen sind möglich. Das Abtrennen einer modernen Dateizuordnung erhält die Originaldatei.</p>
          <p className="mt-4 leading-7 text-slate-300">Bei Notizen kannst du die Originaldatei und den eigenen Bildordner prüfen lassen. Ein ausgewähltes PNG-, JPEG-, GIF- oder WebP-Bild bis 10 MiB lässt sich mit Datei- und Downloadrecht als Notizkopie anlegen. Danach den Bildverweis gezielt in den frisch gelesenen Notiztext übernehmen lassen. Die Originaldatei bleibt bestehen.</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">Nenne die konkrete Karte oder Notiz und die gewünschte Quelldatei. Bei einer unklaren Antwort zuerst die Anhänge lesen lassen, damit keine zweite Freigabe oder Bildkopie entsteht.</p>
        </section>

        <section className="mt-12" aria-labelledby="examples">
          <h2 id="examples" className="text-2xl font-semibold">Fünf Beispiele für den Anfang</h2>
          <p className="mt-3 leading-7 text-slate-300">Ersetze die Angaben in eckigen Klammern durch deine Auswahl. Die Beispiele setzen passende Freigaben und die jeweilige verfügbare Funktion voraus.</p>
          <div className="mt-6 space-y-5">
            {examples.map((example) => (
              <section key={example.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-lg font-semibold">{example.title}</h3>
                <blockquote className="mt-4 border-l-2 border-blue-400 pl-4 leading-7 text-slate-100">„{example.prompt}“</blockquote>
                <p className="mt-4 text-sm leading-6 text-slate-400">{example.note}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8" aria-labelledby="files">
          <h2 id="files" className="text-2xl font-semibold">Dateien finden und kopieren</h2>
          <p className="mt-4 leading-7 text-slate-300">Die Namenssuche findet Dateien und Ordner auch in Unterordnern. Nenne den Suchbereich und einen Teil des Namens: „Suche im Ordner [Pfad] mit Unterordnern nach Dateien mit [Suchwort] im Namen.“ Die Suche liest keine Dateiinhalte. Bei vielen Treffern grenze den Ordner oder Suchtext weiter ein.</p>
          <p className="mt-4 leading-7 text-slate-300">Zum Kopieren kannst du sagen: „Kopiere [Quellpfad] nach [neuer Zielpfad]. Prüfe vorher die Quelle und anschließend beide Pfade.“ Die Quelle bleibt bestehen; ein vorhandenes Ziel wird nicht überschrieben. Der Zielordner muss bereits existieren. Das gilt auch für Ordnerkopien mit Unterordnern.</p>
          <p className="mt-4 text-sm leading-6 text-slate-400">Suche benötigt Dateileserechte, Kopieren zusätzlich die unterstützten Dateiänderungen. Die Rückprüfung bestätigt Quelle und Zielmetadaten; sie vergleicht nicht unabhängig sämtliche Dateiinhalte oder einen ganzen kopierten Ordnerbaum. Freigaben der Kopie bitte gesondert prüfen. Bei einer unklaren Antwort zuerst Quelle und Ziel nachlesen.</p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 id="trash" className="text-2xl font-semibold">Papierkorb und Wiederherstellen</h2>
          <p className="mt-4 leading-7 text-slate-300">Du kannst den eigenen Papierkorb lesen und einzelne bekannte Objekte prüfen. Mit dem zusätzlichen Recht „Papierkorb verwalten“ kannst du ausdrücklich gewählte eigene Dateien im persönlichen Heimspeicher löschen und wiederherstellen. Für Ordner muss der gesamte Inhalt ausdrücklich einbezogen werden. Empfangene Freigaben, externe Speicher und Mountwurzeln werden nicht gelöscht.</p>
          <p className="mt-4 leading-7 text-slate-300">Beispiel: „Lies den Papierkorb und zeige mir die letzten zehn Einträge. Ändere nichts.“ Für eine Wiederherstellung: „Prüfe Papierkorbobjekt [Kennung] frisch und stelle es an seinen ursprünglichen freien Pfad wieder her.“</p>
          <p className="mt-4 text-sm leading-6 text-slate-400">Löschungen benötigen frische Datei-ID, Version und geprüftes Konto. Die Rückprüfung verlangt einen fehlenden Quellpfad und einen neuen passenden Papierkorbeintrag. Wiederherstellungen prüfen Originalordner, Ziel und verschwundenen Papierkorbeintrag. Native Fristen/Quoten gelten; Aufbewahrung, gleiche Datei-ID, Freigaben und vollständige Ordnerinhalte werden nicht garantiert. Bei parallelen Zielkonflikten kann die Cloud einen Ersatznamen wählen; dann den tatsächlichen Stand lesen und nicht automatisch wiederholen. Endgültiges Löschen und Papierkorb leeren werden nicht angeboten. In LM Studio zusätzlich „Papierkorb verwalten“ wählen; bestehende Rechte werden nicht automatisch erweitert.</p>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8" aria-labelledby="sharing">
          <h2 id="sharing" className="text-2xl font-semibold">Dateifreigaben verwalten</h2>
          <p className="mt-4 leading-7 text-slate-300">Du kannst die eigenen Freigaben einer ausdrücklich gewählten Datei oder eines Ordners anzeigen lassen. Für eine neue Freigabe nennst du die genaue Nutzer- oder Gruppenkennung und die gewünschten Rechte. Geschützte Links benötigen ein eigenes Freigabepasswort und ein zukünftiges Ablaufdatum. Die KI soll Empfänger und zusätzliche Zugriffe nicht selbst bestimmen.</p>
          <p className="mt-4 leading-7 text-slate-300">Beispiel: „Zeige mir meine Freigaben für [Pfad]. Ändere nichts.“ Oder: „Gib [Pfad] für das bestätigte Konto [Kennung] nur zum Lesen frei und prüfe das Ergebnis.“ Zum Ändern und Aufheben wird die konkrete Freigabe zuerst frisch gelesen; das Aufheben einer Freigabe löscht keine Datei.</p>
          <p className="mt-4 text-sm leading-6 text-slate-400">Lesen nutzt die vorhandenen Dateileserechte. Änderungen brauchen zusätzlich das bewusst erteilte Recht „Dateifreigaben verwalten“ und online eine passende Dateien-Auswahl in KI-Verbindungen. Bestehende Verbindungen erhalten dieses neue Recht nicht automatisch. In LM Studio wählst du zusätzlich „Dateifreigaben ändern“. E-Mail-, Föderations- und Talkfreigaben gehören noch nicht zu diesem Baustein. Es wird keine E-Mail angefordert; native App-Hinweise können entstehen. Eine Vorprüfung schützt nicht atomar vor parallelen Freigabeänderungen.</p>
        </section>

        <section className="mt-12" aria-labelledby="access">
          <h2 id="access" className="text-2xl font-semibold">Du behältst die Auswahl</h2>
          <ul className="mt-5 list-disc space-y-3 pl-5 leading-7 text-slate-300">
            <li><strong className="text-slate-100">Lesen</strong> erlaubt die unterstützten Abrufe. <strong className="text-slate-100">Lesen und unterstützte Änderungen</strong> erlaubt zusätzlich die bereits eingebauten Änderungen. Die Auswahl ist keine Zusage, dass jede Funktion der jeweiligen App schon angebunden ist.</li>
            <li>Mit dem <strong className="text-slate-100">Hauptschalter</strong> unterbrichst du die App-Zugriffe einer Verbindung. Einzelne Bereiche kannst du separat ausschalten. Speichere deine Auswahl; sie gilt für folgende Aufrufe. Bereits laufende Aufrufe können noch abschließen.</li>
            <li>Mit <strong className="text-slate-100">„Verbindung widerrufen“</strong> sperrst du die Verbindung. Für eine erneute Freigabe ist eine neue Bestätigung nötig.</li>
          </ul>
        </section>

        <section className="mt-12 border-t border-slate-800 pt-8" aria-labelledby="help">
          <h2 id="help" className="text-2xl font-semibold">Wenn etwas nicht klappt</h2>
          <p className="mt-4 leading-7 text-slate-300">Lass dir den konkreten Fehler nennen und prüfe zuerst die gewählte Verbindung, den betroffenen Bereich und die Freigabe des Inhalts. Wenn unklar ist, ob eine Änderung gespeichert wurde, soll die KI den vorhandenen Stand nachlesen. So entstehen keine doppelten Dateien oder Karten.</p>
          <p className="mt-4 leading-7 text-slate-300">Dieser Einstieg wächst mit den tatsächlich verfügbaren Funktionen. Neue Freigaben entscheidest weiterhin du.</p>
          <p className="mt-8 text-sm text-slate-500">Stand: 22. Oktober 2026 · NovaSpace Connector 1.25.2</p>
        </section>
      </article>
    </main>
  );
}
