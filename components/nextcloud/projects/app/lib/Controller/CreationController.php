<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Controller;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCA\NovaspaceCapsules\Service\ProjectCreationService;
use OCA\NovaspaceCapsules\Service\ProjectCreation;
use OCA\NovaspaceCapsules\Service\CapsuleService;
final class CreationController extends Controller {
    public function __construct(IRequest $request, private ProjectCreationService $creation) { parent::__construct('novaspace_capsules', $request); }
    private function response(array $value, int $status = 200): DataResponse {
        $out = new DataResponse($value, $status); $out->addHeader('Cache-Control', 'private, no-store'); return $out;
    }
    /** External API remains separate from the CSRF-protected browser routes. */
    private function api(callable $work): DataResponse {
        if (!str_starts_with((string)$this->request->getHeader('Authorization'), 'Basic ')) {
            return $this->response(['projectCreationApiVersion'=>1, 'state'=>'unavailable', 'code'=>'BASIC_AUTH_REQUIRED'], 403);
        }
        try {
            // apiContext calls the same actor/file-proof gate as actual creation.
            $context = $this->creation->apiContext();
        } catch (\Throwable $e) {
            return $this->response(['projectCreationApiVersion'=>1, 'state'=>'unavailable', 'code'=>CapsuleService::failureCode($e)], 403);
        }
        try {
            return $this->response(['projectCreationApiVersion'=>1] + $context + $work());
        } catch (\Throwable $e) {
            return $this->response(['projectCreationApiVersion'=>1, 'state'=>'unconfirmed', 'code'=>CapsuleService::failureCode($e),
                'message'=>'Der vorhandene Anlageversuch ist nicht bestätigt. Status mit derselben Kennung prüfen.'], 409);
        }
    }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function apiInfo(): DataResponse {
        return $this->api(static fn(): array => ['folderModes'=>['auto', 'custom'], 'matrix'=>ProjectCreation::MATRIX,
            'creationIdPattern'=>'^[a-f0-9]{32}$', 'readOnly'=>true, 'resumeUsesSameInput'=>true]);
    }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function apiFolders(string $path = '/'): DataResponse {
        return $this->api(fn(): array => $this->creation->folders($path));
    }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function apiStatus(string $creationId): DataResponse {
        return $this->api(fn(): array => $this->creation->status($creationId));
    }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function apiCreate(string $creationId, string $title, string $description, string $folder, string $color, string $stackName, string $expectedAccount, string $folderMode = 'custom'): DataResponse {
        return $this->api(fn(): array => $this->creation->create($creationId, $title, $description, $folder, $color, $stackName, $expectedAccount, $folderMode));
    }
    #[NoAdminRequired]
    public function create(string $creationId, string $title, string $description, string $folder, string $color, string $stackName, string $expectedAccount, string $folderMode = 'custom'): DataResponse {
        try { return $this->response($this->creation->create($creationId, $title, $description, $folder, $color, $stackName, $expectedAccount, $folderMode)); }
        catch (\Throwable $e) { return $this->response(['state'=>'unconfirmed', 'code'=>CapsuleService::failureCode($e),
            'message'=>'Die Projektanlage ist noch nicht bestätigt. Den vorhandenen Versuch prüfen.'], 409); }
    }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function folders(string $path = '/'): DataResponse {
        try { return $this->response($this->creation->folders($path)); }
        catch (\Throwable $e) { return $this->response(['code'=>CapsuleService::failureCode($e), 'message'=>'Dieser Ordner konnte nicht geöffnet werden.'], 409); }
    }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function status(string $creationId): DataResponse {
        try { return $this->response($this->creation->status($creationId)); }
        catch (\Throwable $e) { return $this->response(['state'=>'unconfirmed', 'code'=>CapsuleService::failureCode($e)], 409); }
    }
}
