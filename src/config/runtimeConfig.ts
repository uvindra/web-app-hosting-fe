interface RuntimeConfig {
  VITE_WEBAPP_API_URL?: string;
  VITE_AUTH_BASE_URL?: string;
  ASGARDEO_CLIENT_ID?: string;
  ASGARDEO_AUTHORIZE_ENDPOINT?: string;
  ASGARDEO_TOKEN_ENDPOINT?: string;
  ASGARDEO_SIGN_IN_REDIRECT_URL?: string;
  ASGARDEO_SCOPE?: string;
  STS_TOKEN_ENDPOINT?: string;
  STS_CLIENT_ID?: string;
  STS_SCOPE?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_AUTH_REDIRECTION_URL?: string;
  GITHUB_APP_SLUG?: string;
}

export interface ApiConfig {
  webAppApiUrl: string;
  authBaseUrl: string;
  asgardeoClientId: string;
  asgardeoAuthorizeEndpoint: string;
  asgardeoTokenEndpoint: string;
  asgardeoSignInRedirectUrl: string;
  asgardeoScope: string;
  stsTokenEndpoint: string;
  stsClientId: string;
  stsScope: string;
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
  webAppApiUrl: 'https://localhost:9450/webapp-hosting/api/v1',
  authBaseUrl: 'https://localhost:9445/auth',
  asgardeoClientId: '',
  asgardeoAuthorizeEndpoint: 'https://dev.api.asgardeo.io/t/a/oauth2/authorize',
  asgardeoTokenEndpoint: 'https://dev.api.asgardeo.io/t/a/oauth2/token',
  asgardeoSignInRedirectUrl: `${window.location.origin}/signin`,
  asgardeoScope: 'openid profile email groups',
  stsTokenEndpoint: '',
  stsClientId: '',
  stsScope: '',
  githubAppClientId: '',
  githubAppAuthRedirectUrl: `${window.location.origin}/ghapp`,
  githubAppSlug: '',
};

/**
 * Load configuration from /config.json.
 * This allows modifying URLs after build without rebuilding the app.
 */
export async function loadConfig(): Promise<void> {
  try {
    const response = await fetch('/config.json');
    if (!response.ok) {
      throw new Error(`Failed to load config.json: ${response.status}`);
    }

    const config: RuntimeConfig = await response.json();
    const trim = (url: string): string => url.replace(/\/$/, '');

    window.API_CONFIG = {
      webAppApiUrl: trim(config.VITE_WEBAPP_API_URL || DEFAULT_CONFIG.webAppApiUrl),
      authBaseUrl: trim(config.VITE_AUTH_BASE_URL || DEFAULT_CONFIG.authBaseUrl),
      asgardeoClientId: config.ASGARDEO_CLIENT_ID || DEFAULT_CONFIG.asgardeoClientId,
      asgardeoAuthorizeEndpoint: config.ASGARDEO_AUTHORIZE_ENDPOINT || DEFAULT_CONFIG.asgardeoAuthorizeEndpoint,
      asgardeoTokenEndpoint: config.ASGARDEO_TOKEN_ENDPOINT || DEFAULT_CONFIG.asgardeoTokenEndpoint,
      asgardeoSignInRedirectUrl: config.ASGARDEO_SIGN_IN_REDIRECT_URL || DEFAULT_CONFIG.asgardeoSignInRedirectUrl,
      asgardeoScope: config.ASGARDEO_SCOPE || DEFAULT_CONFIG.asgardeoScope,
      stsTokenEndpoint: config.STS_TOKEN_ENDPOINT || DEFAULT_CONFIG.stsTokenEndpoint,
      stsClientId: config.STS_CLIENT_ID || DEFAULT_CONFIG.stsClientId,
      stsScope: config.STS_SCOPE || '',
      githubAppClientId: config.GITHUB_APP_CLIENT_ID || DEFAULT_CONFIG.githubAppClientId,
      githubAppAuthRedirectUrl: config.GITHUB_APP_AUTH_REDIRECTION_URL || DEFAULT_CONFIG.githubAppAuthRedirectUrl,
      githubAppSlug: config.GITHUB_APP_SLUG || DEFAULT_CONFIG.githubAppSlug,
    };

    console.info('✓ Runtime configuration loaded from config.json');
  } catch (error) {
    console.warn('Failed to load runtime config, using defaults:', error);
    window.API_CONFIG = DEFAULT_CONFIG;
  }
}

// URL helpers — only for values that require computation. Simple field reads
// (e.g. window.API_CONFIG.webAppApiUrl) are done directly at call sites.
export const loginApiUrl = (): string => `${window.API_CONFIG.authBaseUrl}/login`;
export const refreshTokenApiUrl = (): string => `${window.API_CONFIG.authBaseUrl}/refresh-token`;
export const revokeTokenApiUrl = (): string => `${window.API_CONFIG.authBaseUrl}/revoke-token`;
