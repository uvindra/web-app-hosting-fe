import { useLocation, useSearchParams } from 'react-router';
import { useProjectByHandler, useProjectEnvironments } from './useProjects';
import { useWebAppByHandler } from './useWebApps';
import { useDeploymentTracks } from './useDeploymentTracks';
import { hasProject, hasWebApp, useScope } from '../nav';
import type { WebAppScope } from '../nav';
import type { Project } from '../types/project';
import type { WebApp } from '../types/webApp';
import type { Environment } from '../types/environment';
import type { DeploymentTrack } from '../types/deploymentTracks';
import type { TrackRef } from '../types/track';
import { TRACK_PARAM, withoutTrack } from '../paths';

export type WebAppContextState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      scope: WebAppScope;
      project: Project;
      webApp: WebApp;
      /** The selected deployment track (`?track=`, default: the web app's default track). */
      track: TrackRef;
      /** The project's pipeline environments, in promotion order. */
      environments: Environment[];
      /**
       * Set when `?track=` names a track the web app doesn't have (a stale link, or the selected track was just
       * deleted): `track` is then the default track and the page should replace the URL with this one.
       */
      trackRedirect: string | null;
    };

/**
 * Picks the track for a requested `?track=` value. `tracks` is the web app's track list, or `undefined` when it
 * couldn't be read (the requested track is then trusted; track-scoped queries report their own errors).
 */
export function resolveTrack(requested: string | null, defaultTrackId: string, tracks: DeploymentTrack[] | undefined): { trackId: string; stale: boolean } {
  if (!requested || requested === defaultTrackId) return { trackId: defaultTrackId, stale: false };
  if (tracks && !tracks.some((t) => t.id === requested)) return { trackId: defaultTrackId, stale: true };
  return { trackId: requested, stale: false };
}

/** Resolves org → project → web app (+ selected track and pipeline environments) from the URL. */
export function useWebAppContext(): WebAppContextState {
  const scope = useScope();
  const location = useLocation();
  const [params] = useSearchParams();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const webAppHandler = hasWebApp(scope) ? scope.webApp : '';
  const requestedTrack = params.get(TRACK_PARAM);

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const { data: webApp, isLoading: loadingWebApp } = useWebAppByHandler(project?.id, webAppHandler);
  const { data: environments, isLoading: loadingEnvs } = useProjectEnvironments(project?.id);
  // Only a non-default `?track=` needs the track list (shared with the track picker's query).
  const tracks = useDeploymentTracks(requestedTrack ? webApp?.id : undefined);

  if (loadingProject || (loadingWebApp && !!project) || (loadingEnvs && !!project) || tracks.isLoading) return { status: 'loading' };
  if (!project || !webApp || !hasWebApp(scope)) return { status: 'not-found' };
  if (!environments) return { status: 'error', message: "Failed to load the project's environments." };
  const { trackId, stale } = resolveTrack(requestedTrack, webApp.defaultTrackId || webApp.id, tracks.data);
  return {
    status: 'ready',
    scope,
    project,
    webApp,
    track: { webAppId: webApp.id, trackId },
    environments,
    trackRedirect: stale ? withoutTrack(location) : null,
  };
}
