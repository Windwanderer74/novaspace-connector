// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  canonicalResource,
  createAccessToken,
  json,
  pkceS256,
  verifyAuthorizationCode,
  verifyClientId,
} from "../../../lib/oauth";

export const runtime = "edge";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return json({ error: "invalid_request", error_description: "Form-encoded token request required." }, 400);
  }
  const form = new URLSearchParams(await request.text());
  if (form.get("grant_type") !== "authorization_code") {
    return json({ error: "unsupported_grant_type" }, 400);
  }

  try {
    const clientId = form.get("client_id") ?? "";
    const code = await verifyAuthorizationCode(form.get("code") ?? "");
    const client = await verifyClientId(clientId);
    const redirectUri = form.get("redirect_uri") ?? "";
    const resource = form.get("resource") ?? "";
    const verifier = form.get("code_verifier") ?? "";

    if (code.clientId !== clientId || code.redirectUri !== redirectUri || !client.redirectUris.includes(redirectUri)) {
      throw new Error("Client or redirect mismatch.");
    }
    if (resource !== canonicalResource() || code.resource !== resource) throw new Error("Resource mismatch.");
    if (verifier.length < 43 || verifier.length > 128 || await pkceS256(verifier) !== code.codeChallenge) {
      throw new Error("PKCE verification failed.");
    }

    const accessToken = await createAccessToken({
      sub: code.email,
      aud: code.resource,
      scope: code.scope,
      clientId,
    });
    return json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 30 * 24 * 60 * 60,
      scope: code.scope,
    });
  } catch (error) {
    return json({ error: "invalid_grant", error_description: error instanceof Error ? error.message : "Token exchange failed." }, 400);
  }
}
