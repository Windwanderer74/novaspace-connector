<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);

// Public token interfaces are unmodified fixtures from Nextcloud v34.0.4.
// User/session boundary doubles; this is not a running Nextcloud HTTP server.
namespace OCP {
	interface IUserSession {
		public function getUser();
		public function getImpersonatingUserID(): ?string;
	}
	interface ISession {
		public function get($key);
		public function getId();
	}
}

namespace {
	use NovaSpace\Platform\NativeAccessResolver;
	use NovaSpace\Platform\NativeAccessUnverified;
	use OCP\Authentication\Token\IToken;
	require __DIR__ . '/fixtures/platform-native/IToken.php';
	require __DIR__ . '/fixtures/platform-native/IProvider.php';
	require __DIR__ . '/../app/lib/Native/NativeAccessResolver.php';
	ini_set('zend.exception_ignore_args', '1');

	class TestUser {
		public string $uid = 'Owner';
		public bool $enabled = true;
		public function getUID(): string { return $this->uid; }
		public function isEnabled(): bool { return $this->enabled; }
	}
	class TestUsers implements \OCP\IUserSession {
		public ?TestUser $user;
		public ?string $impersonator = null;
		public function __construct() { $this->user = new TestUser(); }
		public function getUser() { return $this->user; }
		public function getImpersonatingUserID(): ?string { return $this->impersonator; }
	}
	class TestSession implements \OCP\ISession {
		public mixed $app = null;
		public string $id = 'secret-browser-session';
		public bool $unavailable = false;
		public function get($key) { return $key === 'app_password' ? $this->app : null; }
		public function getId() {
			if ($this->unavailable) { throw new \RuntimeException('private session detail'); }
			return $this->id;
		}
	}
	class TestToken implements IToken {
		public string $uid = 'Owner';
		public int $id = 42;
		public int $type = IToken::TEMPORARY_TOKEN;
		public function getId(): int { return $this->id; }
		public function getUID(): string { return $this->uid; }
		public function getType(): int { return $this->type; }
		public function getLoginName(): string { throw new \LogicException('Not needed'); }
		public function getPassword(): ?string { throw new \LogicException('Never read password'); }
		public function getLastCheck(): int { throw new \LogicException('Not needed'); }
		public function setLastCheck(int $time): void { throw new \LogicException('Never mutate'); }
		public function getScope(): string { throw new \LogicException('Not operation authority'); }
		public function getScopeAsArray(): array { throw new \LogicException('Not operation authority'); }
		public function setScope(array $scope): void { throw new \LogicException('Never mutate'); }
		public function getName(): string { throw new \LogicException('Name is not identity'); }
		public function getRemember(): int { throw new \LogicException('Not needed'); }
		public function setToken(string $token): void { throw new \LogicException('Never mutate'); }
		public function setPassword(string $password): void { throw new \LogicException('Never mutate'); }
		public function setExpires(?int $expires): void { throw new \LogicException('Never mutate'); }
		public function jsonSerialize(): mixed { throw new \LogicException('Never serialize token'); }
	}
	class TestProvider implements \OCP\Authentication\Token\IProvider {
		public int $reads = 0;
		public bool $reject = false;
		public mixed $hook = null;
		public function __construct(public TestToken $token, public TestSession $session) {}
		public function getToken(string $tokenId): IToken {
			$this->reads++;
			$expected = $this->session->app ?? $this->session->id;
			if ($this->reject || $expected !== $tokenId) {
				throw new \RuntimeException('REJECTED WITH secret-browser-session AND secret-app-token');
			}
			if ($this->hook !== null) { ($this->hook)(); }
			return $this->token;
		}
		public function invalidateTokensOfUser(string $uid, ?string $clientName) {
			throw new \LogicException('Resolver must not revoke or modify tokens');
		}
	}
	function fixture(): object {
		$f = new \stdClass();
		$f->users = new TestUsers(); $f->session = new TestSession(); $f->token = new TestToken();
		$f->provider = new TestProvider($f->token, $f->session);
		$f->resolver = new NativeAccessResolver($f->users, $f->session, $f->provider);
		return $f;
	}
	function check(bool $ok): void { if (!$ok) { throw new \RuntimeException('Assertion failed'); } }
	function denied(object $f): void {
		try { $f->resolver->resolve(); }
		catch (NativeAccessUnverified $e) {
			check($e->getMessage() === 'native_access_unverified' && $e->getPrevious() === null);
			check(!str_contains((string)$e, 'secret-'));
			return;
		}
		throw new \RuntimeException('Unverified context was accepted');
	}
	$tests = 0;
	function test(string $name, callable $run): void {
		global $tests; $run(fixture()); $tests++; echo "OK: $name\n";
	}
	if (defined('NATIVE_FIXTURES_ONLY') && NATIVE_FIXTURES_ONLY === true) { return; }
	test('Browser context binds native UID and temporary token', function ($f) {
		$p = $f->resolver->resolve();
		check($p->nativeUid === 'Owner' && $p->nativeTokenId === 42 && $p->authentication === 'web_session');
	});
	test('App password binds permanent token without guessing cloud or local', function ($f) {
		$f->session->app = 'secret-app-token'; $f->token->type = IToken::PERMANENT_TOKEN;
		$p = $f->resolver->resolve();
		check($p->authentication === 'app_password');
		check(array_keys(get_object_vars($p)) === ['nativeUid', 'nativeTokenId', 'authentication']);
	});
	test('Dedicated NativeActor identity is not relabelled as Owner', function ($f) {
		$f->users->user->uid = $f->token->uid = 'NativeActor';
		check($f->resolver->resolve()->nativeUid === 'NativeActor');
	});
	test('Unauthenticated CLI cannot invent an actor', function ($f) {
		$f->users->user = null; denied($f); check($f->provider->reads === 0);
	});
	test('Disabled account denied before provider lookup', function ($f) {
		$f->users->user->enabled = false; denied($f); check($f->provider->reads === 0);
	});
	test('Empty UID denied', function ($f) { $f->users->user->uid = ''; denied($f); });
	test('Impersonation requires separate supported delegation', function ($f) {
		$f->users->impersonator = 'admin'; denied($f); check($f->provider->reads === 0);
	});
	test('Foreign token UID denied', function ($f) { $f->token->uid = 'OtherOwner'; denied($f); });
	test('Empty app password cannot fall back to browser', function ($f) { $f->session->app = ''; denied($f); });
	test('Malformed app password denied', function ($f) { $f->session->app = ['forged']; denied($f); });
	test('Unavailable native session denied', function ($f) { $f->session->unavailable = true; denied($f); });
	test('Empty native session denied', function ($f) { $f->session->id = ''; denied($f); });
	test('Expired or invalid provider result is sanitized', function ($f) { $f->provider->reject = true; denied($f); });
	test('Browser cannot use a permanent token as session proof', function ($f) {
		$f->token->type = IToken::PERMANENT_TOKEN; denied($f);
	});
	test('App context cannot use a temporary session token', function ($f) {
		$f->session->app = 'secret-app-token'; denied($f);
	});
	test('Wipe token denied', function ($f) { $f->token->type = IToken::WIPE_TOKEN; denied($f); });
	test('One-time token denied', function ($f) {
		$f->session->app = 'secret-app-token'; $f->token->type = IToken::ONETIME_TOKEN; denied($f);
	});
	test('Invalid internal token ID denied', function ($f) { $f->token->id = 0; denied($f); });
	test('Account change during resolution denied', function ($f) {
		$f->provider->hook = function () use ($f) { $f->users->user->uid = 'OtherOwner'; }; denied($f);
	});
	test('Account disable during resolution denied', function ($f) {
		$f->provider->hook = function () use ($f) { $f->users->user->enabled = false; }; denied($f);
	});
	test('Session rotation during resolution denied', function ($f) {
		$f->provider->hook = function () use ($f) { $f->session->id = 'another-secret'; }; denied($f);
	});
	test('Impersonation appearing during resolution denied', function ($f) {
		$f->provider->hook = function () use ($f) { $f->users->impersonator = 'admin'; }; denied($f);
	});
	test('App credential removal cannot silently change channel', function ($f) {
		$f->session->app = 'secret-app-token'; $f->token->type = IToken::PERMANENT_TOKEN;
		$f->provider->hook = function () use ($f) { $f->session->app = null; }; denied($f);
	});
	test('Revoked credential checked afresh on the next request', function ($f) {
		$f->resolver->resolve(); $f->provider->reject = true; denied($f); check($f->provider->reads === 2);
	});
	test('Returned proof is immutable and contains no credential', function ($f) {
		$p = $f->resolver->resolve();
		try { $p->nativeUid = 'OtherOwner'; } catch (\Error) {
			check(!str_contains(json_encode($p, JSON_THROW_ON_ERROR), 'secret-')); return;
		}
		throw new \RuntimeException('Proof was mutable');
	});
	echo "PASS: $tests native access tests; boundary doubles, no HTTP acceptance.\n";
}
