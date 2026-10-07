import type { TrackRef } from '../types/track';

const enc = encodeURIComponent;

/** BFF path prefix of a deployment track's resources. */
export function trackPath(t: TrackRef): string {
  return `/webapps/${enc(t.webAppId)}/tracks/${enc(t.trackId)}`;
}

/** BFF path prefix of a track's environment. */
export function envPath(t: TrackRef, environment: string): string {
  return `${trackPath(t)}/environments/${enc(environment)}`;
}
