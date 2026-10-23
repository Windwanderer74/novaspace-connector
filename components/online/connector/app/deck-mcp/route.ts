// SPDX-License-Identifier: AGPL-3.0-or-later
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createDeckMcpServer } from "../../lib/mcp";
import { ALL_SCOPES, canonicalResource, oauthOrigin, verifyAccessToken } from "../../lib/oauth";
import { principalFromAccessToken, requireConnection, withGatewayPrincipal } from '../../lib/platform-registry';

export const runtime = "edge";

const handler = createMcpHandler(() => createDeckMcpServer(), {
  legacy: "stateless",
  responseMode: "auto",
});

function unauthorized() {
  const metadata = `${oauthOrigin()}/.well-known/oauth-protected-resource/deck-mcp`;
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="${ALL_SCOPES.join(" ")}"`,
    },
  });
}

async function authenticated(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return unauthorized();
  const token = authorization.slice(7);
  let access: Awaited<ReturnType<typeof verifyAccessToken>>;
  let principal: Awaited<ReturnType<typeof principalFromAccessToken>>;
  try {
    access = await verifyAccessToken(token);
    principal = await principalFromAccessToken(token);
  } catch { return unauthorized(); }
  try {
    let permitted = false;
    try { await requireConnection(principal); permitted = true; } catch {}
    if (!permitted) {
      // Only static handshake and bounded setup metadata remain usable after revocation/failure.
      if (request.method !== 'POST') return new Response('Verbindungsprüfung erforderlich.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
      const reader = request.body?.getReader(); let raw = '', bytes = 0;
      if (!reader) return Response.json({ error: 'invalid_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
      const decoder = new TextDecoder();
      let rpc: unknown;
      try { while (true) { const r = await reader.read(); if (r.done) break; bytes += r.value.byteLength; if (bytes > 16384) throw new Error(); raw += decoder.decode(r.value, { stream: true }); } raw += decoder.decode(); rpc = JSON.parse(raw); }
      catch { return Response.json({ error: 'invalid_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
      finally { await reader.cancel(); reader.releaseLock(); }
      const envelope = rpc !== null && typeof rpc === 'object' && !Array.isArray(rpc) ? rpc as { method?: unknown; params?: { name?: unknown } } : null;
      const staticMethod = envelope && typeof envelope.method === 'string' && ['initialize', 'notifications/initialized', 'ping', 'tools/list', 'prompts/list', 'resources/list', 'resources/templates/list'].includes(envelope.method);
      const setupMethod = envelope && envelope.method === 'tools/call' && envelope.params?.name === 'nextcloud_capabilities';
      if (!staticMethod && !setupMethod) return new Response(JSON.stringify({ error: 'connection_unavailable', message: 'Diese Verbindung ist widerrufen oder nicht bestätigt. Funktionsstand für Einrichtung abrufen.' }), { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      // Workerd must not construct from an already consumed incoming Request.
      const headers = new Headers(request.headers); headers.delete('content-length');
      request = new Request(request.url, { method: request.method, headers, body: raw, redirect: request.redirect, signal: request.signal });
    }
    return await withGatewayPrincipal(principal, () => handler.fetch(request, {
      authInfo: {
        token,
        clientId: access.clientId,
        scopes: access.scope.split(/\s+/).filter(Boolean),
        expiresAt: access.exp,
        resource: new URL(canonicalResource()),
        extra: { email: access.sub },
      },
    }));
  } catch {
    // Valid OAuth with a processing failure must not start an OAuth sign-in loop.
    return Response.json({ error: 'connection_processing_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const POST = authenticated;
export const GET = authenticated;
export const DELETE = authenticated;
