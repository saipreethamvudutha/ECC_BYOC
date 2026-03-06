/**
 * OAuth 2.0 OIDC utilities for SSO.
 * Custom implementation — no next-auth dependency.
 *
 * Supports: Google, Azure AD (Entra ID), Okta
 * Security: PKCE (S256), state parameter, encrypted cookie storage
 */

import { randomBytes, createHash } from "crypto";

// ─── Provider URL configurations ─────────────────────────────────

interface ProviderEndpoints {
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
}

const PROVIDER_DEFAULTS: Record<string, ProviderEndpoints> = {
  google: {
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  },
  azure_ad: {
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userinfoUrl: "https://graph.microsoft.com/oidc/userinfo",
  },
  okta: {
    // Okta domains are tenant-specific, set from issuerUrl
    authorizationUrl: "",
    tokenUrl: "",
    userinfoUrl: "",
  },
};

interface SSOProviderConfig {
  id: string;
  providerType: string;
  clientId: string; // Decrypted
  clientSecret: string; // Decrypted
  issuerUrl?: string | null;
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  userinfoUrl?: string | null;
  scopes: string;
}

/**
 * Get the actual endpoint URLs for a provider, using overrides or defaults.
 */
export function getProviderEndpoints(provider: SSOProviderConfig): ProviderEndpoints {
  const defaults = PROVIDER_DEFAULTS[provider.providerType] || PROVIDER_DEFAULTS.google;

  // For Okta, derive URLs from issuerUrl
  if (provider.providerType === "okta" && provider.issuerUrl) {
    const base = provider.issuerUrl.replace(/\/$/, "");
    return {
      authorizationUrl: provider.authorizationUrl || `${base}/v1/authorize`,
      tokenUrl: provider.tokenUrl || `${base}/v1/token`,
      userinfoUrl: provider.userinfoUrl || `${base}/v1/userinfo`,
    };
  }

  return {
    authorizationUrl: provider.authorizationUrl || defaults.authorizationUrl,
    tokenUrl: provider.tokenUrl || defaults.tokenUrl,
    userinfoUrl: provider.userinfoUrl || defaults.userinfoUrl,
  };
}

// ─── PKCE (Proof Key for Code Exchange) ──────────────────────────

/**
 * Generate PKCE code_verifier and code_challenge (S256).
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // 43-128 character URL-safe random string
  const codeVerifier = randomBytes(32)
    .toString("base64url")
    .slice(0, 64);

  // S256: SHA-256 hash of the verifier, base64url-encoded
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

/**
 * Generate a random state parameter (anti-CSRF).
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

// ─── Authorization URL Builder ───────────────────────────────────

/**
 * Build the OAuth authorization URL for redirect.
 */
export function buildAuthorizationUrl(
  provider: SSOProviderConfig,
  redirectUri: string,
  state: string,
  codeChallenge: string
): string {
  const endpoints = getProviderEndpoints(provider);

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scopes || "openid profile email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline", // For Google refresh tokens
    prompt: "select_account", // Always show account picker
  });

  return `${endpoints.authorizationUrl}?${params.toString()}`;
}

// ─── Token Exchange ──────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  provider: SSOProviderConfig,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const endpoints = getProviderEndpoints(provider);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code_verifier: codeVerifier,
  });

  const response = await fetch(endpoints.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} — ${error}`);
  }

  return response.json();
}

// ─── User Info Fetch ─────────────────────────────────────────────

export interface OAuthUserInfo {
  sub: string; // Provider's unique user ID
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * Fetch user info from the provider's userinfo endpoint.
 */
export async function fetchUserInfo(
  provider: SSOProviderConfig,
  accessToken: string
): Promise<OAuthUserInfo> {
  const endpoints = getProviderEndpoints(provider);

  const response = await fetch(endpoints.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Userinfo fetch failed: ${response.status} — ${error}`);
  }

  const data = await response.json();

  return {
    sub: data.sub || data.id,
    email: data.email,
    name: data.name || `${data.given_name || ""} ${data.family_name || ""}`.trim(),
    picture: data.picture || data.photos?.[0]?.value,
    email_verified: data.email_verified,
  };
}
