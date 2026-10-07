import type { ReplicaPod, ScalingConfig } from '../types/scaling';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { envPath } from './trackPath';

/** P0: fixed replicas only — the BFF answers 501 NOT_SUPPORTED for HPA. */
export async function fetchScaling(track: TrackRef, environment: EnvironmentId): Promise<ScalingConfig> {
  return webAppHostingClient.get<ScalingConfig>(`${envPath(track, environment)}/scaling`);
}

export async function updateScaling(track: TrackRef, environment: EnvironmentId, data: ScalingConfig): Promise<ScalingConfig> {
  return webAppHostingClient.put<ScalingConfig>(`${envPath(track, environment)}/scaling`, data);
}

export async function fetchReplicas(track: TrackRef, environment: EnvironmentId): Promise<ReplicaPod[]> {
  return webAppHostingClient.get<ReplicaPod[]>(`${envPath(track, environment)}/replicas`);
}
