<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;
use OCP\IConfig;
use OCP\IUserSession;
use OCP\IURLGenerator;
use OCP\IRequest;
use OCP\Files\IRootFolder;
use OCP\Files\File;
use OCP\Lock\ILockingProvider;
use OCP\Server;
use OCA\Deck\Db\Card;
use OCA\Deck\Db\CardMapper;
use OCA\Deck\Db\Acl;
use OCA\Deck\Service\PermissionService;
use OCA\Deck\Service\CardService;
use Psr\Log\LoggerInterface;

final class CapsuleService {
    private bool $busy = false;
    public function __construct(private IConfig $config, private IUserSession $session,
        private IRootFolder $root, private IURLGenerator $urls, private LoggerInterface $logger, private IRequest $request) {}
    private function mapping(int $boardId): array {
        $one = $this->config->getAppValue('novaspace_capsules', 'project_' . $boardId, '');
        $p = $one !== '' ? json_decode($one, true, 16, JSON_THROW_ON_ERROR)
            : (json_decode($this->config->getAppValue('novaspace_capsules', 'projects', '{}'), true, 16, JSON_THROW_ON_ERROR)[(string)$boardId] ?? null);
        if (!is_array($p) || ($p['boardId'] ?? null) !== $boardId || ($p['enabled'] ?? false) !== true
            || !is_int($p['fileId'] ?? null) || !is_string($p['rootId'] ?? null) || !is_int($p['afterCardId'] ?? null)) { throw new \RuntimeException('NOT_CONNECTED'); }
        return $p;
    }
    private function actor(): string {
        $uid = $this->session->getUser()?->getUID();
        if (!is_string($uid) || $uid === '') { throw new \RuntimeException('LOGIN_REQUIRED'); }
        return $uid;
    }
    private function permission(int $boardId, bool $write): void {
        $p = Server::get(PermissionService::class)->getPermissions($boardId, $this->actor());
        if (($p[Acl::PERMISSION_READ] ?? false) !== true || ($write && ($p[Acl::PERMISSION_EDIT] ?? false) !== true)) { throw new \RuntimeException('BOARD_ACCESS'); }
    }
    private function file(array $p, bool $write): array {
        $folder = $this->root->getUserFolder($this->actor()); $nodes = array_values($folder->getById($p['fileId']));
        if (count($nodes) !== 1 || !$nodes[0] instanceof File || !$nodes[0]->isReadable() || ($write && !$nodes[0]->isUpdateable())) { throw new \RuntimeException('MAP_ACCESS'); }
        $f = $nodes[0]; $relative = $folder->getRelativePath($f->getPath());
        if (!is_string($relative) || !preg_match('/\.km$/i', $relative)) { throw new \RuntimeException('MAP_IDENTITY'); }
        return [$f, '/' . ltrim($relative, '/')];
    }
    public function project(int $boardId): array {
        $p = $this->mapping($boardId); $this->permission($boardId, false); [$f] = $this->file($p, false);
        $map = CapsuleCore::parse($f->getContent());
        if (($map['root']['data']['id'] ?? '') !== $p['rootId']) { throw new \RuntimeException('ROOT_CHANGED'); }
        $prefix = 'pending_' . $boardId . '_'; $pending = [];
        foreach ($this->config->getAppKeys('novaspace_capsules') as $key) {
            if (str_starts_with($key, $prefix) && ctype_digit(substr($key, strlen($prefix)))) { $pending[] = (int)substr($key, strlen($prefix)); }
        }
        sort($pending);
        return ['state' => 'connected', 'boardId' => $boardId, 'fileId' => $p['fileId'], 'rootId' => $p['rootId'],
            'mindmapName' => $f->getName(), 'url' => $this->urls->getAbsoluteURL('/index.php/f/' . $p['fileId']),
            'automaticNewCards' => true, 'pendingCardIds' => array_slice($pending, 0, 100), 'version' => '0.2.1',
            'framework' => ProjectCreation::framework($p)];
    }
    public static function failureCode(\Throwable $error): string {
        if ($error instanceof \OCP\Lock\LockedException) { return 'MAP_LOCKED'; }
        $message = $error->getMessage();
        return preg_match('/^[A-Z][A-Z0-9_:.-]{0,79}$/', $message) ? $message : 'NATIVE_RUNTIME_ERROR';
    }
    private function pending(int $boardId, int $cardId, bool $value, string $code = '1'): void {
        // One key per original card avoids a read/modify/write race between simultaneous requests.
        $key = 'pending_' . $boardId . '_' . $cardId;
        if ($value) { $this->config->setAppValue('novaspace_capsules', $key, $code); }
        else { $this->config->deleteAppValue('novaspace_capsules', $key); }
    }
    public function onCreated(Card $card): void {
        if ($this->busy) { return; }
        try { $boardId = (int)Server::get(CardMapper::class)->findBoardId($card->getId()); $p = $this->mapping($boardId); }
        catch (\Throwable) { return; } // Other boards are outside this pilot.
        if ($card->getId() <= $p['afterCardId']) { return; }
        try {
            if (CapsuleCore::binding($card->getDescription() ?? '') !== null) { return; }
            $this->apiFileAccess(); $this->busy = true; $out = $this->attach($boardId, $card->getId());
            if (isset($out['title'], $out['description'])) { $card->setTitle($out['title']); $card->setDescription($out['description']); }
        } catch (\Throwable $e) {
            try { $this->pending($boardId, $card->getId(), true, self::failureCode($e)); } catch (\Throwable) {}
            $this->logger->warning('NovaSpace Arbeitskapsel offen; Originalkarte erhalten.', ['app' => 'novaspace_capsules', 'boardId' => $boardId, 'cardId' => $card->getId()]);
        } finally { $this->busy = false; }
    }
    public function resume(int $boardId, int $cardId): array {
        $this->permission($boardId, true);
        $this->apiFileAccess();
        if ($this->busy) { throw new \RuntimeException('BUSY'); }
        try { $this->busy = true; return $this->attach($boardId, $cardId); }
        finally { $this->busy = false; }
    }
    private function apiFileAccess(): void {
        // A browser uses the user's own session and file permissions.
        // API/technical-account calls also need the connector's checked cross-app grant.
        if (!CapsuleCore::apiAllowed($this->actor(), (string)$this->request->getHeader('Authorization') !== '',
            (string)$this->request->getHeader('X-NovaSpace-Project-Access'))) {
            throw new \RuntimeException('FILES_POLICY_PROOF_REQUIRED');
        }
    }
    private function same(Card $a, Card $b): bool {
        return DeckCardUpdate::preserved($a, $b)
            && $a->getTitle() === $b->getTitle() && $a->getDescription() === $b->getDescription()
            && !$b->getDeletedAt() && !$b->getArchived();
    }
    private function save(File $file, string $etag, array $project, string $before, string $text): void {
        if (!$this->config->getSystemValueBool('filelocking.enabled', true)) { throw new \RuntimeException('NATIVE_LOCKING_REQUIRED'); }
        if (!\OC\Files\Filesystem::$loaded) { \OC_Util::setupFS(); }
        $folder = $this->root->getUserFolder($this->actor());
        $view = \OC\Files\Filesystem::getView();
        if (!\OC\Files\Filesystem::$loaded || $view === null
            || \OC\Files\Filesystem::getRoot() !== $folder->getPath()
            || !$file->getStorage()->instanceOfStorage('\\OCP\\Files\\Storage\\ILockingStorage')) { throw new \RuntimeException('MAP_CAS_CONTEXT'); }
        $path = $view->getRelativePath($file->getPath());
        if (!is_string($path) || $path === '' || $path[0] !== '/') { throw new \RuntimeException('MAP_CAS_PATH'); }
        MapWriteGuard::run($path, function () use ($file, $etag, $project, $before): void {
            [$fresh] = $this->file($project, true);
            if ($fresh->getId() !== $project['fileId'] || $fresh->getPath() !== $file->getPath()
                || $fresh->getEtag() !== $etag || $fresh->getContent() !== $before) { throw new \RuntimeException('MAP_CHANGED'); }
        }, static function () use ($file, $text): void { $file->putContent($text); });
        [$fresh] = $this->file($project, false);
        if ($fresh->getId() !== $project['fileId'] || $fresh->getContent() !== $text) { throw new \RuntimeException('MAP_READBACK'); }
    }
    private function attach(int $boardId, int $cardId): array {
        $p = $this->mapping($boardId); $this->permission($boardId, true);
        if ((int)Server::get(CardMapper::class)->findBoardId($cardId) !== $boardId || $cardId <= $p['afterCardId']) { throw new \RuntimeException('OUTSIDE_PILOT'); }
        [$file, $path] = $this->file($p, true);
        $cards = Server::get(CardService::class); $before = $cards->find($cardId);
        if ($before->getDeletedAt() || $before->getArchived()) { throw new \RuntimeException('CARD_INACTIVE'); }
        // Serialize our two-store workflow under a separate app key. Native file
        // locking remains owned by getContent/putContent; an outer file lock self-deadlocks.
        $locks = Server::get(ILockingProvider::class); $lockKey = 'novaspace_capsules/map/' . $p['fileId'];
        try { $locks->acquireLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE); }
        catch (\OCP\Lock\LockedException) { throw new \RuntimeException('PROJECT_BUSY'); }
        try {
            $etag = $file->getEtag(); $source = $file->getContent(); $map = CapsuleCore::parse($source);
            $out = CapsuleCore::prepare($map, ['boardId' => $boardId, 'cardId' => $cardId,
                'title' => $before->getTitle(), 'description' => $before->getDescription() ?? '', 'done' => $before->getDone()],
                $p, $path, rtrim($this->urls->getAbsoluteURL('/'), '/'));
            if (!$out['changed']) { $this->pending($boardId, $cardId, false); return ['state' => $out['state'], 'cardId' => $cardId, 'unchanged' => true]; }
            if (!$this->same($before, $cards->find($cardId))) { throw new \RuntimeException('CARD_CHANGED'); }
            $pendingText = $out['writePending'] ? CapsuleCore::encode($out['map']) : $source;
            if ($out['writePending']) { $this->save($file, $etag, $p, $source, $pendingText); }
            $this->pending($boardId, $cardId, true);
            // Only description/title are changed; native service checks permissions again.
            if (!$this->same($before, $cards->find($cardId))) { throw new \RuntimeException('CARD_CHANGED'); }
            $cards->update(...DeckCardUpdate::arguments($before, $out['title'], $out['description']));
            $fresh = $cards->find($cardId);
            if ($fresh->getTitle() !== $out['title'] || $fresh->getDescription() !== $out['description']
                || !DeckCardUpdate::preserved($before, $fresh)) { throw new \RuntimeException('CARD_READBACK'); }
            $latest = $file->getContent();
            if ($latest !== $pendingText) { throw new \RuntimeException('MAP_CHANGED_AFTER_CARD'); }
            $complete = CapsuleCore::encode(CapsuleCore::complete(CapsuleCore::parse($latest), $out['nodeId']));
            $this->save($file, $file->getEtag(), $p, $pendingText, $complete); $this->pending($boardId, $cardId, false);
            return ['state' => 'linked', 'cardId' => $cardId, 'nodeId' => $out['nodeId'], 'title' => $out['title'], 'description' => $out['description']];
        } finally { $locks->releaseLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE); }
    }
}
