<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Controller;

use OCA\NovaspaceCapsules\Listener\ProjectMenuListener;
use OCA\NovaspaceCapsules\Service\ProjectOverviewService;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\INavigationManager;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Server;

/** A read-only Office entry page. Creation stays in the existing shared service. */
final class OverviewController extends Controller {
    public function __construct(IRequest $request, private IUserSession $session,
        private IAppManager $apps, private IURLGenerator $urls, private INavigationManager $navigation) {
        parent::__construct('novaspace_capsules', $request);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): TemplateResponse|DataResponse {
        $user = $this->session->getUser();
        if ($user === null) { return $this->unavailable(); }
        foreach (['office', 'deck', 'files_mindmap'] as $app) {
            if (!$this->apps->isEnabledForUser($app, $user)) { return $this->unavailable(); }
        }
        // Read Office's existing per-user categories. No fake file creator, no
        // manufacturer bundle patch and no change to template/file permissions.
        $service = Server::get(\OCA\Office\Service\CreatorCategoryService::class);
        $categories = []; $seen = [];
        foreach ($service->listCreatorCategories() as $category) {
            $id = $category['id'] ?? null;
            if (!is_string($id) || !preg_match('/^[a-zA-Z0-9_-]+$/D', $id)
                || isset($seen[$id]) || !is_string($category['label'] ?? null)) { continue; }
            $seen[$id] = true;
            $icon = $category['iconSvgInline'] ?? null;
            $categories[] = ['label'=>$id === 'files_mindmap-km' ? 'Mindmap' : $category['label'],
                'href'=>$this->urls->linkToRoute('office.page.indexpath', ['path'=>$id]),
                'icon'=>is_string($icon) && $icon !== '' ? 'data:image/svg+xml;base64,' . base64_encode($icon) : ''];
        }
        $projects = []; $projectsError = false;
        try { $projects = Server::get(ProjectOverviewService::class)->projects(); }
        catch (\Throwable) { $projectsError = true; }
        $this->navigation->setActiveEntry('office');
        $out = new TemplateResponse('novaspace_capsules', 'projects', [
            'categories'=>$categories, 'projects'=>$projects, 'projectsError'=>$projectsError,
            'projectUrl'=>$this->urls->linkToRoute('novaspace_capsules.overview.index'),
            'projectIcon'=>'data:image/svg+xml;base64,' . base64_encode(ProjectMenuListener::ICON),
        ]);
        $out->addHeader('Cache-Control', 'private, no-store');
        return $out;
    }

    private function unavailable(): DataResponse {
        $out = new DataResponse(['message'=>'Projekt ist für dieses Konto nicht verfügbar.'], 403);
        $out->addHeader('Cache-Control', 'private, no-store');
        return $out;
    }
}
