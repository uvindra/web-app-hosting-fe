import { useParams } from 'react-router';
import {
  webAppBuildUrl,
  webAppConfigsUrl,
  webAppContainersUrl,
  webAppDeployUrl,
  webAppHealthChecksUrl,
  webAppMetricsUrl,
  webAppOverviewUrl,
  webAppRuntimeLogsUrl,
  webAppRuntimeUrl,
  webAppScalingUrl,
  webAppSettingsUrl,
} from './paths';

export interface OrgScope {
  org: string;
}

export interface ProjectScope extends OrgScope {
  project: string;
}

export interface WebAppScope extends ProjectScope {
  webApp: string;
}

export type Scope = OrgScope | ProjectScope | WebAppScope;

export function hasProject(scope: Scope): scope is ProjectScope {
  return 'project' in scope && !!scope.project;
}

export function hasWebApp(scope: Scope): scope is WebAppScope {
  return 'webApp' in scope && !!(scope as WebAppScope).webApp;
}

/** Reads the current org/project/webApp scope from the URL params. */
export function useScope(): Scope {
  const params = useParams<{ orgHandler: string; projectHandler?: string; webAppHandler?: string }>();
  const scope: OrgScope = { org: params.orgHandler ?? '' };
  if (!params.projectHandler) return scope;
  const projectScope: ProjectScope = { ...scope, project: params.projectHandler };
  if (!params.webAppHandler) return projectScope;
  return { ...projectScope, webApp: params.webAppHandler };
}

// ---------------------------------------------------------------------------
// Web App sidebar
// ---------------------------------------------------------------------------

export type WebAppNavId =
  | 'overview'
  | 'build'
  | 'deploy'
  | 'observe'
  | 'metrics'
  | 'runtime-logs'
  | 'devops'
  | 'runtime'
  | 'containers'
  | 'configs'
  | 'health-checks'
  | 'scaling'
  | 'settings';

export interface WebAppNavLeaf {
  id: WebAppNavId;
  label: string;
  url: (scope: WebAppScope) => string;
}

/** Leaf destinations, in sidebar order. The Observe / DevOps group headers are non-navigating and live only in AppLayout. */
export const WEB_APP_NAV_LEAVES: readonly WebAppNavLeaf[] = [
  { id: 'overview', label: 'Overview', url: (s) => webAppOverviewUrl(s.org, s.project, s.webApp) },
  { id: 'build', label: 'Build', url: (s) => webAppBuildUrl(s.org, s.project, s.webApp) },
  { id: 'deploy', label: 'Deploy', url: (s) => webAppDeployUrl(s.org, s.project, s.webApp) },
  { id: 'metrics', label: 'Metrics', url: (s) => webAppMetricsUrl(s.org, s.project, s.webApp) },
  { id: 'runtime-logs', label: 'Runtime Logs', url: (s) => webAppRuntimeLogsUrl(s.org, s.project, s.webApp) },
  { id: 'runtime', label: 'Runtime', url: (s) => webAppRuntimeUrl(s.org, s.project, s.webApp) },
  { id: 'containers', label: 'Containers', url: (s) => webAppContainersUrl(s.org, s.project, s.webApp) },
  { id: 'configs', label: 'Configs & Secrets', url: (s) => webAppConfigsUrl(s.org, s.project, s.webApp) },
  { id: 'health-checks', label: 'Health Checks', url: (s) => webAppHealthChecksUrl(s.org, s.project, s.webApp) },
  { id: 'scaling', label: 'Scaling', url: (s) => webAppScalingUrl(s.org, s.project, s.webApp) },
  { id: 'settings', label: 'Settings', url: (s) => webAppSettingsUrl(s.org, s.project, s.webApp) },
];

/** The collapsible sidebar group a leaf lives under, if any. */
export function webAppNavGroupOf(id: WebAppNavId): 'observe' | 'devops' | undefined {
  if (id === 'metrics' || id === 'runtime-logs') return 'observe';
  if (id === 'runtime' || id === 'containers' || id === 'configs' || id === 'health-checks' || id === 'scaling') return 'devops';
  return undefined;
}

/** Resolves the active sidebar item from the pathname: the leaf whose URL is the longest prefix of it. */
export function resolveWebAppNavId(scope: WebAppScope, pathname: string): WebAppNavId {
  let best: WebAppNavId = 'overview';
  let bestLen = -1;
  for (const leaf of WEB_APP_NAV_LEAVES) {
    const url = leaf.url(scope);
    if ((pathname === url || pathname.startsWith(`${url}/`)) && url.length > bestLen) {
      best = leaf.id;
      bestLen = url.length;
    }
  }
  return best;
}
