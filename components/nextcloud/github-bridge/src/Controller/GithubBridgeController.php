<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Controller;

use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCA\NovaspacePlatform\Service\GithubBridgeService;

final class GithubBridgeController extends OCSController {
    public function __construct(string $appName, IRequest $request, private GithubBridgeService $github) { parent::__construct($appName, $request); }
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function execute(array $command): DataResponse {
        $headers = ['Cache-Control' => 'no-store', 'Pragma' => 'no-cache', 'Referrer-Policy' => 'no-referrer'];
        foreach (array_keys($this->request->getParams()) as $key) {
            if (!in_array($key, ['command', 'format', '_route'], true)) { return new DataResponse(['error' => 'unsupported_parameter'], 400, $headers); }
        }
        try { return new DataResponse($this->github->execute($this->request->getHeader('X-NovaSpace-Client'), $command), 200, $headers); }
        catch (\Throwable) {
            // No native exception, remote body, request headers, token or credential in the response.
            return new DataResponse(['error' => 'github_operation_unconfirmed'], 503, $headers);
        }
    }
}
