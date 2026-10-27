<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
return ['routes' => [
    ['name' => 'overview#index', 'url' => '/projects/overview', 'verb' => 'GET'],
    ['name' => 'creation#folders', 'url' => '/project-folders', 'verb' => 'GET'],
    ['name' => 'creation#create', 'url' => '/projects', 'verb' => 'POST'],
    ['name' => 'creation#status', 'url' => '/creations/{creationId}', 'verb' => 'GET', 'requirements' => ['creationId' => '[a-f0-9]{32}']],
    ['name' => 'project#show', 'url' => '/boards/{boardId}', 'verb' => 'GET', 'requirements' => ['boardId' => '\\d+']],
    ['name' => 'project#resume', 'url' => '/boards/{boardId}/cards/{cardId}/resume', 'verb' => 'POST', 'requirements' => ['boardId' => '\\d+', 'cardId' => '\\d+']],
    ['name' => 'project#apiResume', 'url' => '/api/boards/{boardId}/cards/{cardId}/resume', 'verb' => 'POST', 'requirements' => ['boardId' => '\\d+', 'cardId' => '\\d+']],
]];
