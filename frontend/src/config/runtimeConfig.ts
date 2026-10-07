interface RuntimeConfig {
  VITE_WEBAPP_API_URL?: string;
  ASGARDEO_CLIENT_ID?: string;
  ASGARDEO_AUTHORIZE_ENDPOINT?: string;
  ASGARDEO_TOKEN_ENDPOINT?: string;
  ASGARDEO_REVOKE_ENDPOINT?: string;
  ASGARDEO_LOGOUT_ENDPOINT?: string;
  ASGARDEO_SIGN_IN_REDIRECT_URL?: string;
  ASGARDEO_SCOPE?: string;
  /** Org used when the access token carries no org claims (local OpenChoreo). */
  ORG_HANDLE?: string;
  /** WSO2 Cloud billing API base (activates the free plan on first login). Unset = no billing UI. */
  BILLING_API_BASE_URL?: string;
  /** Billing console, linked from "quota reached — upgrade" messages. */
  BILLING_CONSOLE_URL?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_AUTH_REDIRECTION_URL?: string;
  GITHUB_APP_SLUG?: string;
}

export interface ApiConfig {
  webAppApiUrl: string;
  /** Platform IdP (ThunderID) — the keys keep the legacy `ASGARDEO_*` names, as in ICP. */
  asgardeoClientId: string;
  asgardeoAuthorizeEndpoint: string;
  asgardeoTokenEndpoint: string;
  asgardeoRevokeEndpoint: string;
  asgardeoLogoutEndpoint: string;
  asgardeoSignInRedirectUrl: string;
  asgardeoScope: string;
  orgHandle: string;
  billingApiBaseUrl: string;
  billingConsoleUrl: string;
  githubAppClientId?: string;
  githubAppAuthRedirectUrl?: string;
  /** GitHub App slug — powers https://github.com/apps/{slug}/installations/new when the App is authorized but not yet installed on any account. */
  githubAppSlug?: string;
}

declare global {
  interface Window {
    API_CONFIG: ApiConfig;
  }
}

const DEFAULT_CONFIG: ApiConfig = {
  webAppApiUrl: '/webapp-hosting/api/v1',
  asgardeoClientId: '',
  asgardeoAuthorizeEndpoint: '',
  asgardeoTokenEndpoint: '',
  asgardeoRevokeEndpoint: '',
  asgardeoLogoutEndpoint: '',
  asgardeoSignInRedirectUrl: `${window.location.origin}/signin`,
  asgardeoScope: 'openid profile email groups',
  orgHandle: '',
  billingApiBaseUrl: '',
  billingConsoleUrl: '',
  githubAppClientId: '',
  githubAppAuthRedirectUrl: `${window.location.origin}/ghapp`,
  githubAppSlug: '',
};

/** Resolves a config URL: absolute URLs as is, `/path` relative to this origin (dev-server proxies). */
function resolveUrl(url: string): string {
  const trimmed = url.replace(/\/$/, '');
  return trimmed.startsWith('/') ? `${window.location.origin}${trimmed}` : trimmed;
}

/**
 * Load configuration from /config.json (deployed: mounted per environment from the
 * ReleaseBinding; local OpenChoreo: `pnpm dev:local` serves public/config.local.json).
 * This allows modifying URLs after build without rebuilding the app.
 */
export async function loadConfig(): Promise<void> {
  try {
    const response = await fetch('/config.json');
    if (!response.ok) {
      throw new Error(`Failed to load config.json: ${response.status}`);
    }

    const config: RuntimeConfig = await response.json();
    const url = (v: string | undefined, def: string): string => (v ? resolveUrl(v) : def);

    window.API_CONFIG = {
      webAppApiUrl: url(config.VITE_WEBAPP_API_URL, resolveUrl(DEFAULT_CONFIG.webAppApiUrl)),
      asgardeoClientId: config.ASGARDEO_CLIENT_ID || DEFAULT_CONFIG.asgardeoClientId,
      asgardeoAuthorizeEndpoint: url(config.ASGARDEO_AUTHORIZE_ENDPOINT, DEFAULT_CONFIG.asgardeoAuthorizeEndpoint),
      asgardeoTokenEndpoint: url(config.ASGARDEO_TOKEN_ENDPOINT, DEFAULT_CONFIG.asgardeoTokenEndpoint),
      asgardeoRevokeEndpoint: url(config.ASGARDEO_REVOKE_ENDPOINT, DEFAULT_CONFIG.asgardeoRevokeEndpoint),
      asgardeoLogoutEndpoint: url(config.ASGARDEO_LOGOUT_ENDPOINT, DEFAULT_CONFIG.asgardeoLogoutEndpoint),
      asgardeoSignInRedirectUrl: config.ASGARDEO_SIGN_IN_REDIRECT_URL || DEFAULT_CONFIG.asgardeoSignInRedirectUrl,
      asgardeoScope: config.ASGARDEO_SCOPE || DEFAULT_CONFIG.asgardeoScope,
      orgHandle: config.ORG_HANDLE || DEFAULT_CONFIG.orgHandle,
      billingApiBaseUrl: url(config.BILLING_API_BASE_URL, DEFAULT_CONFIG.billingApiBaseUrl),
      billingConsoleUrl: config.BILLING_CONSOLE_URL || DEFAULT_CONFIG.billingConsoleUrl,
      githubAppClientId: config.GITHUB_APP_CLIENT_ID || DEFAULT_CONFIG.githubAppClientId,
      githubAppAuthRedirectUrl: config.GITHUB_APP_AUTH_REDIRECTION_URL || DEFAULT_CONFIG.githubAppAuthRedirectUrl,
      githubAppSlug: config.GITHUB_APP_SLUG || DEFAULT_CONFIG.githubAppSlug,
    };

    console.info('✓ Runtime configuration loaded from config.json');
  } catch (error) {
    console.warn('Failed to load runtime config, using defaults:', error);
    window.API_CONFIG = { ...DEFAULT_CONFIG, webAppApiUrl: resolveUrl(DEFAULT_CONFIG.webAppApiUrl) };
  }
}
