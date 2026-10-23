// SPDX-License-Identifier: AGPL-3.0-or-later
export type DeckRuntimeConfig = {
  baseUrl: string;
  login: string;
  password: string;
  oauthSigningSecret?: string;
  allowedEmail?: string;
  publicOrigin?: string;
  platformAssertionJwk?: string;
};

let runtimeConfig: DeckRuntimeConfig | null = null;

export function setDeckRuntimeConfig(input: {
  NEXTCLOUD_BASE_URL?: string;
  NEXTCLOUD_LOGIN_NAME?: string;
  NEXTCLOUD_APP_PASSWORD?: string;
  OAUTH_SIGNING_SECRET?: string;
  CONNECTOR_ALLOWED_EMAIL?: string;
  CONNECTOR_PUBLIC_ORIGIN?: string;
  NOVASPACE_ASSERTION_JWK?: string;
}) {
  const baseUrl = input.NEXTCLOUD_BASE_URL;
  const login = input.NEXTCLOUD_LOGIN_NAME;
  const password = input.NEXTCLOUD_APP_PASSWORD;
  runtimeConfig = baseUrl && login && password ? {
    baseUrl,
    login,
    password,
    oauthSigningSecret: input.OAUTH_SIGNING_SECRET,
    allowedEmail: input.CONNECTOR_ALLOWED_EMAIL,
    publicOrigin: input.CONNECTOR_PUBLIC_ORIGIN,
    platformAssertionJwk: input.NOVASPACE_ASSERTION_JWK,
  } : null;
}

export function getDeckRuntimeConfig(): DeckRuntimeConfig | null {
  return runtimeConfig;
}
