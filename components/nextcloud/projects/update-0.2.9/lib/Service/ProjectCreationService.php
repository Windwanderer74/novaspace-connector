<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;

use OCP\IConfig;
use OCP\IUserSession;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\IDBConnection;
use OCP\Files\IRootFolder;
use OCP\Files\Folder;
use OCP\Files\File;
use OCP\Lock\ILockingProvider;
use OCP\Server;
use OCA\Deck\Service\BoardService;
use OCA\Deck\Service\StackService;
use OCA\Deck\Service\PermissionService;
use OCA\Deck\Db\BoardMapper;
use OCA\Deck\Db\StackMapper;
use OCA\Deck\Db\Acl;

/** Native, actor-owned creation. Existing boards/maps and their ACLs are untouched. */
final class ProjectCreationService {
    private const APP = 'novaspace_capsules';
    public function __construct(private IConfig $config, private IUserSession $session, private IRequest $request,
        private IRootFolder $root, private IURLGenerator $urls, private IDBConnection $db, private ILockingProvider $locks) {}
    private function actor(): string {
        $uid = $this->session->getUser()?->getUID();
        if (!is_string($uid) || $uid === '' || !CapsuleCore::apiAllowed($uid, $this->request->getHeader('Authorization') !== '',
            (string)$this->request->getHeader('X-NovaSpace-Project-Access'))) { throw new \RuntimeException('PROJECT_ACCESS'); }
        return $uid;
    }
    private function load(string $uid, string $id): ?array {
        if (!preg_match('/^[a-f0-9]{32}$/D', $id)) { throw new \RuntimeException('CREATION_ID'); }
        $text = $this->config->getUserValue($uid, self::APP, 'creation_' . $id, '');
        return $text === '' ? null : json_decode($text, true, 32, JSON_THROW_ON_ERROR);
    }
    private function store(string $uid, array $state): void {
        $text = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $this->config->setUserValue($uid, self::APP, 'creation_' . $state['input']['id'], $text);
    }
    private function transaction(callable $work): mixed {
        $this->db->beginTransaction();
        try { $result = $work(); $this->db->commit(); return $result; }
        catch (\Throwable $e) { $this->db->rollBack(); throw $e; }
    }
    private function folder(string $uid, array $input, ?int $expectedId = null, bool $create = false): Folder {
        return ProjectFolders::resolve($this->root->getUserFolder($uid), $uid, $input, $expectedId, $create);
    }
    public function folders(string $path = '/'): array {
        $uid = $this->actor();
        return ProjectFolders::listing($this->root->getUserFolder($uid), $path);
    }
    private function mapping(int $boardId): ?array {
        $one = $this->config->getAppValue(self::APP, 'project_' . $boardId, '');
        return $one !== '' ? json_decode($one, true, 16, JSON_THROW_ON_ERROR)
            : (json_decode($this->config->getAppValue(self::APP, 'projects', '{}'), true, 32, JSON_THROW_ON_ERROR)[(string)$boardId] ?? null);
    }
    private function resources(string $uid, array $state): void {
        $board = Server::get(BoardMapper::class)->find($state['boardId']);
        $rights = Server::get(PermissionService::class)->getPermissions($state['boardId'], $uid);
        $stack = Server::get(StackMapper::class)->find($state['stackId']);
        if ($board->getOwner() !== $uid || $board->getDeletedAt() || $board->getArchived()
            || ($rights[Acl::PERMISSION_READ] ?? false) !== true || ($rights[Acl::PERMISSION_EDIT] ?? false) !== true
            || $stack->getBoardId() !== $state['boardId'] || $stack->getDeletedAt()) { throw new \RuntimeException('PROJECT_BOARD_CHANGED'); }
        foreach (ProjectCreation::framework($state)['stacks'] ?? [] as $expected) {
            $column = Server::get(StackMapper::class)->find($expected['id']);
            if ($column->getBoardId() !== $state['boardId'] || $column->getDeletedAt()
                || $column->getTitle() !== $expected['title'] || $column->getOrder() !== $expected['order']) { throw new \RuntimeException('PROJECT_MATRIX_CHANGED'); }
        }
        $files = array_values($this->root->getUserFolder($uid)->getById($state['fileId']));
        if (count($files) !== 1 || !$files[0] instanceof File || !$files[0]->isReadable() || !$files[0]->isUpdateable()
            || !str_ends_with(strtolower($files[0]->getName()), '.km')) { throw new \RuntimeException('PROJECT_FILE_CHANGED'); }
        ProjectCreation::proveMap($files[0]->getContent(), $state);
    }
    private function verify(string $uid, array $state): array {
        $this->resources($uid, $state);
        if ($this->mapping($state['boardId']) !== ProjectCreation::mapping($state)) { throw new \RuntimeException('PROJECT_MAPPING_CHANGED'); }
        return ['state'=>'complete', 'creationId'=>$state['input']['id'], 'boardId'=>$state['boardId'], 'stackId'=>$state['stackId'],
            'fileId'=>$state['fileId'], 'rootId'=>'ns_project_' . $state['input']['id'], 'verified'=>true, 'framework'=>ProjectCreation::framework($state),
            'boardUrl'=>$this->urls->getAbsoluteURL('/index.php/apps/deck/#/board/' . $state['boardId']),
            'mindmapUrl'=>$this->urls->getAbsoluteURL('/index.php/f/' . $state['fileId'])];
    }
    public function status(string $id): array {
        $uid = $this->actor(); $state = $this->load($uid, $id);
        if ($state === null) { return ['state'=>'not-found', 'creationId'=>$id]; }
        if ($state['phase'] === 'complete') { return $this->verify($uid, $state); }
        return ['state'=>'partial', 'creationId'=>$id, 'phase'=>$state['phase'], 'boardId'=>$state['boardId'] ?? null, 'fileId'=>$state['fileId'] ?? null,
            'input'=>['title'=>$state['input']['title'], 'description'=>$state['input']['description'], 'folder'=>$state['input']['folder'], 'folderMode'=>$state['input']['folderMode'] ?? 'custom', 'color'=>$state['input']['color'], 'stackName'=>$state['input']['stack']]];
    }
    public function create(string $id, string $title, string $description, string $folder, string $color, string $stack, string $expectedAccount, string $folderMode = 'custom'): array {
        $uid = $this->actor();
        if ($uid !== $expectedAccount) { throw new \RuntimeException('PROJECT_ACCOUNT_CHANGED'); }
        $input = ProjectCreation::request($id, $title, $description, $folder, $color, $stack, $folderMode);
        $key = self::APP . '/create/' . hash('sha256', $uid);
        $this->locks->acquireLock($key, ILockingProvider::LOCK_EXCLUSIVE);
        try {
            return ProjectCreation::run($input, [
                'load'=>fn(string $id) => $this->load($uid, $id),
                'save'=>fn(array $state) => $this->store($uid, $state),
                'preflight'=>function (array $i) use ($uid): int {
                    if ($i['stack'] !== 'Neu') { throw new \RuntimeException('PROJECT_MATRIX_INPUT'); }
                    foreach (Server::get(BoardService::class)->getUserBoards() as $b) {
                        if ($b->getOwner() === $uid && !$b->getDeletedAt() && mb_strtolower($b->getTitle()) === mb_strtolower($i['title'])) { throw new \RuntimeException('PROJECT_BOARD_EXISTS'); }
                    }
                    $dir = $this->folder($uid, $i, null, true);
                    if ($dir->nodeExists($i['title'] . '.km')) { throw new \RuntimeException('PROJECT_FILE_EXISTS'); }
                    return $dir->getId();
                },
                'reserve'=>fn(array $i, int $folderId) => $this->transaction(function () use ($uid, $i, $folderId): array {
                    if ($i['stack'] !== 'Neu') { throw new \RuntimeException('PROJECT_MATRIX_INPUT'); }
                    $board = Server::get(BoardService::class)->create($i['title'], $uid, $i['color']);
                    $stacks = [];
                    foreach (ProjectCreation::MATRIX as $order => $name) {
                        $column = Server::get(StackService::class)->create($name, $board->getId(), $order);
                        $stacks[] = ['id'=>$column->getId(), 'title'=>$name, 'order'=>$order];
                    }
                    $state = ['version'=>1, 'input'=>$i, 'fingerprint'=>ProjectCreation::fingerprint($i), 'phase'=>'board-created',
                        'boardId'=>$board->getId(), 'stackId'=>$stacks[0]['id'], 'folderId'=>$folderId, 'workplanVersion'=>1, 'frameworkVersion'=>1, 'stacks'=>$stacks];
                    $this->store($uid, $state); return $state;
                }),
                'map'=>function (array $state, bool $mayCreate) use ($uid): int {
                    $dir = $this->folder($uid, $state['input'], $state['folderId']); $name = $state['input']['title'] . '.km';
                    $workplanVersion = $state['workplanVersion'] ?? 0;
                    if (!in_array($workplanVersion, [0, 1], true)) { throw new \RuntimeException('PROJECT_WORKPLAN_VERSION'); }
                    $text = ProjectCreation::map($state['input'], $state['boardId'], $state['stackId'], rtrim($this->urls->getAbsoluteURL('/'), '/'), ProjectCreation::framework($state), $workplanVersion === 1);
                    if (!$dir->nodeExists($name)) {
                        if (!$mayCreate) { throw new \RuntimeException('PROJECT_MAP_OUTCOME_UNKNOWN'); }
                        if (!$this->config->getSystemValueBool('filelocking.enabled', true)) { throw new \RuntimeException('NATIVE_LOCKING_REQUIRED'); }
                        if (!\OC\Files\Filesystem::$loaded) { \OC_Util::setupFS(); }
                        $view = \OC\Files\Filesystem::getView(); $home = $this->root->getUserFolder($uid);
                        if ($view === null || \OC\Files\Filesystem::getRoot() !== $home->getPath()
                            || !$dir->getStorage()->instanceOfStorage('\\OCP\\Files\\Storage\\ILockingStorage')) { throw new \RuntimeException('MAP_CAS_CONTEXT'); }
                        $path = $view->getRelativePath($dir->getPath() . '/' . $name);
                        if (!is_string($path) || $path === '' || $path[0] !== '/') { throw new \RuntimeException('MAP_CAS_PATH'); }
                        MapWriteGuard::run($path, function () use ($dir, $name): void {
                            if ($dir->nodeExists($name)) { throw new \RuntimeException('PROJECT_FILE_EXISTS'); }
                        }, static function () use ($dir, $name, $text): void { $dir->newFile($name, $text); });
                    }
                    $file = $dir->get($name);
                    if (!$file instanceof File || !$file->isReadable() || !$file->isUpdateable() || $file->getContent() !== $text) { throw new \RuntimeException('PROJECT_MAP_CONFLICT'); }
                    ProjectCreation::proveMap($text, $state); return $file->getId();
                },
                'commit'=>function (array $state) use ($uid): array {
                    $registryKey = self::APP . '/project-registry/' . $state['boardId']; $this->locks->acquireLock($registryKey, ILockingProvider::LOCK_EXCLUSIVE);
                    try { return $this->transaction(function () use ($uid, $state): array {
                        $this->resources($uid, $state);
                        $existing = $this->mapping($state['boardId']); $mapping = ProjectCreation::mapping($state);
                        if ($existing !== null && $existing !== $mapping) { throw new \RuntimeException('PROJECT_MAPPING_CONFLICT'); }
                        // One key per board avoids overwriting a concurrent project's
                        // registry entry. The historical pilot registry is never rewritten.
                        $this->config->setAppValue(self::APP, 'project_' . $state['boardId'], json_encode($mapping, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
                        $state['phase'] = 'complete'; $this->store($uid, $state); return $state;
                    }); } finally { $this->locks->releaseLock($registryKey, ILockingProvider::LOCK_EXCLUSIVE); }
                },
                'verify'=>fn(array $state) => $this->verify($uid, $state),
            ]);
        } finally { $this->locks->releaseLock($key, ILockingProvider::LOCK_EXCLUSIVE); }
    }
}
