<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCP {
	interface IRequest { public function getParams(); }
}
namespace OCP\AppFramework\Http {
	class DataResponse {
		public function __construct(public array $data, public int $status = 200, public array $headers = []) {}
	}
}
namespace OCP\AppFramework {
	class OCSController {
		public function __construct(string $appName, protected \OCP\IRequest $request) {}
	}
}
namespace {
	require __DIR__ . '/platform-native-access.php';
	require __DIR__ . '/../app/lib/Controller/ContextController.php';
	class TestRequest implements \OCP\IRequest {
		public function __construct(public array $params = []) {}
		public function getParams() { return $this->params; }
	}
	function controller(object $f, array $params = []): object {
		return new \OCA\NovaspacePlatform\Controller\ContextController('novaspace_platform',
			new TestRequest($params), $f->users, $f->session, $f->provider);
	}
	test('Controller discloses own UID without token or logical owner', function ($f) {
		$r = controller($f)->show();
		check($r->status === 200 && $r->data['nativeUid'] === 'Owner' && $r->data['nativeTokenVerified'] === true);
		check($r->data['connectionRegistered'] === false && $r->data['actingForUser'] === null);
		check(!isset($r->data['nativeTokenId']) && !str_contains(json_encode($r->data), 'secret-'));
		check($r->data['writesEnabled'] === false && $r->data['journalActive'] === false);
	});
	test('Controller forbids storage in caches', function ($f) {
		$r = controller($f)->show(); check($r->headers['Cache-Control'] === 'no-store');
	});
	test('Controller rejects account and connection overrides before token read', function ($f) {
		foreach (['uid', 'nativeUid', 'connectionId', 'actingForUser', 'input'] as $key) {
			check(controller($f, [$key => 'Owner'])->show()->status === 400);
		}
		check($f->provider->reads === 0);
	});
	test('Controller accepts only framework route and format parameters', function ($f) {
		check(controller($f, ['format' => 'json', '_route' => 'novaspace_platform.context.show'])->show()->status === 200);
	});
	test('Controller does not invent an unauthenticated identity', function ($f) {
		$f->users->user = null; $r = controller($f)->show();
		check($r->status === 403 && $r->data === ['error' => 'native_access_unverified']);
	});
	test('Controller removes private upstream failure details', function ($f) {
		$f->provider->reject = true; $r = controller($f)->show();
		check($r->status === 403 && !str_contains(json_encode($r->data), 'secret-'));
	});
	test('Native route exposes only GET, no public or administrative bypass', function ($f) {
		$routes = require __DIR__ . '/../app/appinfo/routes.php';
		$contextRoutes = array_values(array_filter($routes['ocs'], fn($r) => $r['name'] === 'context#show'));
		check($contextRoutes === [['name' => 'context#show', 'url' => '/api/v1/context', 'verb' => 'GET']]);
		$m = new \ReflectionMethod(\OCA\NovaspacePlatform\Controller\ContextController::class, 'show');
		$attrs = array_map(fn($a) => $a->getName(), $m->getAttributes());
		check($attrs === ['OCP\\AppFramework\\Http\\Attribute\\NoAdminRequired', 'OCP\\AppFramework\\Http\\Attribute\\NoCSRFRequired']);
	});
	echo "PASS: $tests native resolver/controller tests; no HTTP acceptance.\n";
}
