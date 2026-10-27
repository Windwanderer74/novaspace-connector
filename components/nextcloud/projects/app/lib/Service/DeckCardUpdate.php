<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;

use OCA\Deck\Db\Card;
use OCA\Deck\Model\OptionalNullableValue;

/** Deck 1.19.0's general update replaces fields even when defaults are omitted. */
final class DeckCardUpdate {
    private static function date(?\DateTimeInterface $value): ?string {
        return $value?->format('Y-m-d\TH:i:s.uP');
    }
    public static function arguments(Card $card, string $title, string $description): array {
        $owner = $card->getOwner();
        if (!is_string($owner) || $owner === '') { throw new \RuntimeException('CARD_OWNER_CONTRACT'); }
        return [
            'id' => $card->getId(), 'title' => $title, 'stackId' => $card->getStackId(),
            'type' => $card->getType(), 'owner' => $owner, 'description' => $description,
            'order' => $card->getOrder(), 'duedate' => self::date($card->getDuedate()),
            'deletedAt' => $card->getDeletedAt(), 'archived' => $card->getArchived(),
            // null here would reset done; the explicit wrapper preserves even a null value.
            'done' => new OptionalNullableValue($card->getDone()),
            'startdate' => self::date($card->getStartdate()),
            'color' => new OptionalNullableValue($card->getColor()),
        ];
    }
    public static function preserved(Card $a, Card $b): bool {
        return $a->getId() === $b->getId() && $a->getStackId() === $b->getStackId()
            && $a->getType() === $b->getType() && $a->getOwner() === $b->getOwner()
            && $a->getOrder() === $b->getOrder() && $a->getDeletedAt() === $b->getDeletedAt()
            && $a->getArchived() === $b->getArchived() && $a->getDone() == $b->getDone()
            && $a->getDuedate() == $b->getDuedate() && $a->getStartdate() == $b->getStartdate()
            && $a->getColor() === $b->getColor();
    }
}
