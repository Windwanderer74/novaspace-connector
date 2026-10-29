<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;

use OCA\DeckGithubSync\Db\BoardMap;
use OCA\DeckGithubSync\Service\GithubClientService;
use OCA\DeckGithubSync\Service\GithubProjectService;
use OCA\DeckGithubSync\Service\SyncService;
use Psr\Log\LoggerInterface;

/** Per-run project adapter. The signed upstream app and mapping settings stay intact. */
final class GithubSyncProjectAdapter extends GithubProjectService {
    private string $owner;
    private string $project;
    private bool $pullEnabled;
    private array $fieldMap;
    private string $direction;
    private array $statusOptions = [];

    public function __construct(private GithubClientService $nativeClient, LoggerInterface $logger, BoardMap $map) {
        parent::__construct($nativeClient, $logger);
        $this->owner = $map->getUserId();
        $this->project = $map->getGithubProjectId();
        $this->direction = $map->getDirection();
        $this->fieldMap = $map->getFieldMap();
        $this->pullEnabled = in_array($this->direction, [BoardMap::DIR_BOTH, BoardMap::DIR_TO_DECK], true);
    }

    private function target(string $owner, ?string $project = null): void {
        if ($owner !== $this->owner || ($project !== null && $project !== $this->project)) {
            throw new \RuntimeException('sync_adapter_target_conflict');
        }
    }

    private function allowed(string $field, string $wanted): bool {
        $setting = $this->fieldMap[$field] ?? BoardMap::DIR_BOTH;
        return in_array($this->direction, [BoardMap::DIR_BOTH, $wanted], true)
            && in_array($setting, [BoardMap::DIR_BOTH, $wanted], true);
    }

    public function listItems(string $userId, string $projectId, ?string $after = null, ?string $filter = null): array {
        $this->target($userId, $projectId);
        return parent::listItems($userId, $projectId, $after, $this->pullEnabled ? null : $filter);
    }

    public function getFields(string $userId, string $projectId): array {
        $this->target($userId, $projectId);
        $fields = parent::getFields($userId, $projectId);
        $this->statusOptions = $fields['options'] ?? [];
        // The upstream sync creates Deck lists from these names even when status is off.
        if (!$this->allowed('status', BoardMap::DIR_TO_DECK)) { $fields['options'] = []; }
        return $fields;
    }

    public function ensureStatusOptions(string $userId, string $statusFieldId, array $fields, array $stackTitles): array {
        $this->target($userId);
        if ($this->allowed('status', BoardMap::DIR_TO_GITHUB)) {
            return parent::ensureStatusOptions($userId, $statusFieldId, $fields, $stackTitles);
        }
        $options = [];
        foreach ($this->statusOptions as $name => $id) { $options[mb_strtolower((string)$name)] = $id; }
        return $options;
    }

    public function ensureDateFields(string $userId, string $projectId, string $startFieldId, string $dueFieldId): array {
        $this->target($userId, $projectId);
        if ($startFieldId === '' && $this->allowed('start', BoardMap::DIR_TO_GITHUB)) {
            $startFieldId = $this->createSelectedDateField($userId, $projectId, 'Start date');
        }
        if ($dueFieldId === '' && $this->allowed('due', BoardMap::DIR_TO_GITHUB)) {
            $dueFieldId = $this->createSelectedDateField($userId, $projectId, 'Due date');
        }
        return ['startDateFieldId' => $startFieldId, 'dateFieldId' => $dueFieldId];
    }

    private function createSelectedDateField(string $owner, string $project, string $name): string {
        $q = 'mutation($project:ID!,$name:String!){ createProjectV2Field(input:{projectId:$project name:$name dataType:DATE}){ projectV2Field{ ... on ProjectV2FieldCommon{id} } } }';
        $r = $this->nativeClient->graphql($owner, $q, ['project' => $project, 'name' => $name]);
        $id = $r['data']['createProjectV2Field']['projectV2Field']['id'] ?? null;
        if (!is_string($id) || $id === '') { throw new \RuntimeException('selected_date_field_unconfirmed'); }
        return $id;
    }

    public static function forMapping(BoardMap $map): SyncService {
        $manager = \OCP\Server::get(\OCP\App\IAppManager::class);
        $root = realpath($manager->getAppPath('deckgithubsync', true));
        if (!is_string($root)) { throw new \RuntimeException('sync_source_unconfirmed'); }
        $expected = [
            'SyncService.php' => '9f9221af999230cd050de14e2915427f4ff49618d48908ebdcba72cb76b7d0b1',
            'DeckService.php' => '69d9f62b41bf7c3fcdb717ade573460eaf1422fad938694316695a32bf68c213',
            'GithubProjectService.php' => '4de6ed288cc33479b5309aa1a55ca0f9a5b0caf81fb7c9a29ea0c6513341a57d',
        ];
        foreach ($expected as $name => $hash) {
            $path = realpath($root . '/lib/Service/' . $name);
            if (!is_string($path) || !str_starts_with($path, $root . DIRECTORY_SEPARATOR)
                || !is_file($path) || hash_file('sha256', $path) !== $hash) {
                throw new \RuntimeException('sync_source_changed');
            }
        }
        $logger = \OCP\Server::get(LoggerInterface::class);
        return new SyncService(
            \OCP\Server::get(\OCA\DeckGithubSync\Db\BoardMapMapper::class),
            \OCP\Server::get(\OCA\DeckGithubSync\Db\ItemMapMapper::class),
            \OCP\Server::get(\OCA\DeckGithubSync\Db\UserMapMapper::class),
            \OCP\Server::get(\OCA\DeckGithubSync\Service\DeckService::class),
            new self(\OCP\Server::get(GithubClientService::class), $logger, $map),
            \OCP\Server::get(\OCP\IUserManager::class),
            \OCP\Server::get(\OCP\IUserSession::class),
            $logger,
            \OCP\Server::get(\OCP\L10N\IFactory::class)->get('deckgithubsync'),
            \OCP\Server::get(\OCP\Lock\ILockingProvider::class)
        );
    }
}
