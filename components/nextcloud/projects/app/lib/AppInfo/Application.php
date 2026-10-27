<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\AppInfo;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCA\Deck\Event\CardCreatedEvent;
use OCP\Navigation\Events\LoadAdditionalEntriesEvent;
use OCA\NovaspaceCapsules\Listener\ProjectMenuListener;
use OCA\NovaspaceCapsules\Listener\CardCreatedListener;
use OCA\NovaspaceCapsules\Listener\AssetsListener;
final class Application extends App implements IBootstrap {
    public const APP_ID = 'novaspace_capsules';
    public function __construct(array $urlParams = []) { parent::__construct(self::APP_ID, $urlParams); }
    public function register(IRegistrationContext $context): void {
        $context->registerEventListener(LoadAdditionalEntriesEvent::class, ProjectMenuListener::class);
        $context->registerEventListener(CardCreatedEvent::class, CardCreatedListener::class);
        $context->registerEventListener(BeforeTemplateRenderedEvent::class, AssetsListener::class);
    }
    public function boot(IBootContext $context): void {}
}
