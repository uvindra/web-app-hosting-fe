import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { loginUrl } from '../paths';
import { buildAuthorizationUrl } from './authorizeUrl';
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  revokeToken,
  setOnAuthFailure,
  generateAndSaveOIDCState,
  generatePKCE,
  saveCodeVerifier,
  getAndClearCodeVerifier,
  saveAsgardeoToken,
  getAsgardeoToken,
  getOrRefreshAsgardeoToken,
  saveOidcAuthMetadata,
  clearOidcAuthMetadata,
  resolveOrgHandle,
} from './tokenManager';

const USER_KEY = 'user';

interface UserInfo {
  userId: string;
  username: string;
  displayName: string;
  pictureUrl?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  userId: string;
  username: string;
  displayName: string;
  pictureUrl?: string;
  loginWithOIDC: (fidp?: string) => Promise<void>;
  handleOIDCCallback: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Dev-only: seeds a fake local session so the app is demoable without a real IdP tenant. No-ops outside `import.meta.env.DEV` — see `pages/DevSeedSession.tsx`. */
  devLogin: (orgHandle: string) => void;
}

function b64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUserInfo(): UserInfo | null {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [userInfo, setUserInfo] = useState<UserInfo | null>(() => loadUserInfo());

  useEffect(() => {
    setOnAuthFailure(() => {
      localStorage.removeItem(USER_KEY);
      setUserInfo(null);
      setIsAuthenticated(false);
      queryClient.clear();
      navigate(loginUrl());
    });
  }, [navigate, queryClient]);

  // Bootstrap the WSO2 Identity Platform token for existing sessions that pre-date saveAsgardeoToken.
  useEffect(() => {
    if (isAuthenticated && !getAsgardeoToken()) {
      getOrRefreshAsgardeoToken().catch(() => {
        /* best-effort */
      });
    }
  }, [isAuthenticated]);

  const loginWithOIDC = useCallback(async (fidp?: string) => {
    const { asgardeoClientId, asgardeoAuthorizeEndpoint, asgardeoSignInRedirectUrl, asgardeoScope } = window.API_CONFIG;
    const state = generateAndSaveOIDCState();
    const { verifier, challenge } = await generatePKCE();
    saveCodeVerifier(verifier);
    window.location.href = buildAuthorizationUrl(asgardeoAuthorizeEndpoint, {
      clientId: asgardeoClientId,
      redirectUri: asgardeoSignInRedirectUrl,
      scope: asgardeoScope,
      state,
      codeChallenge: challenge,
      fidp,
    });
  }, []);

  // WSO2 Cloud's Platform IdP (ThunderID) issues a token whose org context is already carried in
  // its JWT claims (root-level `ouHandle`, or nested `organization.handle`) — there is no STS
  // exchange (as in ICP cloud). A configured ORG_HANDLE overrides it (see resolveOrgHandle).
  const handleOIDCCallback = useCallback(async (code: string) => {
    const { asgardeoClientId, asgardeoTokenEndpoint, asgardeoSignInRedirectUrl } = window.API_CONFIG;

    const codeVerifier = getAndClearCodeVerifier();
    if (!codeVerifier) throw new Error('Missing PKCE code verifier. Please try logging in again.');

    const tokenRes = await fetch(asgardeoTokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: asgardeoSignInRedirectUrl,
        client_id: asgardeoClientId,
        code_verifier: codeVerifier,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`);
    }
    const tokenData: { access_token: string; id_token?: string; refresh_token?: string; expires_in?: number } = await tokenRes.json();
    const asgardeoToken = tokenData.access_token;
    saveAsgardeoToken(asgardeoToken);

    let userId = crypto.randomUUID();
    let username = '';
    let displayName = '';
    let pictureUrl: string | undefined;
    let tokenOrgHandle: string | undefined;
    try {
      const normalized = asgardeoToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
      const org = (payload.organization as Record<string, unknown> | undefined) ?? {};
      tokenOrgHandle = (org.handle as string | undefined) ?? (payload.ouHandle as string | undefined);
    } catch {
      /* ignore */
    }
    if (tokenData.id_token) {
      try {
        const payload = JSON.parse(atob(tokenData.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        userId = payload.sub ?? userId;
        username = payload.username ?? payload.preferred_username ?? payload.email ?? payload.sub ?? '';
        displayName = payload.name ?? payload.given_name ?? username;
        pictureUrl = payload.picture ?? undefined;
      } catch {
        /* use defaults */
      }
    }

    // A configured ORG_HANDLE (local OpenChoreo only) wins over the token's org: the BFF always uses that
    // namespace, and local tokens may carry the user's own ouHandle or no org claim at all.
    const orgHandle = resolveOrgHandle(tokenOrgHandle);
    if (!orgHandle) {
      throw new Error('Missing organization context after sign-in. Please try logging in again.');
    }

    saveTokens({ token: asgardeoToken, expiresIn: tokenData.expires_in ?? 3600, refreshToken: tokenData.refresh_token ?? '', refreshTokenExpiresIn: 86400 });
    saveOidcAuthMetadata(orgHandle);
    const user: UserInfo = { userId, username, displayName, pictureUrl };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUserInfo(user);
    setIsAuthenticated(true);
  }, []);

  const devLogin = useCallback((orgHandle: string) => {
    if (!import.meta.env.DEV) return;
    const fakeJwt = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ organization: { handle: orgHandle, uuid: `dev-${orgHandle}` } })}.dev`;
    saveTokens({ token: fakeJwt, expiresIn: 24 * 3600, refreshToken: 'dev-refresh-token', refreshTokenExpiresIn: 7 * 24 * 3600 });
    saveOidcAuthMetadata(orgHandle);
    const user: UserInfo = { userId: 'dev-user', username: 'dev@wso2.com', displayName: 'Dev User' };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUserInfo(user);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    await revokeToken();
    clearTokens();
    clearOidcAuthMetadata();
    localStorage.removeItem(USER_KEY);
    setUserInfo(null);
    setIsAuthenticated(false);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      userId: userInfo?.userId ?? '',
      username: userInfo?.username ?? '',
      displayName: userInfo?.displayName ?? '',
      pictureUrl: userInfo?.pictureUrl,
      loginWithOIDC,
      handleOIDCCallback,
      logout,
      devLogin,
    }),
    [isAuthenticated, userInfo, loginWithOIDC, handleOIDCCallback, logout, devLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
