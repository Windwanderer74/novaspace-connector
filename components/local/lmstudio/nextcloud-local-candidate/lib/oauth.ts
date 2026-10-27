// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDeckRuntimeConfig } from "./runtime-config";

export const READ_SCOPE = "deck:read";
export const WRITE_SCOPE = "deck:write";
export const DECK_SHARE_SCOPE = "deck:share";
export const DECK_TRASH_SCOPE = "deck:trash";
export const CALENDAR_READ_SCOPE = "calendar:read";
export const CALENDAR_WRITE_SCOPE = "calendar:write";
export const CALENDAR_SCHEDULE_SCOPE = "calendar:schedule";
export const FILES_READ_SCOPE = "files:read";
export const FILES_WRITE_SCOPE = "files:write";
export const FILES_SHARE_SCOPE = "files:share";
export const FILES_TRASH_SCOPE = "files:trash";
export const FILES_ORGANIZE_SCOPE = "files:organize";
export const FILES_PDF_SCOPE = "files:pdfread";
export const FILES_DOWNLOAD_SCOPE = "files:download";
export const NEXTCLOUD_READ_SCOPE = "nextcloud:read";
export const TALK_READ_SCOPE = "talk:read";
export const MAIL_READ_SCOPE = "mail:read";
export const ANNOUNCEMENTS_READ_SCOPE = "announcements:read";
export const TABLES_READ_SCOPE = "tables:read";
export const TABLES_WRITE_SCOPE = "tables:write";
export const INVENTORY_READ_SCOPE = "inventory:read";
export const INVENTORY_WRITE_SCOPE = "inventory:write";
export const NOTES_READ_SCOPE = "notes:read";
export const NOTES_WRITE_SCOPE = "notes:write";
export const TASKS_READ_SCOPE = "tasks:read";
export const TASKS_WRITE_SCOPE = "tasks:write";
export const CONTACTS_READ_SCOPE = "contacts:read";
export const CONTACTS_WRITE_SCOPE = "contacts:write";
export const CONTACTS_SHARE_SCOPE = "contacts:share";
export const CONTACTS_MANAGE_SCOPE = "contacts:manage";
export const GITHUB_READ_SCOPE = "github:read";
export const GITHUB_WRITE_SCOPE = "github:write";
export const ALL_SCOPES = [GITHUB_READ_SCOPE, GITHUB_WRITE_SCOPE, DECK_SHARE_SCOPE, DECK_TRASH_SCOPE, CALENDAR_SCHEDULE_SCOPE,TASKS_READ_SCOPE, TASKS_WRITE_SCOPE, CONTACTS_READ_SCOPE, CONTACTS_WRITE_SCOPE, CONTACTS_SHARE_SCOPE, CONTACTS_MANAGE_SCOPE, NOTES_READ_SCOPE, NOTES_WRITE_SCOPE, READ_SCOPE, WRITE_SCOPE, CALENDAR_READ_SCOPE, FILES_READ_SCOPE, CALENDAR_WRITE_SCOPE, FILES_WRITE_SCOPE, NEXTCLOUD_READ_SCOPE, TALK_READ_SCOPE, MAIL_READ_SCOPE, ANNOUNCEMENTS_READ_SCOPE, FILES_ORGANIZE_SCOPE, FILES_PDF_SCOPE, FILES_DOWNLOAD_SCOPE, FILES_SHARE_SCOPE, FILES_TRASH_SCOPE, TABLES_READ_SCOPE, TABLES_WRITE_SCOPE, INVENTORY_READ_SCOPE, INVENTORY_WRITE_SCOPE] as const;


type SignedPayload = {
  type: "client" | "code" | "access" | "download" | "upload";
  exp: number;
  iat?: number;
  [key: string]: unknown;
};

type ClientPayload = SignedPayload & {
  type: "client";
  redirectUris: string[];
};

type CodePayload = SignedPayload & {
  type: "code";
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  email: string;
};

