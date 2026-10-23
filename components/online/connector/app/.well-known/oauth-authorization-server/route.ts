// SPDX-License-Identifier: AGPL-3.0-or-later
import { ALL_SCOPES, json, oauthOrigin } from "../../../lib/oauth";

export const runtime = "edge";

export async function GET() {
  const issuer = oauthOrigin();
  return json({
    issuer,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...ALL_SCOPES],
    grant_types_supported: ["authorization_code"],
    response_types_supported: ["code"],
  });
}
