<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Controller;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCA\NovaspaceCapsules\Service\CapsuleService;
final class ProjectController extends Controller {
    public function __construct(IRequest $request, private CapsuleService $capsules) { parent::__construct('novaspace_capsules', $request); }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function show(int $boardId): DataResponse {
        try { $response = new DataResponse($this->capsules->project($boardId)); }
        catch (\Throwable) { $response = new DataResponse(['state' => 'unavailable'], 404); }
        $response->addHeader('Cache-Control', 'private, no-store'); return $response;
    }
    #[NoAdminRequired]
    public function resume(int $boardId, int $cardId): DataResponse {
        try { return new DataResponse($this->capsules->resume($boardId, $cardId)); }
        catch (\Throwable $error) { return new DataResponse(['state' => 'pending', 'code' => CapsuleService::failureCode($error), 'message' => 'Zuordnung offen. Vorhandene Karte und Mindmap prüfen; keine zweite Karte anlegen.'], 409); }
    }
    // Basic-auth API calls do not carry browser CSRF tokens. This separate route
    // requires Authorization and the same checked cross-app proof in CapsuleService.
    // The browser route above keeps its normal CSRF protection.
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function apiResume(int $boardId, int $cardId): DataResponse {
        if (!str_starts_with((string)$this->request->getHeader('Authorization'), 'Basic ')) {
            return new DataResponse(['state' => 'pending', 'code' => 'BASIC_AUTH_REQUIRED'], 403);
        }
        return $this->resume($boardId, $cardId);
    }
}
