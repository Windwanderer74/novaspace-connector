<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;

use NovaSpace\Platform\NativeAccessResolver;
use OCP\IUserSession;
use OCP\ISession;
use OCP\Authentication\Token\IProvider;
use OCP\Http\Client\IClientService;

require_once __DIR__ . '/../Native/NativeAccessResolver.php';
require_once __DIR__ . '/GatewayVerifier.php';
require_once __DIR__ . '/GithubBridgeCore.php';

final class GithubBridgeService {
    public function __construct(private IUserSession $users, private ISession $session, private IProvider $tokens,
        private GatewayVerifier $gateway, private ConnectionStore $connections, private IClientService $http) {}

    public function execute(string $assertion, array $command): array {
        GithubBridgeCore::shape($command);
        $body = GithubBridgeCore::canonical(['command' => $command]);
        if (strlen($body) > 100000) { throw new PlatformDenied('command_too_large'); }
        $proof = (new NativeAccessResolver($this->users, $this->session, $this->tokens))->resolve();
        if ($proof->authentication !== 'app_password') { throw new PlatformDenied('app_password_required'); }
        $owner = $proof->nativeUid; $connectionId = null;
        $write = in_array($command['operation'], ['presentation_write', 'sync_run'], true);
        if ($assertion !== '') {
            $claims = $this->gateway->verify($assertion, 'github', null, hash('sha256', $body));
            if (!in_array('github:read', $claims['scope'], true) || ($write && !in_array('github:write', $claims['scope'], true))) { throw new PlatformDenied('github_scope_required'); }
            $state = $this->connections->status(['issuer' => $claims['iss'], 'subjectHash' => $claims['sub'], 'clientHash' => $claims['client'],
                'nativeUid' => $proof->nativeUid, 'nativeTokenId' => $proof->nativeTokenId]);
            if (!$state['active'] || !($state['accessPolicy']['enabled'] ?? false)
                || !in_array($state['accessPolicy']['apps']['deck'] ?? 'off', $write ? ['write'] : ['read', 'write'], true)) { throw new PlatformDenied('connection_or_deck_access_disabled'); }
            $owner = $state['connection']['ownerUid']; $connectionId = $state['connection']['connectionId'];
        }
        $base = ['account' => $owner, 'actorUid' => $proof->nativeUid, 'connectionId' => $connectionId];
        if ($write && $command['expectedAccount'] !== $owner) { return $base + ['outcome' => 'account_conflict', 'committed' => false]; }
        // Only this owner's personal GitHub connection; never fall back to global installation credentials.
        $user = \OCP\Server::get(\OCP\IUserManager::class)->get($owner);
        if ($user === null || !\OCP\Server::get(\OCP\App\IAppManager::class)->isEnabledForUser('deckgithubsync', $user)) {
            return $base + ['outcome' => 'sync_app_unavailable', 'connected' => false, 'committed' => false];
        }
        \OC_App::loadApp('deckgithubsync');
        $github = \OCP\Server::get(\OCA\DeckGithubSync\Service\GithubClientService::class);
        if ($github->getUserToken($owner) === '') { return $base + ['outcome' => 'github_not_connected', 'connected' => false, 'committed' => false]; }
        $token = $github->getUserAccessToken($owner);
        if ($token === '') { throw new PlatformDenied('github_connection_unavailable'); }
        $request = function (string $method, string $path, array $data) use ($token): array {
            if (!in_array($method, ['GET', 'POST', 'PUT'], true) || !str_starts_with($path, '/') || str_starts_with($path, '//')) { throw new PlatformDenied('invalid_remote_operation'); }
            $options = ['headers' => ['Authorization' => 'Bearer ' . $token, 'Accept' => 'application/vnd.github+json',
                'Content-Type' => 'application/json', 'User-Agent' => 'NovaSpace-GitHub-Bridge', 'X-GitHub-Api-Version' => '2022-11-28'],
                'timeout' => 20, 'allow_redirects' => false, 'http_errors' => false];
            if ($data !== []) { $options['body'] = json_encode($data, JSON_THROW_ON_ERROR); }
            $client = $this->http->newClient();
            $response = match ($method) {
                'GET' => $client->get('https://api.github.com' . $path, $options),
                'POST' => $client->post('https://api.github.com' . $path, $options),
                'PUT' => $client->put('https://api.github.com' . $path, $options),
            };
            $raw = (string)$response->getBody();
            if (strlen($raw) > 1048576) { throw new PlatformDenied('remote_response_too_large'); }
            $decoded = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
            if (!is_array($decoded)) { throw new PlatformDenied('remote_response_invalid'); }
            return ['status' => $response->getStatusCode(), 'data' => $decoded, 'scopes' => array_values(array_filter(array_map('trim', explode(',', (string)$response->getHeader('X-OAuth-Scopes')))))];
        };
        $maps = function () use ($owner): array {
            $out = [];
            foreach (\OCP\Server::get(\OCA\DeckGithubSync\Db\BoardMapMapper::class)->findByUser($owner) as $m) {
                if ($m->getUserId() !== $owner) { throw new PlatformDenied('mapping_owner_conflict'); }
                $out[] = ['id' => $m->getId(), 'boardId' => $m->getDeckBoardId(), 'githubOwner' => $m->getGithubOwner(),
                    'githubNumber' => $m->getGithubNumber(), 'repository' => $m->getGithubRepository(), 'direction' => $m->getDirection(),
                    'fieldConfig' => $m->getFieldConfig(), 'lastSync' => $m->getLastSync()];
            }
            return $out;
        };
        $sync = function (int $id) use ($owner): array {
            $service = \OCP\Server::get(\OCA\DeckGithubSync\Service\SyncService::class);
            $map = $service->findMap($id, $owner);
            if ($map->getUserId() !== $owner) { throw new PlatformDenied('mapping_owner_conflict'); }
            $service->syncBoard($map);
            return ['busy' => false];
        };
        return $base + (new GithubBridgeCore($request, $maps, $sync))->execute($owner, $command);
    }
}
