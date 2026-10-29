<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
namespace OCA\NovaspacePlatform\Service;

final class PlatformDenied extends \RuntimeException {}

/** Verifies only the pinned gateway's short-lived correlation proof, not object rights. */
final class GatewayVerifier {
	private array $trust;
	public function __construct(?array $trust = null) {
		$this->trust = $trust ?? json_decode(file_get_contents(__DIR__ . '/../../appinfo/trusted-gateway.json'), true, 32, JSON_THROW_ON_ERROR);
	}
	public function trust(): array { return $this->trust; }
	public static function uuid(string $s): bool {
		return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $s) === 1;
	}
	private static function decode(string $s): string {
		if (!preg_match('/^[A-Za-z0-9_-]+$/D', $s)) { throw new PlatformDenied('assertion_invalid'); }
		$v = base64_decode(strtr($s, '-_', '+/'), true);
		if ($v === false || rtrim(strtr(base64_encode($v), '+/', '-_'), '=') !== $s) {
			throw new PlatformDenied('assertion_invalid');
		}
		return $v;
	}
	public function verify(string $assertion, string $purpose, ?int $now = null, ?string $bodyHash = null): array {
		try {
			$now ??= time();
			if (!in_array($purpose, ['setup', 'status', 'inventory', 'github'], true) || strlen($assertion) > 16384) { throw new PlatformDenied(); }
			$p = explode('.', $assertion);
			if (count($p) !== 3) { throw new PlatformDenied(); }
			$hRaw = self::decode($p[0]); $cRaw = self::decode($p[1]);
			$h = json_decode($hRaw, true, 32, JSON_THROW_ON_ERROR);
			$c = json_decode($cRaw, true, 32, JSON_THROW_ON_ERROR);
			if (!is_array($h) || !is_array($c) || array_is_list($h) || array_is_list($c)
				|| json_encode($h, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) !== $hRaw
				|| json_encode($c, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) !== $cRaw) { throw new PlatformDenied(); }
			$hk = array_keys($h); sort($hk); $ck = array_keys($c); sort($ck);
			$expected = ['aud', 'client', 'exp', 'iat', 'iss', 'nonce', 'purpose', 'scope', 'sub'];
			if (in_array($purpose, ['inventory', 'github'], true)) { $expected[] = 'bodyHash'; sort($expected); }
			if ($hk !== ['alg', 'kid', 'typ'] || $ck !== $expected) { throw new PlatformDenied(); }
			if (in_array($purpose, ['inventory', 'github'], true) && (!is_string($bodyHash) || !preg_match('/^[0-9a-f]{64}$/D', $bodyHash) || ($c['bodyHash'] ?? null) !== $bodyHash)) { throw new PlatformDenied(); }
			if ($h['alg'] !== 'RS256' || $h['typ'] !== 'novaspace-client+jwt' || $h['kid'] !== $this->trust['kid']
				|| $c['iss'] !== $this->trust['issuer'] || $c['aud'] !== $this->trust['audienceBase'] . '/' . $purpose
				|| $c['purpose'] !== $purpose || !is_int($c['iat']) || !is_int($c['exp'])
				|| $c['iat'] > $now + 5 || $c['iat'] < $now - 65 || $c['exp'] < $now
				|| $c['exp'] <= $c['iat'] || $c['exp'] - $c['iat'] > 60
				|| !is_string($c['sub']) || !preg_match('/^[0-9a-f]{64}$/D', $c['sub'])
				|| !is_string($c['client']) || !preg_match('/^[0-9a-f]{64}$/D', $c['client'])
				|| !is_string($c['nonce']) || !self::uuid($c['nonce'])
				|| !is_array($c['scope']) || !array_is_list($c['scope']) || count($c['scope']) > 32
				|| count(array_filter($c['scope'], 'is_string')) !== count($c['scope'])
				|| ($purpose === 'setup' && !in_array('nextcloud:read', $c['scope'], true))) { throw new PlatformDenied(); }
			if (openssl_verify($p[0] . '.' . $p[1], self::decode($p[2]), $this->trust['publicKey'], OPENSSL_ALGO_SHA256) !== 1) {
				throw new PlatformDenied();
			}
			return $c;
		} catch (\Throwable) { throw new PlatformDenied('assertion_invalid'); }
	}
}
