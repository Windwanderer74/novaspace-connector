<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
style('novaspace_platform', 'connections');
?>
<main class="ns-platform">
  <h1>Inventory: Meine KI-Freigaben</h1>
  <?php if ($_['error'] !== null): ?><p role="alert"><?php p($_['error']); ?></p><?php endif; ?>
  <p>Konto: <strong><?php p($_['ownerUid']); ?></strong></p>
  <p>Du bestimmst, welche bestätigte Verbindung deine eigenen Geräte lesen oder bearbeiten darf. Zusätzlich benötigt der Konnektor die passenden Anwendungsrechte. Du kannst diese Freigabe jederzeit hier widerrufen.</p>
  <p>„Lesen und bearbeiten“ erlaubt neue Geräte und Änderungen an Name, Hersteller, Beschreibung, Link, Details und Kommentar. Löschen, Weiterfreigeben, Anhänge, Stückzahlen und Standorte sind nicht enthalten.</p>
  <?php foreach ($_['connections'] as $c): $f = $_['forms'][$c['connectionId']]; ?>
  <section class="ns-connection">
    <h2><?php p($c['label']); ?></h2>
    <p>Technischer Zugang: <?php p($c['nativeUid']); ?> · Verbindung <?php p($c['connectionId']); ?></p>
    <p>Gerätefreigabe: <strong><?php p(['none' => 'Gesperrt', 'read' => 'Lesen', 'write' => 'Lesen und bearbeiten'][$c['grant']['mode']]); ?></strong></p>
    <?php if ($c['revokedAt'] === null): ?>
    <form method="post" action="<?php p($f['url']); ?>">
      <input type="hidden" name="requesttoken" value="<?php p($_['requesttoken']); ?>">
      <input type="hidden" name="connectionRevision" value="<?php p($c['revision']); ?>">
      <input type="hidden" name="grantRevision" value="<?php p($c['grant']['revision']); ?>">
      <input type="hidden" name="requestId" value="<?php p($f['requestId']); ?>">
      <label for="mode-<?php p($c['connectionId']); ?>">Zugriff auf deinen Inventory-Bestand</label>
      <select id="mode-<?php p($c['connectionId']); ?>" name="mode">
        <?php foreach (['none' => 'Gesperrt / widerrufen', 'read' => 'Nur lesen', 'write' => 'Lesen und bearbeiten'] as $v => $label): ?>
        <option value="<?php p($v); ?>" <?php if ($v === $c['grant']['mode']): ?>selected<?php endif; ?>><?php p($label); ?></option>
        <?php endforeach; ?>
      </select>
      <p><button type="submit" class="primary">Gerätefreigabe speichern</button></p>
    </form>
    <?php else: ?><p>Die Verbindung ist widerrufen. Eine erneute Bestätigung der Verbindung übernimmt keine früheren Gerätefreigaben.</p><?php endif; ?>
  </section>
  <?php endforeach; ?>
  <h2>Letzte fünf protokollierte Aktionen</h2>
  <p>Dieser Verlauf enthält Änderungen über die KI-Verbindung und Freigabeaktionen auf dieser Seite. Änderungen aus der normalen Inventory-Oberfläche sind noch nicht erfasst. Alle Zeiten sind UTC.</p>
  <?php if ($_['actions'] === []): ?><p>Noch keine Aktionen.</p><?php endif; ?>
  <ol class="ns-events">
  <?php foreach ($_['actions'] as $a): ?>
    <li><time><?php p(gmdate('d.m.Y H:i:s', $a['occurredAt'])); ?></time> · <?php p($a['channel'] === 'web' ? 'Eigene Websitzung' : 'KI im Auftrag des Kontos'); ?>
      <p><?php p($a['action']); ?> · Eigentümer <?php p($a['ownerUid']); ?> · Ausführender Zugang <?php p($a['actorUid']); ?> · Gerät <?php p($a['itemId'] ?? '–'); ?></p>
      <p>Felder: <?php p(implode(', ', $a['changedFields'])); ?> · Verbindung <?php p($a['connectionId']); ?></p>
      <details><summary>Vorher und nachher anzeigen</summary><pre><?php p(json_encode(['vorher' => $a['before'], 'nachher' => $a['after']], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); ?></pre></details>
    </li>
  <?php endforeach; ?>
  </ol>
</main>