export type AccessPayload = SignedPayload & {
  type: "access";
  sub: string;
  aud: string;
  scope: string;
  clientId: string;
};

function oauthConfig() {
  const runtime = getDeckRuntimeConfig();
  const secret = runtime?.oauthSigningSecret ?? process.env.OAUTH_SIGNING_SECRET;
  const allowedEmail = runtime?.allowedEmail ?? process.env.CONNECTOR_ALLOWED_EMAIL;
  const publicOrigin = (runtime?.publicOrigin ?? process.env.CONNECTOR_PUBLIC_ORIGIN)?.replace(/\/$/, "");
  if (!secret || secret.length < 32 || !allowedEmail || !publicOrigin) {
    throw new Error("OAuth-Konfiguration ist serverseitig nicht vollständig eingerichtet.");
  }
  const url = new URL(publicOrigin);
  if (url.protocol !== "https:") throw new Error("CONNECTOR_PUBLIC_ORIGIN muss HTTPS verwenden.");
  return { secret, allowedEmail: allowedEmail.toLocaleLowerCase("de"), origin: url.origin };
}

export function oauthOrigin() {
  return oauthConfig().origin;
}

export function canonicalResource() {
  return `${oauthOrigin()}/deck-mcp`;
}

export function allowedUserEmail() {
  return oauthConfig().allowedEmail;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(oauthConfig().secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signPayload(payload: SignedPayload) {
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(encoded));
  return `${encoded}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyPayload<T extends SignedPayload>(token: string, type: T["type"]): Promise<T> {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw new Error("Ungültiges Tokenformat.");
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    decodeBase64Url(signature),
    new TextEncoder().encode(encoded),
  );
  if (!valid) throw new Error("Ungültige Tokensignatur.");
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) as T;
  if (payload.type !== type || !Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token ist ungültig oder abgelaufen.");
  }
  return payload;
}

export function validRedirectUri(uri: string) {
  if (uri === "https://chatgpt.com/connector_platform_oauth_redirect") return true;
  return /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(uri);
}

export async function createClientId(redirectUris: string[]) {
  const payload: ClientPayload = {
    type: "client",
    jti: crypto.randomUUID(),
    redirectUris,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  };
  return signPayload(payload);
}

export async function verifyClientId(clientId: string) {
  return verifyPayload<ClientPayload>(clientId, "client");
}

export async function createAuthorizationCode(input: Omit<CodePayload, "type" | "iat" | "exp">) {
  return signPayload({
    ...input,
    type: "code",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 5 * 60,
  });
}

export async function verifyAuthorizationCode(code: string) {
  return verifyPayload<CodePayload>(code, "code");
}

export async function createAccessToken(input: Omit<AccessPayload, "type" | "iat" | "exp">) {
  return signPayload({
    ...input,
    type: "access",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  });
}

export async function verifyAccessToken(token: string) {
  const payload = await verifyPayload<AccessPayload>(token, "access");
  if (payload.aud !== canonicalResource()) throw new Error("Token gilt nicht für diesen MCP-Endpunkt.");
  if (payload.sub.toLocaleLowerCase("de") !== allowedUserEmail()) throw new Error("Token gehört nicht zum freigegebenen Konto.");
  return payload;
}

export async function pkceS256(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(digest));
}

export function normalizeScope(value: string | null) {
  // Existing registrations without a scope must not acquire new write rights.
  const requested = new Set((value ?? [READ_SCOPE, WRITE_SCOPE, CALENDAR_READ_SCOPE, FILES_READ_SCOPE].join(" ")).split(/\s+/).filter(Boolean));
  for (const scope of requested) {
    if (!ALL_SCOPES.includes(scope as (typeof ALL_SCOPES)[number])) throw new Error(`Unbekannter Scope: ${scope}`);
  }
  return ALL_SCOPES.filter((scope) => requested.has(scope)).join(" ");
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
