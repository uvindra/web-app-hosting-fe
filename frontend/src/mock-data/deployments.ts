import type { Deployment } from '../types/deployment';
import type { EnvironmentId } from '../types/webApp';

const HOURS = 60 * 60 * 1000;
const now = Date.now();

/** Public URL of a web app in an environment, derived from its id (there is no real hosting backend yet). */
export function buildWebAppUrl(webAppId: string, environment: EnvironmentId): string {
  const slug = webAppId.replace(/^webapp-/, '');
  return `https://${slug}-${environment}.choreoapps.dev`;
}

/** Hostname (no scheme) of a web app in an environment — the same host `buildWebAppUrl` serves. */
export function buildWebAppHost(webAppId: string, environment: EnvironmentId): string {
  return buildWebAppUrl(webAppId, environment).replace(/^https?:\/\//, '');
}

function seed(webAppId: string, environment: EnvironmentId, status: Deployment['status'], sha: string, message: string, hoursAgo: number): Deployment {
  return {
    id: `dep-${webAppId}-${environment}-${sha}`,
    environment,
    buildId: `build-${sha}`,
    commitSha: sha,
    commitMessage: message,
    status,
    deployedAt: new Date(now - hoursAgo * HOURS).toISOString(),
    url: buildWebAppUrl(webAppId, environment),
  };
}

/** Keyed by webApp id, newest first. Web apps without an entry have never been deployed. */
export const MOCK_DEPLOYMENTS: Record<string, Deployment[]> = {
  'webapp-my-portfolio': [seed('webapp-my-portfolio', 'development', 'active', '7fb07eb', 'Add test message to readme', 1)],
  'webapp-admin-dashboard': [seed('webapp-admin-dashboard', 'development', 'active', 'a3c9f21', 'Update dashboard widgets', 24)],
  'webapp-portfolio-site': [seed('webapp-portfolio-site', 'development', 'active', 'c41d8e0', 'Refresh landing page hero', 6)],
  'webapp-storefront': [seed('webapp-storefront', 'development', 'deploying', 'e92b5a7', 'Add cart drawer', 0)],
};
