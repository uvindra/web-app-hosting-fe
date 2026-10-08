import type { HealthCheck } from '../types/healthChecks';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { envPath } from './trackPath';

/** The environment's probes. An unset readiness probe means the platform default (TCP check on the web app's port). */
export async function fetchHealthCheck(track: TrackRef, environment: EnvironmentId): Promise<HealthCheck> {
  return webAppHostingClient.get<HealthCheck>(`${envPath(track, environment)}/health-check`);
}

/** Replaces the environment's probes (omit a probe to remove it). Rolls the environment's pods. */
export async function updateHealthCheck(track: TrackRef, environment: EnvironmentId, data: HealthCheck): Promise<HealthCheck> {
  return webAppHostingClient.put<HealthCheck>(`${envPath(track, environment)}/health-check`, data);
}
