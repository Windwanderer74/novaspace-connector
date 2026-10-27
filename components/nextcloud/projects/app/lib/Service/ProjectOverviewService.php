<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspaceCapsules\Service;

use OCA\Deck\Db\Board;
use OCA\Deck\Service\BoardService;
use OCP\IURLGenerator;
use OCP\IUserSession;
use OCP\Server;

/** Read only confirmed project pairs already visible to the current user. */
final class ProjectOverviewService {
    public function __construct(private IUserSession $session, private CapsuleService $capsules, private IURLGenerator $urls) {}

    public function projects(): array {
        $uid = $this->session->getUser()?->getUID();
        if (!is_string($uid) || $uid === '') { throw new \RuntimeException('LOGIN_REQUIRED'); }
        $rows = [];
        // Native Deck selection includes personal, group and circle shares.
        // Never enumerate another user's home or a global list of project IDs.
        foreach (Server::get(BoardService::class)->getUserBoards(null, false) as $board) {
            if (!$board instanceof Board || $board->getDeletedAt() || $board->getArchived()) { continue; }
            $id = $board->getId(); $owner = $board->getOwner(); $title = $board->getTitle();
            if (!is_int($id) || $id < 1 || isset($rows[$id]) || !is_string($owner) || $owner === ''
                || !is_string($title) || trim($title) === '') { continue; }
            try {
                // Reuse the existing board permission, readable .km identity and
                // exact root proof. A board share alone does not grant map access.
                $project = $this->capsules->project($id);
            } catch (\Throwable) { continue; }
            if (($project['state'] ?? null) !== 'connected' || ($project['boardId'] ?? null) !== $id
                || !is_int($project['fileId'] ?? null) || $project['fileId'] < 1) { continue; }
            $rows[$id] = ['id'=>$id, 'title'=>$title, 'kind'=>$owner === $uid ? 'mine' : 'shared',
                'modified'=>(int)$board->getLastModified(),
                'boardUrl'=>$this->urls->getAbsoluteURL('/index.php/apps/deck/#/board/' . $id),
                'mindmapUrl'=>$this->urls->getAbsoluteURL('/index.php/f/' . $project['fileId'])];
        }
        $rows = array_values($rows);
        usort($rows, static fn(array $a, array $b): int => ($b['modified'] <=> $a['modified'])
            ?: strnatcasecmp($a['title'], $b['title']) ?: ($a['id'] <=> $b['id']));
        return $rows;
    }
}
