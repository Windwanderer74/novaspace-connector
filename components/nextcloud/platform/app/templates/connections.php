<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
style('novaspace_platform', 'connections');
style('novaspace_platform', 'connections-scroll');
script('novaspace_platform', 'connections');
script('novaspace_platform', 'connections-autosave');
?>
<main class="ns-platform" tabindex="0" aria-label="KI-Verbindungen">
  <h1>NovaSpace KI Connector</h1>
  <p>Mit deinen <strong>KI-Verbindungen</strong> arbeitet deine KI in den von dir freigegebenen Bereichen.</p>
  <details><summary>Wie verwalte ich meinen KI-Zugang?</summary><p>Jede Verbindung gehört zu deinem angezeigten Konto. Der Hauptschalter unterbricht oder erlaubt alle App-Zugriffe dieser Verbindung. Darunter begrenzt du einzelne Bereiche. Änderungen werden nach kurzer Pause automatisch gespeichert. „Gespeichert“ bestätigt die Übernahme; danach gilt sie für folgende Aufrufe. Die KI kann den aktuellen Freigabestatus abfragen und nennt bei einer Sperre den betroffenen Bereich. Der vollständige Widerruf bleibt separat möglich.</p></details>
  <details>
    <summary>Mit der KI arbeiten: Beispiele und Kurzanleitung</summary>
    <p>Nenne den Bereich und das gewünschte Ergebnis möglichst konkret. Zum Einstieg kannst du zum Beispiel sagen:</p>
    <ul>
      <li>„Zeige mir die offenen Deckkarten im Board [Name]. Ändere dabei nichts.“</li>
      <li>„Lies die Datei [Pfad oder Name] und fasse die wichtigsten Punkte zusammen.“</li>
      <li>„Schau in meinen Kalender [Name] und schlage mir Donnerstag ab 19 Uhr eine freie Stunde vor. Lege noch keinen Termin an.“</li>
    </ul>
    <p>Ersetze die Angaben in eckigen Klammern durch deine Auswahl. Passende App- und Inhaltsfreigaben sind erforderlich. Die Auswahl „Lesen und unterstützte Änderungen“ erlaubt nur bereits eingebaute Änderungen.</p>
    <p>Aufgaben und Kontakte beginnen als neue Bereiche ausgeschaltet und benötigen zusätzliche Lese-/Schreibrechte. Eigenständige Aufgaben lassen sich pflegen und erledigen; Kontakte mit mehreren Mailadressen, Telefonnummern und Anschriften bearbeiten. Kategorien und persönlichen Favoriten gezielt pflegen. Ein eingebettetes Kontaktbild anzeigen, aus einer gewählten Bilddatei bis 128 KiB ersetzen oder gezielt entfernen; das Bild wird für Kontaktleser sichtbar. Andere Felder und Originaldatei erhalten. Einen gewählten Kontakt nach Vorschau in ein eigenes anderes Adressbuch kopieren oder aus einer eigenen Quelle verschieben; Identität erhalten, bestehendes Ziel und gleiche Zielidentität abweisen. Beim Verschieben entfällt der Quellpfad; Zielleser können die Kontaktdaten sehen. Dubletten anhand gewählter gleicher Merkmale finden, zwei Kontakte vergleichen und nur ausgewählte Werte nach Vorschau übernehmen. Gewählte Zielwerte ausdrücklich ersetzen, Gruppen und Zielidentität erhalten; der Quellkontakt bleibt bestehen. Keine automatische Zusammenführung ähnlicher Namen. Bilder und besondere Kodierungen getrennt pflegen. Eigene Adressbuchfreigaben mit getrenntem contacts:share für lokale Nutzer/Gruppen nur lesen oder bearbeiten; Zugriff auf bestehende/künftige Kontakte bestätigen. Ganzes eigenes Adressbuch nur mit getrenntem contacts:manage nach Vorschau aller Kontaktkennungen/Freigaben dauerhaft entfernen; kein zugesagter Wiederherstellungsweg. Für Deck-/Kalender-/Mailbezüge Namen und einzelne Mail-/Telefon-/Adresswerte ausdrücklich wählen; Quelle und Version mitführen. Keine erste Adresse automatisch übernehmen, Benutzer-ID ableiten oder Einladung/Mail versenden. Löschen nur für das konkret gewählte Objekt. Abgeleitete Deck-/Systembestände bleiben durch native Rechte beschränkt; keine automatische Deckkopie oder externe Adressauflösung.</p>
    <p>Eigene reine Aufgabenlisten können angelegt, benannt, beschrieben, gefärbt und numerisch einsortiert werden. Das verbundene Konto bestimmt den Eigentümer; zusätzliche Aufgabenrechte und native Verwaltungsrechte sind erforderlich. Aufgabeninhalte und Freigaben bleiben erhalten. Freigegebene, gemischte, abonnierte und abgeleitete Listen sind von dieser Verwaltung ausgenommen; bei unklarem Ergebnis denselben Listenpfad prüfen, nicht erneut anlegen.</p>
    <p>Du kannst eigene Adressbücher anlegen und deren Namen oder Beschreibung gezielt ändern lassen. Ein neues Adressbuch gehört dem tatsächlich verbundenen Konto. Einen ausgewählten Kontakt kannst du als neue vCard-Datei bis 128 KiB exportieren. Zum Import eine einzelne vCard-Datei und ein eigenes Zieladressbuch wählen und zuerst die Vorschau prüfen lassen. Die Originalidentität bleibt erhalten; vorhandene gleiche Identitäten oder Zielkennungen stoppen den Import. Quelle und Ergebnis werden geprüft. Persönliche Daten und Fotoverweise können enthalten sein; Fotos und Links werden nicht nachgeladen. Freigaben, Sammelimporte und Kontaktzusammenführung sind noch offen. Bei unklarem Ergebnis dieselben Kennungen beibehalten.</p>
    <p>Einzeltermine können auch ganztägig sein. Das Enddatum ist der erste nicht mehr belegte Tag. Lokale DISPLAY-Erinnerungen lassen sich einzeln hinzufügen, ändern oder entfernen; mehrere vorhandene Alarme gezielt über ihre ursprünglichen Indizes auswählen, insgesamt höchstens zehn. Gespeicherte Alarme bestätigen keine tatsächliche Benachrichtigung; Eigene Terminkalender kannst du anlegen und benennen sowie Beschreibung, Farbe und Reihenfolge ändern lassen. Neue Kalender gehören dem tatsächlich verbundenen Konto. Belegung und freie Zeitfenster lassen sich mit Arbeitsfenstern, Dauer, Puffer und zusätzlichen Abwesenheiten prüfen. Die benannte Zeitzone und der Offset des konkreten Datums müssen passen. Freigegebene Kalender können private Termine verbergen; sie werden deshalb nicht als vollständig frei bewertet. Dichte oder unbekannte Serien stoppen die Planung. Ein Vorschlag reserviert noch keinen Termin. Einfache tägliche, wöchentliche, monatliche oder jährliche Serien kannst du mit ausdrücklichem Ende anlegen lassen, höchstens 500 Vorkommen in fünf Jahren. Bei lokaler Uhrzeit muss die passende vollständige Kalenderzeitzone vorhanden sein. Vor einer Änderung die Originalserie lesen lassen und die Wirkung auf die gesamte Masterserie bestätigen. Die einfache Masterbearbeitung unterstützt Titel, Beschreibung und Ort sowie Regeländerungen ohne Ausschlüsse. Für Zeitpflege und vorhandene Ausnahmen die gesonderte Gesamtserienvorschau verwenden. Komplexe Regeln und Einladungen haben eigene Grenzen. Ein ausgewähltes Kalenderoriginal lässt sich als neue ICS-Datei sichern. Vorhandene Dateiziele werden nicht überschrieben. Zum Import eine einzelne ICS-Datei und einen eigenen Zielkalender wählen und zuerst die Vorschau einschließlich einer möglichen Erinnerung prüfen lassen. Die Originalidentität bleibt erhalten; ein vorhandener gleicher Termin oder eine gleiche Identität im sichtbaren Kalenderpapierkorb stoppt den Import. Auch eine unvollständige Papierkorbprüfung stoppt. Einladungen, Anhänge und Sammeldateien werden nicht importiert. Quelldatei und bestätigtes Ergebnis anschließend prüfen lassen. Bei unklarem Ergebnis dieselben Kennungen beibehalten.</p>
    <p>Notizen ist als neuer Bereich zunächst ausgeschaltet. Für native Notizen brauchst du zusätzlich bewusst erteilte Notizlese-/Schreibrechte. Danach kannst du Notizen suchen, lesen, anlegen und bearbeiten lassen. Notizdateien und eigene Bildanhänge kannst du prüfen lassen. Ausgewählte PNG-, JPEG-, GIF- und WebP-Bilder bis 10 MiB lassen sich mit zusätzlichem Datei- und Downloadrecht als Notizkopie anlegen. Zum sichtbaren Einbinden muss der gelieferte Bildverweis anschließend gezielt in den frisch gelesenen Notiztext übernommen werden. Zum Löschen zuerst den konkreten Umfang prüfen lassen. Mit dem zusätzlichen Recht „Papierkorb verwalten“ kann die gewählte eigene Notiz und ausdrücklich ihr eigener Bildordner in den Papierkorb gelegt werden. Kategorien und alte flache Bilddateien bleiben erhalten. Bei einem Teilabschluss die vorhandenen Papierkorbbelege prüfen lassen. Notiztext bis 128 KiB lässt sich als neue .md- oder .txt-Datei exportieren oder aus einer ausgewählten Textdatei ausdrücklich in eine vorhandene Notiz übernehmen. Vorhandene Exportdateien werden nicht überschrieben, Bilder und Links werden beim Textaustausch nicht geladen oder kopiert.</p>
    <p>Deckkarten nach Text, Status, Tag, bestätigter Zuständigkeit und mit/ohne Termin oder Zeitraum auswählen; für überfällig einen festen Stichtag nennen. Archiv ausdrücklich einbeziehen; Zuständigkeiten im Archiv einzeln prüfen. Checklistenpunkt gezielt in frisch gelesener Beschreibung ändern, übrige Inhalte/Kennungen sowie Kartenstartdatum/Farbe erhalten und den bestehenden Karten-/Mindmapweg rückprüfen.</p>
    <p>Deck-Papierkorb getrennt von Archiv/Erledigt nutzen: konkrete Karte/Liste zuerst prüfen und nur mit bewusstem deck:trash löschen/wiederherstellen. Eine Liste blendet alle Kinder aus; einzeln gelöschte Karten bleiben separat gelöscht. Archiv-/Erledigtstatus erhalten. Verknüpfte Mindmaps bleiben historischer Stand, ausdrücklich bestätigen. Vor gelöschter Listen-Wiederherstellung sind archivierte Kinder nicht vollständig sichtbar. Endgültig Bereinigtes hat keinen zugesagten Rückweg.</p>
    <p>Deck unterstützt Labels und Zuständigkeiten sowie Boards und Listen. Benenne das konkrete Ziel und die gewünschte Änderung. Boards und Listen benötigen native Verwaltungsrechte; Archivieren eines Boards betrifft alle zugehörigen Karten, löscht das Board aber nicht.</p>
    <p>Einzelne Vorkommen einfacher begrenzter Serien lassen sich zuerst prüfen, dann mit Titel/Beschreibung/Ort oder beiden neuen Zeitpunkten gezielt ändern. Die ursprüngliche Serienbeginnkennung bleibt auch nach Verschiebung gleich. Eine Einzelabweichung lässt sich ausdrücklich zur Serienbasis zurücksetzen; Master und andere Ausnahmen bleiben erhalten. Nur eigene Kalender ohne Einladungen/Anhänge, bis 500 Vorkommen in fünf Jahren und 50 Einzelabweichungen. Ganztag und Serienzone erhalten; Zeitlücken/mehrdeutige Uhrzeiten stoppen. Dieses Einzelwerkzeug nimmt keine EXDATE-Ausschlüsse zurück und ändert nicht alle folgenden Termine; Ausschlüsse über die Gesamtserienvorschau bearbeiten. Bei unklarem Ergebnis dieselbe Originalkennung lesen.</p>
    <p>Für eine gemeinsame Agenda bis vier ausdrücklich gewählte Kalender und einen Zeitraum bis 366 Tage nennen. Titel, Beschreibung und Ort durchsuchen; die Anzeigezeitzone ausdrücklich angeben, Ganztag behält sein Datum. Änderungen während der Abfrage oder überschrittene Antwortgrenzen stoppen die Suche. Eine unabhängige Einzelterminkopie zuerst prüfen lassen: neue Identität, Quelle erhalten, keine Serie/Besprechung/Anhänge oder Terminrelationen. Webadresse, Status, Sichtbarkeitskennzeichnung, Belegungsstatus und Kategorien lassen sich gezielt pflegen; die Kennzeichnung ersetzt keine Kalenderfreigabe.</p>
    <p>Die Gesamtserienvorschau zeigt Zeiten, Regel und alle betroffenen Einzelabweichungen/Ausschlüsse. Gewählte Textfelder gelten auch für erhaltene Abweichungen. Bei neuen Zeiten oder Regeln ausdrücklich entscheiden, ob abweichende Termine absolute Zeitpunkte behalten oder ihre zeitliche Abweichung zum normalen Vorkommen mitnehmen; Ausnahmen werden nach ihrer ursprünglichen Position zugeordnet. Ausschlüsse gezielt zurücknehmen, Einzelabweichungen nur ausdrücklich ausgewählt entfernen. Verwaiste Ausnahmen und mehrdeutige Zeiten stoppen. Bis 500 Vorkommen in fünf Jahren und 50 Einzelabweichungen; keine Einladung, automatische Aufteilung oder Zusage für „ab diesem Termin“. Erst die unveränderte geprüfte Vorschau anwenden, bei unklarem Ergebnis dasselbe Original lesen.</p>
    <p>Gespeicherte Kalendereinladungen lassen sich zunächst mit Organisator und eigener nativer Teilnehmeradresse prüfen. Eigene Zusage, vorläufige Zusage oder Absage für einen einzelnen Termin oder ausdrücklich eine ganze gespeicherte Masterserie ohne abweichende Einzeltermine braucht zusätzlich das bewusst erteilte Recht „Kalenderantworten übermitteln“, Kalender-Schreib-/Leserecht und den Themenzusatz. Dabei kann eine native Mitteilung/E-Mail an den vorhandenen Organisator ausgelöst werden.</p>
    <p>Der gespeicherte eigene Status wird zurückgelesen; tatsächliche Zustellung bleibt unbestätigt. Zeiten, Organisator und andere Teilnehmer bleiben erhalten. Einzelabweichungen und Stellvertretung bleiben ausgenommen. Einzeltermin oder ganze Masterserie muss bei Vorschau und Antwort derselbe ausdrücklich gewählte Umfang sein. Bei unklarem Ergebnis denselben Termin lesen und nicht automatisch erneut senden.</p>
    <p>Eigene neue Einladungen, Besprechungsänderungen und Absagen zuerst vorbereiten und die angezeigten Teilnehmer sowie den vollständigen Termininhalt prüfen. Ausführen nur nach ausdrücklichem Auftrag und mit getrenntem bewusstem calendar:organize zusätzlich zum Kalender-Lese-/Schreibrecht. Das Recht für eigene Teilnehmerantworten genügt dafür nicht; bestehende Zugänge erhalten das neue Recht nicht automatisch. Beim Ändern bleiben Teilnehmer erhalten, sofern keine vollständige Ersatzliste gewählt wird. Eine Absage entfernt das gespeicherte Besprechungsoriginal und kann native Absagen auslösen. Neue Einladungen und Änderungen können ebenfalls native Mitteilungen/E-Mails auslösen. Der gespeicherte Stand wird geprüft; tatsächliche Zustellung bleibt unbestätigt. Keine Organisatorserien, Anhänge oder Delegation. Bei unklarem Ergebnis dasselbe Original lesen und nicht automatisch erneut senden.</p>
    <p>Ganze eigene Kalender nach Umfangsvorschau nur mit getrenntem calendar:manage entfernen oder nativ wiederherstellen. Inhalte und bestehende Zugriffe bestätigen. Bei Aufbewahrung0 dauerhaft, einschließlich vorher einzeln gelöschter Originale. Kalenderentfernen ist keine Absage aller Besprechungen. Alte Zugriffe können beim Wiederherstellen wieder gelten. Direkte lokale Nutzer-/Gruppenfreigaben brauchen zusätzlich calendar:share. Neue Rechte werden nicht automatisch erteilt. Gespeicherte Verweise zu Dateien, Deck, Kontakten, Mail und Talk lesen, ohne Links nachzuladen. Eine vorhandene Datei nach Vorschau als unmanaged Verweis an einen eigenen Einzeltermin ohne Besprechung/Serie hängen; keine Dateirechte, Kopie oder Dateilöschung. Native Uploadanhänge getrennt verwalten. Einzelne eigene Papierkorboriginale nach Vorschau nativ wiederherstellen; ursprüngliche UID/Inhalte und vorhandene Zugriffe prüfen.</p>
    <p>Direkte Boardfreigaben kannst du zuerst lesen lassen. Anlegen, Rechte ändern und Aufheben brauchen zusätzlich das bewusst erteilte Recht „Boardfreigaben verwalten“ sowie eine passende Deck-Auswahl. Exakte lokale Nutzer-/Gruppenkennung und gewünschte Zusatzrechte bestimmen; native Rechte gelten. Bestehende Zugänge erhalten dieses Zusatzrecht nicht automatisch. Föderierte, Team- und Linkfreigaben sind ausgenommen.</p>
    <p>Beim Aufheben einer persönlichen Boardfreigabe entfernt Deck auch die Kartenzuständigkeiten dieser Person im gesamten Board. Diese Wirkung ausdrücklich mitbeauftragen. Andere Zugriffswege können fortbestehen; native Benachrichtigungen sind möglich. Eigentümer und direkte eigene Zugangsfreigabe bleiben geschützt. Bei unklarem Ergebnis dieselben Kennungen lesen, nicht erneut ändern.</p>
    <p>Deck-Kommentare kannst du lesen und mit ausdrücklichem Auftrag verfassen lassen. Antworten benötigen einen bekannten Kommentar derselben Karte. Bearbeiten lassen sich nur eigene Kommentare des tatsächlich verbundenen Kontos. Zuständigkeiten und Erwähnungen können native Benachrichtigungen auslösen. Bei unklarer Übermittlung zuerst nachlesen, damit kein Kommentar doppelt gesendet wird.</p>
    <p>Eine vorhandene Datei lässt sich mit ausdrücklichem Auftrag und zusätzlichem Recht „Dateifreigaben verwalten“ an eine Deck-Karte verknüpfen. Dadurch erhalten aktuelle und spätere Kartenleser Lesezugriff; native Benachrichtigungen sind möglich. Das Abtrennen einer modernen Dateizuordnung erhält die Originaldatei. Alte Deck-Dateianhänge werden damit nicht gelöscht.</p>
    <p>Mit dem zusätzlichen Konnektorrecht „Papierkorb verwalten“ kann die KI ausdrücklich gewählte eigene Dateien im persönlichen Heimspeicher in den Papierkorb löschen und gezielt wiederherstellen. Ordner einschließlich Inhalt müssen ausdrücklich benannt werden. Endgültiges Löschen wird nicht angeboten; native Aufbewahrungsfristen gelten. Die Dateien-Auswahl allein erteilt dieses Zusatzrecht nicht.</p>
    <p>Eigene Dateifreigaben kannst du für einen genau genannten Pfad lesen lassen. Neue Nutzer-/Gruppenfreigaben oder geschützte Links sowie Änderungen und Aufhebungen benötigen zusätzlich das bewusst erteilte Konnektorrecht „Dateifreigaben verwalten“. Die Dateien-Auswahl allein ergänzt dieses Recht nicht. Empfänger und gewünschte Zugriffe bestimmst du; das Aufheben einer Freigabe löscht keine Datei.</p>
    <p><a href="https://github.com/Windwanderer74/novaspace-connector/blob/main/components/nextcloud/platform/INSTALL.md" target="_blank" rel="noopener noreferrer">Kurzanleitung zum NovaSpace KI Connector öffnen</a></p>
  </details>
  <?php if ($_['error'] !== null): ?>
    <p role="alert"><?php p($_['error']); ?></p>
    <p><a href="<?php p($_['homeUrl']); ?>">Zur Verbindungsliste</a></p>
  <?php elseif ($_['preview'] !== null): $p = $_['preview']; ?>
    <h2>Verbindung zu deinem Konto bestätigen</h2>
    <p>Dein Konto: <strong><?php p($p['ownerUid']); ?></strong></p>
    <p>Anschluss: <?php p($p['label']); ?> · Kennung <?php p($p['clientDisplay']); ?></p>
    <p>Technischer Zugang: <?php p($p['nativeUid']); ?></p>
    <p>Diese Freigabe merkt die Verbindung zu deinem Konto und erlaubt, ihren Status zu prüfen. Sie erteilt noch keine zusätzlichen Geräte- oder Dateirechte.</p>
    <form method="post" action="<?php p($_['approveUrl']); ?>">
      <input type="hidden" name="requesttoken" value="<?php p($_['requesttoken']); ?>">
      <input type="hidden" name="ticket" value="<?php p($p['ticket']); ?>">
      <label for="ns-label">Name für diese Verbindung</label>
      <input id="ns-label" name="label" required maxlength="80" value="<?php p($p['label']); ?>">
      <p><button type="submit" class="primary">Verbindung bestätigen</button> <a href="<?php p($_['homeUrl']); ?>">Abbrechen</a></p>
    </form>
  <?php else: ?>
    <p>Konto: <strong><?php p($_['ownerUid']); ?></strong>. Jede bestätigte Verbindung bleibt einzeln erkennbar und widerrufbar.</p>
    <?php if ($_['connections'] === []): ?>
      <p>Noch keine Verbindung bestätigt. Rufe im Konnektor den Funktionsstand ab und öffne den dort angebotenen Einrichtungslink.</p>
    <?php endif; ?>
    <?php foreach ($_['connections'] as $c): ?>
      <section class="ns-connection">
        <h2><?php p(\OCA\NovaspacePlatform\Service\ConnectionLabels::connection($c['label'])); ?></h2>
        <?php $access = $c['accessPolicy']; $summaryFunctions = $access['functions'] ?? \OCA\NovaspacePlatform\Service\ConnectionFunctions::inherited($access['apps']); ?>
        <p>Status: <strong data-connection-status><?php p($c['revokedAt'] !== null ? 'Widerrufen' : ($access['enabled'] ? 'Verbindung eingeschaltet' : 'Hauptschalter ausgeschaltet')); ?></strong></p>
        <p>Cloud-Konnektor · technischer Zugang <?php p($c['nativeUid']); ?></p>
        <p class="ns-id">Verbindungskennung: <?php p($c['connectionId']); ?></p>
        <?php if ($c['revokedAt'] === null): ?>
          <form class="ns-access" method="post" action="<?php p($_['accessUrls'][$c['connectionId']]); ?>" data-connection-id="<?php p($c['connectionId']); ?>" data-autosave-url="<?php p($_['accessAsyncUrls'][$c['connectionId']] ?? ''); ?>">
            <input type="hidden" name="requesttoken" value="<?php p($_['requesttoken']); ?>">
            <input type="hidden" name="revision" value="<?php p($c['revision']); ?>">
            <input type="hidden" name="requestId" value="<?php p($_['requestIds'][$c['connectionId']]); ?>">
            <div class="ns-save-bar" data-save-bar>
              <span role="status" aria-live="polite" aria-atomic="true" data-save-status>Auswahl geladen</span>
              <button type="submit" class="primary" data-save-button>Änderungen speichern</button>
              <a href="<?php p($_['homeUrl']); ?>" data-save-reload hidden>Seite neu laden</a>
            </div>
            <p class="ns-autosave-hint">Änderungen werden nach kurzer Pause übernommen. Der Speicherstatus bleibt beim Scrollen sichtbar.</p>
            <noscript><p>Ohne JavaScript bitte „Änderungen speichern“ verwenden.</p></noscript>
            <label for="main-<?php p($c['connectionId']); ?>">Gesamten KI-Zugang schalten</label>
            <select id="main-<?php p($c['connectionId']); ?>" name="enabled">
              <option value="1" <?php if ($access['enabled']) { p('selected'); } ?>>Ein – ausgewählte App-Zugriffe zulassen</option>
              <option value="0" <?php if (!$access['enabled']) { p('selected'); } ?>>Aus – alle App-Zugriffe sperren</option>
            </select>
            <p>Ausgeschaltete Bereiche:
              <strong data-disabled-areas><?php $off = []; foreach ($_['functionCatalogue']['areas'] as $areaForOff) { if ($summaryFunctions['areas'][$areaForOff['id']] === 'off') $off[] = $areaForOff['label']; } p($off ? implode(', ', $off) : 'keine zusätzlichen App-Sperren'); ?></strong>.
              Bei ausgeschaltetem Hauptschalter sind sämtliche Bereiche gesperrt. Die App-Auswahl bleibt für später erhalten.
            </p>
            <?php if (!$access['configured']): ?><p>Deine bisherigen Konnektorfreigaben bleiben wirksam. Hier kannst du sie zusätzlich begrenzen.</p><?php endif; ?>
            <p>Die Auswahl legt den maximal erlaubten Zugriff fest. Die Zustimmung beim Verbinden und deine Cloud-Freigaben gelten zusätzlich. Fehlende Rechte werden dadurch nicht hinzugefügt.</p>
            <?php
              $catalogue = $_['functionCatalogue'];
              $functions = $access['functions'] ?? \OCA\NovaspacePlatform\Service\ConnectionFunctions::inherited($access['apps']);
              $visibleApps = array_column(array_filter($catalogue['areas'], fn($a) => !$a['extension']), 'app');
            ?>
            <input type="hidden" name="catalogue" value="<?php p($catalogue['hash']); ?>">
            <?php foreach ($access['apps'] as $key => $mode): if (!in_array($key, $visibleApps, true)): ?>
              <input type="hidden" name="apps[<?php p($key); ?>]" value="<?php p($mode); ?>">
            <?php endif; endforeach; ?>
            <p>Wähle den Bereichszugriff. Unter „Einzelne Funktionen“ kannst du ihn weiter einschränken. Aufklappen ändert keine Freigabe. Deine Detailauswahl bleibt beim Ausschalten erhalten.</p>
            <?php foreach (['Arbeit', 'Kommunikation', 'Verwaltung'] as $category): ?>
            <fieldset class="ns-category"><legend><?php p($category); ?></legend>
            <?php foreach ($catalogue['areas'] as $area): if ($area['category'] !== $category) continue;
              $key = $area['id']; $app = $area['app']; $info = $_['appCatalogue'][$app];
              $selected = $area['extension'] ? $functions['areas'][$key] : $access['apps'][$app];
              $rows = \OCA\NovaspacePlatform\Service\ConnectionLabels::rows($catalogue, $key);
              $restricted = false;
              foreach ($rows as $t) if (($selected === 'write' || ($selected === 'read' && $t['readOnly'])) && !in_array($t['name'], $functions['allowedTools'], true)) $restricted = true;
              $field = ($area['extension'] ? 'areas[' . $key : 'apps[' . $app) . ']';
            ?>
              <section class="ns-app-access" data-app="<?php p($app); ?>">
                <div class="ns-area-heading">
                  <label for="app-<?php p($c['connectionId'] . '-' . $key); ?>"><?php p($area['label']); ?></label>
                  <select id="app-<?php p($c['connectionId'] . '-' . $key); ?>" name="<?php p($field); ?>" data-area-mode>
                    <option value="off" <?php if ($selected === 'off') p('selected'); ?>>Aus</option>
                    <option value="read" <?php if ($selected === 'read') p('selected'); ?>>Lesen</option>
                    <?php if ($area['write'] && $info['write']): ?><option value="write" <?php if ($selected === 'write') p('selected'); ?>>Lesen und Schreiben</option><?php endif; ?>
                  </select>
                </div>
                <p class="ns-selection-state" aria-live="polite"><?php p($selected === 'off' ? 'Bereich ausgeschaltet · Detailauswahl bleibt gespeichert' : ($restricted ? 'Individuell eingeschränkt' : 'Alle Funktionen innerhalb der gewählten Zugriffsstufe ausgewählt')); ?></p>
                <?php if ($area['extension']): ?><p class="ns-area-dependency">Zusätzlich gilt der Bereichszugriff „<?php p($info['label']); ?>“. Eine Einzelauswahl hebt dessen Sperre nicht auf.</p><?php endif; ?>
                <details class="ns-function-details"><summary>Einzelne Funktionen (<?php p(count($rows)); ?>)</summary>
                  <p>Lesen und Änderungen bleiben durch die Bereichsauswahl, den Hauptschalter und deine vorhandenen Rechte begrenzt.</p>
                  <?php foreach ($rows as $t): ?>
                    <label class="ns-function">
                      <input type="checkbox" name="allowedTools[]" value="<?php p($t['name']); ?>" data-write="<?php p($t['readOnly'] ? '0' : '1'); ?>" <?php if (in_array($t['name'], $functions['allowedTools'], true)) p('checked'); ?>>
                      <span><?php p($t['displayTitle']); ?><small><?php p($t['readOnly'] ? 'Lesen / Prüfen' : 'Ändern'); ?></small></span>
                    </label>
                  <?php endforeach; ?>
                </details>
                <?php if (!$area['extension']): ?><details class="ns-area-help"><summary>Umfang und Voraussetzungen</summary><p><?php p($info['changes']); ?></p></details><?php endif; ?>
              </section>
            <?php endforeach; ?>
            </fieldset>
            <?php endforeach; ?>
            <p>Mindmap und Datei-Verknüpfungen benötigen zusätzlich Dateirechte; Deck-Verknüpfungen zusätzlich Deck-Leserechte. Eine App-Freigabe ersetzt keine Rechte an einzelnen Inhalten.</p>
            <p>Dateizugriff kann auch gespeicherte Mindmaps und exportierte Inhalte anderer Apps umfassen. Diese Liste begrenzt die App-Werkzeuge; die Auswahl einzelner Ordner und Inhalte folgt später.</p>
            <p>Die Änderung gilt nach dem Speichern für folgende Aufrufe. Bereits laufende Aufrufe können abschließen. Bei einer Sperre erhält die KI den konkreten Grund und kann den Freigabestatus weiter abfragen.</p>
          </form>
          <p>Der Widerruf sperrt folgende Konnektor-Aufrufe und zugehörige Dateifreigaben. Bereits laufende Aufrufe können noch abschließen.</p>
          <form class="ns-revoke" method="post" action="<?php p($_['revokeUrls'][$c['connectionId']]); ?>">
            <input type="hidden" name="requesttoken" value="<?php p($_['requesttoken']); ?>">
            <input type="hidden" name="revision" value="<?php p($c['revision']); ?>">
            <input type="hidden" name="requestId" value="<?php p($_['requestIds'][$c['connectionId']]); ?>">
            <button type="submit">Verbindung widerrufen</button>
          </form>
        <?php else: ?>
          <p>Zum erneuten Freigeben im Konnektor einen neuen Einrichtungslink abrufen.</p>
        <?php endif; ?>
      </section>
    <?php endforeach; ?>
    <h2>Letzte Änderungen an deinen Verbindungen</h2>
    <p>Hier werden Bestätigungen, Freigaben und Widerrufe dokumentiert. Nach automatischem Speichern die Seite neu laden, um die neuesten Einträge zu sehen.</p>
    <?php if ($_['events'] === []): ?><p>Noch keine Änderungen.</p><?php endif; ?>
    <ol class="ns-events">
    <?php foreach ($_['events'] as $e): ?>
      <li><time><?php p(gmdate('d.m.Y H:i:s', $e['occurredAt'])); ?> UTC</time> ·
        <?php p($e['actorUid']); ?> · Weboberfläche ·
        <?php p(['connection.created' => 'Verbindung angelegt', 'connection.confirmed' => 'Verbindung bestätigt', 'connection.reauthorized' => 'Verbindung erneut freigegeben', 'connection.renamed' => 'Verbindung umbenannt', 'connection.revoked' => 'Verbindung widerrufen', 'connection.access_changed' => 'Hauptschalter oder App-Freigaben geändert'][$e['action']] ?? 'Verbindung geändert'); ?>
        <?php if ($e['action'] === 'connection.access_changed'): ?>
          <span><?php $changes = []; foreach ($e['changedFields'] as $field) {
            $parts = explode(':', $field, 2); $values = explode('>', $parts[1] ?? '');
            if (count($values) !== 2) { continue; }
            $isFunction = str_starts_with($parts[0], 'function.');
            $labels = $parts[0] === 'main' || $isFunction ? ['0' => 'Aus', '1' => 'Ein'] : ['off' => 'Aus', 'read' => 'Lesen', 'write' => 'Lesen und Schreiben'];
            $name = $parts[0] === 'main' ? 'Hauptschalter' : ($_['appCatalogue'][$parts[0]]['label'] ?? 'App');
            if ($isFunction) { $byName = []; foreach ($_['functionCatalogue']['tools'] as $tool) $byName[$tool['name']] = \OCA\NovaspacePlatform\Service\ConnectionLabels::title($tool); $name = $byName[substr($parts[0], 9)] ?? substr($parts[0], 9); }
            if (str_starts_with($parts[0], 'area.')) { $byArea = array_column($_['functionCatalogue']['areas'], 'label', 'id'); $name = $byArea[substr($parts[0], 5)] ?? 'Bereich'; }
            $changes[] = $name . ': ' . ($labels[$values[0]] ?? '?') . ' → ' . ($labels[$values[1]] ?? '?');
          } p(implode(' · ', $changes)); ?></span>
        <?php endif; ?>
        <span class="ns-id"><?php p($e['connectionId']); ?></span>
      </li>
    <?php endforeach; ?>
    </ol>
  <?php endif; ?>
</main>
