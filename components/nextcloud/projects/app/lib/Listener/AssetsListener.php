<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Listener;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\IUserSession;
use OCP\Util;
final class AssetsListener implements IEventListener {
    public function __construct(private IUserSession $session) {}
    public function handle(Event $event): void {
        if (!$event instanceof BeforeTemplateRenderedEvent || $this->session->getUser() === null) { return; }
        Util::addScript('novaspace_capsules', 'pilot');
        Util::addScript('novaspace_capsules', 'projects');
        Util::addStyle('novaspace_capsules', 'pilot');
        Util::addStyle('novaspace_capsules', 'projects');
    }
}
