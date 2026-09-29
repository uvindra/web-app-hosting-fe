import { useParams } from 'react-router';

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
