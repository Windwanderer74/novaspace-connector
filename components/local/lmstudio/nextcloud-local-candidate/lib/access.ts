// SPDX-License-Identifier: AGPL-3.0-or-later
import { oauthOrigin } from "./oauth";
import { scopePolicyDenial } from './connection-policy';

/** Advertise each tool's OAuth requirement, including the compatibility mirror. */
export function scopeMetadata(scope: string, ...additionalScopes: string[]) {
  const securitySchemes = [{ type: "oauth2" as const, scopes: [scope, ...additionalScopes] }];
  return { securitySchemes, _meta: { securitySchemes } };
}

/** Return an actionable OAuth challenge; never expand the token's permissions. */
export function requireScope(context: { http?: { authInfo?: { scopes?: string[] } } }, scope: string) {
  const policyError = scopePolicyDenial(scope);
  if (policyError) return policyError;
  if (!context.http?.authInfo?.scopes?.includes(scope)) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Berechtigung ${scope} fehlt. Bitte den angeforderten Zugriff bei der Anmeldung erlauben.` }],
      _meta: {
        "mcp/www_authenticate": [
          `Bearer resource_metadata="${oauthOrigin()}/.well-known/oauth-protected-resource/deck-mcp", error="insufficient_scope", error_description="Additional permission required", scope="${scope}"`,
        ],
      },
    };
  }
}
