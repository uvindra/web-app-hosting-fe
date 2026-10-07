import { useSearchParams } from 'react-router';
import { useProjectByHandler, useProjectEnvironments } from './useProjects';
import { useWebAppByHandler } from './useWebApps';
import { hasProject, hasWebApp, useScope } from '../nav';
import type { WebAppScope } from '../nav';
import type { Project } from '../types/project';
import type { WebApp } from '../types/webApp';
import type { Environment } from '../types/environment';
import type { TrackRef } from '../types/track';
import { TRACK_PARAM } from '../paths';

export type WebAppContextState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | {
      status: 'ready';
      scope: WebAppScope;
      project: Project;
      webApp: WebApp;
      /** The selected deployment track (`?track=`, default: the web app's default track). */
      track: TrackRef;
      /** The project's pipeline environments, in promotion order. */
      environments: Environment[];
    };

/** Resolves org → project → web app (+ selected track and pipeline environments) from the URL. */
export function useWebAppContext(): WebAppContextState {
  const scope = useScope();
  const [params] = useSearchParams();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const webAppHandler = hasWebApp(scope) ? scope.webApp : '';

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const { data: webApp, isLoading: loadingWebApp } = useWebAppByHandler(project?.id ?? '', webAppHandler);
  const { data: environments, isLoading: loadingEnvs } = useProjectEnvironments(project?.id ?? '');

  if (loadingProject || (loadingWebApp && !!project) || (loadingEnvs && !!project)) return { status: 'loading' };
  if (!project || !webApp || !hasWebApp(scope)) return { status: 'not-found' };
  const trackId = params.get(TRACK_PARAM) || webApp.defaultTrackId || webApp.id;
  return { status: 'ready', scope, project, webApp, track: { webAppId: webApp.id, trackId }, environments: environments ?? [] };
}
