<?php
// SPDX-License-Identifier: AGPL-3.0-or-later
declare(strict_types=1);
require_once __DIR__ . '/../app/lib/Service/GatewayVerifier.php';
use OCA\NovaspacePlatform\Service\GatewayVerifier;
use OCA\NovaspacePlatform\Service\PlatformDenied;

$routes = require __DIR__ . '/../app/appinfo/routes.php';
$github = array_values(array_filter($routes['ocs'], fn($route) => $route['name'] === 'github_bridge#execute'));
if (count($github) !== 1 || $github[0]['verb'] !== 'POST' || $github[0]['url'] !== '/api/v1/registry/github') {
    throw new RuntimeException('Missing or ambiguous GitHub route');
}
$paths = array_column($routes['ocs'], 'url');
if (count($paths) !== count(array_unique($paths))) { throw new RuntimeException('Duplicate OCS route'); }
$trust = json_decode(file_get_contents(__DIR__ . '/../app/appinfo/trusted-gateway.json'), true, 32, JSON_THROW_ON_ERROR);
if ($trust['publicKey'] !== '' || $trust['kid'] !== 'UNCONFIGURED') { throw new RuntimeException('Publication must not contain active gateway trust'); }
$encode = fn(string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
$header = ['alg' => 'RS256', 'kid' => $trust['kid'], 'typ' => 'novaspace-client+jwt'];
$claims = ['iss' => $trust['issuer'], 'aud' => $trust['audienceBase'] . '/status', 'sub' => str_repeat('b', 64),
    'client' => str_repeat('c', 64), 'scope' => ['nextcloud:read'], 'purpose' => 'status',
    'iat' => time(), 'exp' => time() + 30, 'nonce' => '11111111-1111-4111-8111-111111111111'];
$assertion = $encode(json_encode($header, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) . '.'
    . $encode(json_encode($claims, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) . '.' . $encode('untrusted-signature');
$denied = false;
set_error_handler(static function (int $severity, string $message): never { throw new ErrorException('Invalid test signature or inactive test trust'); });
try { (new GatewayVerifier())->verify($assertion, 'status'); }
catch (PlatformDenied $error) { $denied = $error->getMessage() === 'assertion_invalid'; }
finally { restore_error_handler(); }
if (!$denied) { throw new RuntimeException('Inactive publication configuration accepted a proof'); }
echo "PASS: 4 publication route/configuration boundary checks.\n";
