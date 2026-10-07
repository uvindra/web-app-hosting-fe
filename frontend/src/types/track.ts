/**
 * Identifies one deployment track of a web app. Builds, deployments, runtime, containers, configs,
 * logs and URLs are all per track (a track is one OpenChoreo Component built from one branch).
 */
export interface TrackRef {
  webAppId: string;
  trackId: string;
}

/** A query-key fragment for a track. */
export const trackKey = (t: TrackRef): string[] => [t.webAppId, t.trackId];
