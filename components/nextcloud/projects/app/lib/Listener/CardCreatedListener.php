<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Listener;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCA\Deck\Event\CardCreatedEvent;
use OCA\NovaspaceCapsules\Service\CapsuleService;
final class CardCreatedListener implements IEventListener {
    public function __construct(private CapsuleService $capsules) {}
    public function handle(Event $event): void {
        if (!$event instanceof CardCreatedEvent) { return; }
        // Creation of the original card must remain visible even if the second store fails.
        $this->capsules->onCreated($event->getCard());
    }
}
