<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
// Run against the installed Deck value classes, entirely in memory; no services or writes.
(static function (): void {
    $check = static function (bool $ok, string $name): void {
        if (!$ok) { throw new \RuntimeException('ADAPTER_TEST:' . $name); }
    };
    $card = new \OCA\Deck\Db\Card();
    $card->setId(123); $card->setTitle('Original'); $card->setDescription('Originaltext');
    $card->setStackId(96); $card->setType('plain'); $card->setOwner('Soul'); $card->setOrder(17);
    $card->setDone(new \DateTime('2026-10-25T10:11:12+02:00'));
    $card->setDuedate(new \DateTime('2026-10-29T19:30:00+01:00'));
    $card->setStartdate(new \DateTime('2026-10-26T16:00:00+01:00'));
    $card->setColor('EFD08B');
    $args = \OCA\NovaspaceCapsules\Service\DeckCardUpdate::arguments($card, 'Neuer Titel', 'Neuer Text');
    $check($args['id'] === 123 && $args['stackId'] === 96 && $args['type'] === 'plain' && $args['owner'] === 'Soul' && $args['order'] === 17, 'identity-placement');
    $check($args['title'] === 'Neuer Titel' && $args['description'] === 'Neuer Text', 'text-update');
    $check($args['done'] instanceof \OCA\Deck\Model\OptionalNullableValue && $args['done']->getValue() == $card->getDone(), 'done-preserved');
    $check(new \DateTime($args['duedate']) == $card->getDuedate() && new \DateTime($args['startdate']) == $card->getStartdate(), 'dates-preserved');
    $check($args['color']->getValue() === 'EFD08B' && $args['deletedAt'] === 0 && $args['archived'] === false, 'state-preserved');
    $copy = clone $card; $copy->setTitle('Anders'); $copy->setDescription('Anderer Text');
    $check(\OCA\NovaspaceCapsules\Service\DeckCardUpdate::preserved($card, $copy), 'readback-allows-text');
    $copy->setOrder(18);
    $check(!\OCA\NovaspaceCapsules\Service\DeckCardUpdate::preserved($card, $copy), 'readback-rejects-state-change');
    $card->setDone(null); $card->setDuedate(null); $card->setStartdate(null); $card->setColor(null);
    $empty = \OCA\NovaspaceCapsules\Service\DeckCardUpdate::arguments($card, 'Titel', 'Text');
    $check($empty['done']->getValue() === null && $empty['color']->getValue() === null && $empty['duedate'] === null && $empty['startdate'] === null, 'nulls-preserved');
    echo "NovaSpace Deck-Adapter: 8 Erhaltungsprüfungen bestanden.\n";
})();
