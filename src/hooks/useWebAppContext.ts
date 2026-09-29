import { useProjectByHandler } from './useProjects';
import { useWebAppByHandler } from './useWebApps';
import { hasProject, hasWebApp, useScope } from '../nav';
import type { WebAppScope } from '../nav';
import type { Project } from '../types/project';
import type { WebApp } from '../types/webApp';

export type WebAppContextState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'ready'; scope: WebAppScope; project: Project; webApp: WebApp };

/** Resolves org → project → web app from the URL. Pages render loading / not-found from this, then the ready view. */
export function useWebAppContext(): WebAppContextState {
  const scope = useScope();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const webAppHandler = hasWebApp(scope) ? scope.webApp : '';

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const { data: webApp, isLoading: loadingWebApp } = useWebAppByHandler(project?.id ?? '', webAppHandler);

  if (loadingProject || (loadingWebApp && !!project)) return { status: 'loading' };
  if (!project || !webApp || !hasWebApp(scope)) return { status: 'not-found' };
  return { status: 'ready', scope, project, webApp };
}
