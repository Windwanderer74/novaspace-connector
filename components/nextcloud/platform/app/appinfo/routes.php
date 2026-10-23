<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
return ['routes' => [
	['name' => 'inventory#index', 'url' => '/inventory', 'verb' => 'GET'],
	['name' => 'inventory#grant', 'url' => '/inventory/grants/{connectionId}', 'verb' => 'POST'],
	['name' => 'connections#index', 'url' => '/', 'verb' => 'GET'],
	['name' => 'connections#new', 'url' => '/connections/new', 'verb' => 'GET'],
	['name' => 'connections#approve', 'url' => '/connections/approve', 'verb' => 'POST'],
	['name' => 'connections#revoke', 'url' => '/connections/{connectionId}/revoke', 'verb' => 'POST'],
	['name' => 'connections#saveAccess', 'url' => '/connections/{connectionId}/access', 'verb' => 'POST'],
], 'ocs' => [
	['name' => 'github_bridge#execute', 'url' => '/api/v1/registry/github', 'verb' => 'POST'],
	['name' => 'inventory_api#execute', 'url' => '/api/v1/registry/inventory', 'verb' => 'POST'],
	['name' => 'context#show', 'url' => '/api/v1/context', 'verb' => 'GET'],
	['name' => 'registry#status', 'url' => '/api/v1/registry/status', 'verb' => 'GET'],
	['name' => 'registry#setup', 'url' => '/api/v1/registry/setup', 'verb' => 'GET'],
]];
