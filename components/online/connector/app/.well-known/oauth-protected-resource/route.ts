// SPDX-License-Identifier: AGPL-3.0-or-later
import { ALL_SCOPES, canonicalResource, json, oauthOrigin } from "../../../lib/oauth";

export const runtime = "edge";

export async function GET() {
  return json({
    resource: canonicalResource(),
    authorization_servers: [oauthOrigin()],
    scopes_supported: [...ALL_SCOPES],
    resource_documentation: oauthOrigin(),
  });
}
