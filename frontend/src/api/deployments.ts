import type { DeployBuildInput, Deployment, PromoteInput } from '../types/deployment';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { envPath, trackPath } from './trackPath';

/** The current deployment per environment (newest first per environment). */
export async function fetchDeployments(track: TrackRef): Promise<Deployment[]> {
  return webAppHostingClient.get<Deployment[]>(`${trackPath(track)}/deployments`);
}

export async function deployBuild(track: TrackRef, input: DeployBuildInput): Promise<Deployment> {
  return webAppHostingClient.post<Deployment>(`${trackPath(track)}/deployments`, { environment: input.environment, build: { id: input.build.id } });
}

export async function promoteDeployment(track: TrackRef, input: PromoteInput): Promise<Deployment> {
  return webAppHostingClient.post<Deployment>(`${trackPath(track)}/deployments/promote`, input);
}

export async function redeployDeployment(track: TrackRef, environment: EnvironmentId): Promise<Deployment> {
  return webAppHostingClient.post<Deployment>(`${envPath(track, environment)}/redeploy`);
}

export async function stopDeployment(track: TrackRef, environment: EnvironmentId): Promise<Deployment> {
  return webAppHostingClient.post<Deployment>(`${envPath(track, environment)}/stop`);
}
