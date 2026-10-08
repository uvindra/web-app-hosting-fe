import { withOrg } from '../paths';

const ACCESS_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at';
const REFRESH_TOKEN_EXPIRES_AT_KEY = 'refresh_token_expires_at';
const REDIRECT_URL_KEY = 'redirect_url';
const OIDC_STATE_KEY = 'oidc_state';
const OIDC_ORG_HANDLE_KEY = 'org_handle';

const EXPIRY_BUFFER_MS = 30_000;

interface TokenData {
  token: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
}

const ASGARDEO_TOKEN_EXPIRY_BUFFER_MS = 60_000;

let refreshPromise: Promise<void> | null = null;
let asgardeoRefreshPromise: Promise<AsgardeoTokenData | null> | null = null;
let onAuthFailure: (() => void) | null = null;
let asgardeoTokenMemory: { token: string; expiresAt: number } | null = null;

type AsgardeoTokenData = { access_token: string; refresh_token?: string; expires_in?: number };

export function setOnAuthFailure(callback: () => void): void {
  onAuthFailure = callback;
}

export function saveTokens(data: TokenData): void {
  const now = Date.now();
  localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(now + data.expiresIn * 1000));
  localStorage.setItem(REFRESH_TOKEN_EXPIRES_AT_KEY, String(now + data.refreshTokenExpiresIn * 1000));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function saveAsgardeoToken(token: string, expiresIn?: number): void {
  asgardeoTokenMemory = { token, expiresAt: Date.now() + (expiresIn ?? 3600) * 1000 };
}

export function getAsgardeoToken(): string | null {
  if (!asgardeoTokenMemory) return null;
  if (Date.now() >= asgardeoTokenMemory.expiresAt - ASGARDEO_TOKEN_EXPIRY_BUFFER_MS) {
    asgardeoTokenMemory = null;
    return null;
  }
  return asgardeoTokenMemory.token;
}

export function clearAsgardeoToken(): void {
  asgardeoTokenMemory = null;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  asgardeoTokenMemory = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  localStorage.removeItem(REFRESH_TOKEN_EXPIRES_AT_KEY);
}

/**
 * An expired, revoked, or already-rotated refresh token comes back as
 * `400 invalid_grant`
 */
async function isInvalidGrant(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error === 'invalid_grant';
  } catch {
    // Non-JSON or empty body — can't confirm, so don't end the session on a guess.
    return false;
  }
}

