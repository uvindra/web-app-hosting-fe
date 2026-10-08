/**
 * URL builders for every route in the app. No raw path strings anywhere else — see
 * HOUSE_RULES.md's "no string URLs/paths anywhere except paths.ts".
 */

export function rootUrl(): string {
  return '/';
}

export function loginUrl(): string {
  return '/login';
}

export function oidcCallbackUrl(): string {
  return '/signin';
}

/** Bare popup window that captures a GitHub OAuth `code`/`state` and relays it back via BroadcastChannel. */
export function ghAppCallbackUrl(): string {
  return '/ghapp';
}

/**
 * Moves an in-app path (`/organizations/<org>/...?query#hash`) to another org; other paths are returned unchanged.
 * Used when a configured ORG_HANDLE replaces an org saved in an older session or redirect.
 */
export function withOrg(path: string, orgHandler: string): string {
  return path.replace(/^\/organizations\/[^/?#]+/, `/organizations/${orgHandler}`);
}

export function orgHomeUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}`;
}

export function newProjectUrl(orgHandler: string): string {
  return `/organizations/${orgHandler}/projects/new`;
}

export function projectHomeUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/home`;
}

export function newWebAppUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/webapps/new`;
}

export function importWebAppUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/webapps/new/import`;
}

export function configureWebAppUrl(orgHandler: string, projectHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/webapps/new/configure`;
}

export function webAppOverviewUrl(orgHandler: string, projectHandler: string, webAppHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/webapps/${webAppHandler}/overview`;
}

function webAppBase(orgHandler: string, projectHandler: string, webAppHandler: string): string {
  return `/organizations/${orgHandler}/projects/${projectHandler}/webapps/${webAppHandler}`;
}

export function webAppBuildUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/build`;
}

export function webAppDeployUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/deploy`;
}

export function webAppMetricsUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/observe/metrics`;
}

export function webAppRuntimeLogsUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/observe/logs`;
}

export function webAppRuntimeUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/devops/runtime`;
}

export function webAppContainersUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/devops/containers`;
}

export function webAppConfigsUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/devops/configs`;
}

export function webAppHealthChecksUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/devops/health-checks`;
}

export function webAppScalingUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/devops/scaling`;
}

/** Settings landing — redirects to the first settings tab. */
export function webAppSettingsUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/settings`;
}

export function webAppDeploymentTracksUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/settings/deployment-tracks`;
}

export function webAppUrlSettingsUrl(org: string, project: string, webApp: string): string {
  return `${webAppBase(org, project, webApp)}/settings/url-settings`;
}

/** Query parameter that selects a web app's deployment track on every web-app page. */
export const TRACK_PARAM = 'track';

/** Appends the selected track to a web-app page URL (omitted for the default track). */
export function withTrack(url: string, trackId: string | null | undefined): string {
  if (!trackId) return url;
  return `${url}?${new URLSearchParams({ [TRACK_PARAM]: trackId }).toString()}`;
}

// ---------------------------------------------------------------------------
// External links
// ---------------------------------------------------------------------------

export const external = {
  wso2: 'https://www.wso2.com',
  documentation: 'https://wso2.com/engineering-platform/developer-platform/docs/quick-start-guides/deploy-a-web-application-that-consumes-a-backend-service/',
} as const;

/** Public host bases used to build a web app's source repo URL per git provider. */
export const gitProviderBase = {
  github: 'https://github.com',
  bitbucket: 'https://bitbucket.org',
  gitlab: 'https://gitlab.com',
  azure: 'https://dev.azure.com',
} as const;

// Build GitHub OAuth authorization URL for repository access.
// redirectUri falls back to window.location.origin + '/ghapp' when empty.
export function buildGitHubOAuthUrl(redirectUri: string, clientId: string, state: string, scope = 'repo,read:user'): string {
  const params = new URLSearchParams({
    redirect_uri: redirectUri || `${window.location.origin}/ghapp`,
    client_id: clientId,
    scope,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// GitHub App installation page — opened when the user authorized the App but
// has not installed it on any account/org yet (bind returns 409).
export function buildGitHubAppInstallUrl(slug: string): string {
  return `https://github.com/apps/${slug}/installations/new`;
}
