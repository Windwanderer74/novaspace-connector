<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Listener;
use OCP\App\IAppManager;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\INavigationManager;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Navigation\Events\LoadAdditionalEntriesEvent;

/** Native action row, with the same navigation/focus behavior as Office actions. */
final class ProjectMenuListener implements IEventListener {
    private bool $added = false;
    public const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#000"/><g transform="translate(5 5) scale(.69)" fill="none" stroke="#fff" stroke-width="1.8"><path d="M3 5h17v20H3zM9 5v20M15 5v20M21 12h4v8h4M25 12h4M4 10h4m2 5h4m2-4h3"/><circle cx="29" cy="12" r="1.7"/><circle cx="29" cy="20" r="1.7"/></g></svg>';
    public function __construct(private INavigationManager $navigation, private IURLGenerator $urls,
        private IUserSession $session, private IAppManager $apps) {}
    public function handle(Event $event): void {
        if (!$event instanceof LoadAdditionalEntriesEvent || $this->added) { return; }
        $user = $this->session->getUser(); if ($user === null) { return; }
        foreach (['office', 'deck', 'files_mindmap'] as $app) {
            if (!$this->apps->isEnabledForUser($app, $user)) { return; }
        }
        $this->navigation->add([
            'id'=>'novaspace-project-create', 'app'=>'novaspace_capsules', 'type'=>INavigationManager::TYPE_ACTION,
            'order'=>-1, 'href'=>$this->urls->linkToRoute('novaspace_capsules.overview.index'),
            'name'=>'Projekt', 'icon'=>'data:image/svg+xml;base64,' . base64_encode(self::ICON), 'color'=>'#000000',
        ]);
        $this->added = true;
    }
}
