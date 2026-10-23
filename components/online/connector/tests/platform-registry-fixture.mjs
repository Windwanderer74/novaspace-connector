// SPDX-License-Identifier: AGPL-3.0-or-later
// Ephemeral test-only signing key. Never reads or writes production credentials.
import { generateKeyPairSync, createHash } from 'node:crypto';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const publicKey = keys.publicKey;
export const jwk = { ...keys.privateKey.export({ format: 'jwk' }), alg: 'RS256', kid: 'b'.repeat(64) };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const testPrincipal = Object.freeze({ subjectHash: hash('owner@example.test'), clientHash: hash('test-signed-client'), scopes: Object.freeze(['files:read','files:write','files:download']) });
export const registryConfig = { NOVASPACE_ASSERTION_JWK: JSON.stringify(jwk) };
export function registryResponse(reason = 'not_registered') {
  const active = reason === 'active';
  return Response.json({ ocs: { meta: { status:'ok', statuscode:200 }, data: {
    registryVersion:'0.2.0', nativeUid:'ChatGPT', ownerDelegationEnabled:false, journalScope:'connection_configuration',
    connection: reason === 'not_registered' ? {registered:false,active:false,reason} : {registered:true,active,reason,connection:{connectionId:'12345678-1234-4123-a123-123456789012',ownerUid:'Soul',nativeUid:'ChatGPT',label:'Test connection',channel:'cloud_connector',revision:1}},
  } } });
}
