// SPDX-License-Identifier: AGPL-3.0-or-later
import { createClientId, json, validRedirectUri } from "../../../lib/oauth";

export const runtime = "edge";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Request body must be JSON." }, 400);
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((value): value is string => typeof value === "string")
    : [];
  if (!redirectUris.length || redirectUris.some((uri) => !validRedirectUri(uri))) {
    return json({ error: "invalid_redirect_uri", error_description: "Only ChatGPT connector redirect URIs are accepted." }, 400);
  }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    return json({ error: "invalid_client_metadata", error_description: "Only public PKCE clients are accepted." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const clientId = await createClientId([...new Set(redirectUris)]);
  return json({
    client_id: clientId,
    client_id_issued_at: now,
    client_id_expires_at: now + 365 * 24 * 60 * 60,
    redirect_uris: [...new Set(redirectUris)],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  }, 201);
}