// Shared single-flight WSO2 Identity Platform token refresh — ensures refreshOidcAccessToken and
// getOrRefreshAsgardeoToken never race on the same refresh token.
async function doAsgardeoRefresh(): Promise<AsgardeoTokenData | null> {
  const cached = getAsgardeoToken();
  if (cached) return { access_token: cached };

  if (asgardeoRefreshPromise) return asgardeoRefreshPromise;

  const refreshToken = getRefreshToken();
  const { asgardeoClientId, asgardeoTokenEndpoint } = window.API_CONFIG;
  if (!refreshToken || !asgardeoClientId || !asgardeoTokenEndpoint) return null;

  asgardeoRefreshPromise = (async () => {
    try {
      const res = await fetch(asgardeoTokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: asgardeoClientId,
        }).toString(),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Asgardeo refresh auth failure: ${res.status}`);
        }
        if (res.status === 400 && (await isInvalidGrant(res))) {
          throw new Error(`Asgardeo refresh auth failure: 400 invalid_grant`);
        }
        console.warn('[tokenManager] WSO2 Identity Platform token refresh transient error:', res.status);
        return null;
      }
      const data: AsgardeoTokenData = await res.json();
      saveAsgardeoToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      }
      return data;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Asgardeo refresh auth failure')) throw err;
      console.warn('[tokenManager] WSO2 Identity Platform token refresh error:', err);
      return null;
    }
  })().finally(() => {
    asgardeoRefreshPromise = null;
  });

  return asgardeoRefreshPromise;
}

// Returns the raw WSO2 Identity Platform token (needed for APIs that don't accept STS tokens).
// Falls back to a fresh WSO2 Identity Platform token via doAsgardeoRefresh if nothing is cached.
export async function getOrRefreshAsgardeoToken(): Promise<string | null> {
  try {
    const data = await doAsgardeoRefresh();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

function isAccessTokenExpired(): boolean {
  const expiresAt = localStorage.getItem(TOKEN_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt) - EXPIRY_BUFFER_MS;
}

/** The org handle from `ORG_HANDLE` in config.json: set for the local OpenChoreo target only (WSO2 Cloud leaves it empty). */
export function configuredOrgHandle(): string | undefined {
  return window.API_CONFIG?.orgHandle || undefined;
}

/**
 * The org to use for a session. A configured `ORG_HANDLE` wins over the token's org claim: locally the BFF
 * always uses that one OpenChoreo namespace, whatever org (`ouHandle`) the signed-in user's token carries.
 * On WSO2 Cloud nothing is configured, so the token's org is used.
 */
export function resolveOrgHandle(tokenOrgHandle: string | undefined): string | undefined {
  return configuredOrgHandle() ?? (tokenOrgHandle || undefined);
}

/** The signed-in session's org (see resolveOrgHandle); also corrects sessions saved before ORG_HANDLE took precedence. */
export function getSessionOrgHandle(): string | undefined {
  return configuredOrgHandle() ?? (localStorage.getItem(OIDC_ORG_HANDLE_KEY) || undefined);
}

export function saveOidcAuthMetadata(orgHandle?: string): void {
  if (orgHandle) {
    localStorage.setItem(OIDC_ORG_HANDLE_KEY, orgHandle);
  }
}

export function clearOidcAuthMetadata(): void {
  localStorage.removeItem(OIDC_ORG_HANDLE_KEY);
}

// Refreshes the Platform IdP (ThunderID) token. WSO2 Cloud has no STS: the org context comes
// straight from the access token's JWT claims (see getOrgFromToken below), as in ICP cloud.
async function refreshOidcAccessToken(refreshToken: string): Promise<void> {
  let tokenData: AsgardeoTokenData | null;
  try {
    tokenData = await doAsgardeoRefresh();
  } catch {
    // Definitive auth failure (401/403 / invalid_grant from the IdP)
    clearTokens();
    onAuthFailure?.();
    return;
  }
  if (!tokenData) {
    // Transient failure — don't kill the session
    return;
  }
  saveTokens({ token: tokenData.access_token, expiresIn: tokenData.expires_in ?? 3600, refreshToken: tokenData.refresh_token ?? refreshToken, refreshTokenExpiresIn: 86400 });
}

export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      onAuthFailure?.();
      return;
    }
    await refreshOidcAccessToken(refreshToken);
  })().finally(() => {
    refreshPromise = null;
  });

  await refreshPromise;
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (isAccessTokenExpired()) {
    await refreshAccessToken();
  }

  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    await refreshAccessToken();
    const retryToken = getAccessToken();
    const retryHeaders = new Headers(options.headers);
    if (retryToken) {
      retryHeaders.set('Authorization', `Bearer ${retryToken}`);
    }
    return fetch(url, { ...options, headers: retryHeaders });
  }

  return res;
}

/** Best-effort RFC 7009 revocation of the refresh token at the IdP (skipped when no revoke endpoint is configured). */
export async function revokeToken(): Promise<void> {
  try {
    const refreshToken = getRefreshToken();
    const { asgardeoRevokeEndpoint, asgardeoClientId } = window.API_CONFIG;
    if (!refreshToken || !asgardeoRevokeEndpoint) return;
    await fetch(asgardeoRevokeEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: asgardeoClientId }).toString(),
    });
  } catch {
    // best-effort — ignore errors
  }
}

/**
 * Remembers where to return after sign-in, as an in-app path (`/path?query#hash`) since the result
 * is handed to react-router's `navigate`. Cross-origin or malformed URLs are dropped.
 */
export function saveRedirectUrl(url: string): void {
  let target: URL;
  try {
    target = new URL(url, window.location.origin);
  } catch {
    return;
  }
  if (target.origin !== window.location.origin) return;
  // Never persist a redirect to the synthetic 'default' org on WSO2 Cloud — it isn't real and would
  // loop back there on every subsequent login. Locally (ORG_HANDLE=default) 'default' is the real org.
  const isSyntheticDefault = window.API_CONFIG?.orgHandle !== 'default' && (target.pathname === '/organizations/default' || target.pathname.startsWith('/organizations/default/'));
  if (isSyntheticDefault) return;
  localStorage.setItem(REDIRECT_URL_KEY, `${target.pathname}${target.search}${target.hash}`);
}

/**
 * Returns (and clears) the saved in-app path; ignores anything that isn't a same-app path. With a configured
 * `ORG_HANDLE` there is only one org, so a path saved under another org (e.g. the user's `ouHandle`, from before
 * ORG_HANDLE took precedence) is moved to the configured one.
 */
export function getAndClearRedirectUrl(): string | null {
  const path = localStorage.getItem(REDIRECT_URL_KEY);
  localStorage.removeItem(REDIRECT_URL_KEY);
  if (!path?.startsWith('/') || path.startsWith('//')) return null;
  const org = configuredOrgHandle();
  return org ? withOrg(path, org) : path;
}

export function generateAndSaveOIDCState(): string {
  const state = crypto.randomUUID();
  localStorage.setItem(OIDC_STATE_KEY, state);
  return state;
}

export function validateAndClearOIDCState(state: string): boolean {
  const savedState = localStorage.getItem(OIDC_STATE_KEY);
  localStorage.removeItem(OIDC_STATE_KEY);
  return savedState === state;
}

// GitHub OAuth CSRF state — sessionStorage so it's scoped to the initiating tab
const GITHUB_OAUTH_STATE_KEY = 'github_oauth_state';

export function generateAndSaveGitHubState(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(GITHUB_OAUTH_STATE_KEY, state);
  return state;
}

export function validateAndClearGitHubState(state: string): boolean {
  const saved = sessionStorage.getItem(GITHUB_OAUTH_STATE_KEY);
  sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
  return saved !== null && saved === state;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

const CODE_VERIFIER_KEY = 'pkce_verifier';

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { verifier, challenge };
}

export function saveCodeVerifier(verifier: string): void {
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
}

export function getAndClearCodeVerifier(): string | null {
  const v = sessionStorage.getItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  return v;
}

function tokenClaims(): Record<string, unknown> | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const normalized = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Org handle / name from the access token's claims (`ouHandle` / `organization.handle`); empty for local OpenChoreo tokens. */
export function getOrgFromToken(): { handle?: string; name?: string } {
  const payload = tokenClaims();
  if (!payload) return {};
  const org = (payload.organization as Record<string, unknown> | undefined) ?? {};
  return {
    handle: (org.handle as string | undefined) ?? (payload.ouHandle as string | undefined),
    name: (org.name as string | undefined) ?? (payload.ouName as string | undefined),
  };
}

/**
 * Org UUID carried directly in the access token's JWT claims. WSO2 Cloud's Thunder IdP issues it
 * as either `organization.uuid` or the flatter `ouId` claim depending on deployment — try both.
 */
export function getOrgUuidFromToken(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (payload.organization?.uuid as string) ?? (payload.ouId as string) ?? null;
  } catch {
    return null;
  }
}
