<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/Service/GatewayVerifier.php';
use OCA\NovaspacePlatform\Service\GatewayVerifier;
use OCA\NovaspacePlatform\Service\PlatformDenied;
$key = isset($argv[1]) ? openssl_pkey_get_private(file_get_contents($argv[1])) : openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
if ($key === false) { throw new RuntimeException('Test RSA unavailable'); }
$trust = ['kid' => str_repeat('a', 64), 'issuer' => 'https://connector.test', 'audienceBase' => 'https://native.test/ocs/v2.php/apps/novaspace_platform/api/v1/registry', 'publicKey' => openssl_pkey_get_details($key)['key']];
$verifier = new GatewayVerifier($trust);
$bodyHash = hash('sha256', '{"command":{"operation":"status"}}');
$enc = fn(string $v): string => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
$make = function (array $patch = []) use ($enc, $key, $trust, $bodyHash): string {
    $h = ['alg' => 'RS256', 'kid' => $trust['kid'], 'typ' => 'novaspace-client+jwt'];
    $c = array_replace(['iss' => $trust['issuer'], 'aud' => $trust['audienceBase'] . '/github', 'sub' => str_repeat('b', 64), 'client' => str_repeat('c', 64),
        'scope' => ['github:read'], 'purpose' => 'github', 'iat' => time(), 'exp' => time() + 30, 'nonce' => '11111111-1111-4111-8111-111111111111', 'bodyHash' => $bodyHash], $patch);
    $data = $enc(json_encode($h, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) . '.' . $enc(json_encode($c, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    openssl_sign($data, $sig, $key, OPENSSL_ALGO_SHA256);
    return $data . '.' . $enc($sig);
};
if ($verifier->verify($make(), 'github', null, $bodyHash)['purpose'] !== 'github') { throw new RuntimeException('Valid proof rejected'); }
$count = 1;
foreach ([['bodyHash' => str_repeat('0', 64)], ['aud' => 'https://other.test/github'], ['purpose' => 'inventory'], ['exp' => time() - 1], ['client' => 'unbound']] as $patch) {
    try { $verifier->verify($make($patch), 'github', null, $bodyHash); throw new RuntimeException('Invalid proof accepted'); }
    catch (PlatformDenied) { ++$count; }
}
try { $verifier->verify($make(), 'status', null, $bodyHash); throw new RuntimeException('Cross-purpose proof accepted'); } catch (PlatformDenied) { ++$count; }
echo "GitHub bridge native signatures: $count checks passed\n";
