<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
/** @var array $_ */
?>
<div id="ns-project-office-page">
    <nav id="app-navigation-vue" class="ns-project-office-navigation" aria-label="Office">
        <ul class="app-navigation__list">
            <?php foreach ($_['categories'] as $category): ?>
                <li class="app-navigation-entry-wrapper">
                    <div class="app-navigation-entry">
                        <a class="app-navigation-entry-link" href="<?php p($category['href']); ?>">
                            <span class="app-navigation-entry-icon" aria-hidden="true">
                                <?php if ($category['icon'] !== ''): ?><img src="<?php p($category['icon']); ?>" alt="" width="20" height="20"><?php endif; ?>
                            </span>
                            <span class="app-navigation-entry__name"><?php p($category['label']); ?></span>
                        </a>
                    </div>
                </li>
            <?php endforeach; ?>
            <li id="ns-project-office-nav" class="app-navigation-entry-wrapper">
                <div class="app-navigation-entry active">
                    <a class="app-navigation-entry-link" href="<?php p($_['projectUrl']); ?>" aria-current="page">
                        <span class="app-navigation-entry-icon" aria-hidden="true"><img src="<?php p($_['projectIcon']); ?>" alt="" width="20" height="20"></span>
                        <span class="app-navigation-entry__name">Projekt</span>
                    </a>
                </div>
            </li>
        </ul>
    </nav>
    <main id="app-content-vue" class="ns-project-office-content" aria-labelledby="ns-project-page-heading">
        <h1 id="ns-project-page-heading">Projekte</h1>
        <section class="ns-project-create-section" aria-label="Projekt erstellen">
            <ul class="ns-project-choices">
                <li id="ns-project-office-choice" class="ns-project-template-item">
                    <button type="button" class="ns-project-template" title="Mindmap und Deck-Board gemeinsam erstellen">
                        <span class="ns-project-template-preview"><img src="<?php p($_['projectIcon']); ?>" alt="" width="56" height="56"></span>
                        <span class="ns-project-template-name">Projekt erstellen</span>
                        <span class="ns-project-template-hint">Mindmap + Kanban</span>
                    </button>
                </li>
            </ul>
        </section>
        <section id="ns-project-list" class="ns-project-list" aria-labelledby="ns-project-list-heading">
            <h2 id="ns-project-list-heading">Deine Projekte</h2>
            <?php if ($_['projectsError']): ?>
                <p role="status">Die Projektübersicht konnte gerade nicht geladen werden. Bitte lade die Seite später erneut.</p>
            <?php else: ?>
                <div class="ns-project-filters" role="group" aria-label="Projekte filtern">
                    <button type="button" class="ns-project-filter" data-project-filter="all" aria-pressed="false">Alle</button>
                    <button type="button" class="ns-project-filter is-active" data-project-filter="mine" aria-pressed="true">Meine</button>
                    <button type="button" class="ns-project-filter" data-project-filter="shared" aria-pressed="false">Mit mir geteilt</button>
                </div>
                <ul class="ns-project-rows">
                    <?php foreach ($_['projects'] as $project): ?>
                        <li class="ns-project-row" data-project-kind="<?php p($project['kind']); ?>"<?php if ($project['kind'] !== 'mine'): ?> hidden<?php endif; ?>>
                            <img src="<?php p($_['projectIcon']); ?>" alt="" width="24" height="24">
                            <div class="ns-project-row-name">
                                <a href="<?php p($project['boardUrl']); ?>"><?php p($project['title']); ?></a>
                                <span><?php p($project['kind'] === 'mine' ? 'Eigenes Projekt' : 'Mit mir geteilt'); ?></span>
                            </div>
                            <a class="ns-project-map-link" href="<?php p($project['mindmapUrl']); ?>">Mindmap öffnen</a>
                        </li>
                    <?php endforeach; ?>
                </ul>
                <p id="ns-project-list-empty" class="ns-project-list-empty" role="status"<?php if (array_filter($_['projects'], static fn(array $p): bool => $p['kind'] === 'mine') !== []): ?> hidden<?php endif; ?>>Noch keine eigenen Projekte.</p>
            <?php endif; ?>
        </section>
    </main>
</div>
