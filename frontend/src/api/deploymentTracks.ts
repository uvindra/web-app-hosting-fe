import type { CreateDeploymentTrackInput, DeploymentTrack, TrackDeletableResult } from '../types/deploymentTracks';
import { webAppHostingClient } from './httpClient';

const enc = encodeURIComponent;
const base = (webAppId: string) => `/webapps/${enc(webAppId)}`;

export async function fetchDeploymentTracks(webAppId: string): Promise<DeploymentTrack[]> {
  return webAppHostingClient.get<DeploymentTrack[]>(`${base(webAppId)}/tracks`);
}

/** Branches of the web app's Git repository (from the Git provider). */
export async function fetchRepoBranches(webAppId: string): Promise<string[]> {
  return webAppHostingClient.get<string[]>(`${base(webAppId)}/branches`);
}

/** Creates a track from a branch and starts its first build. Rejects with a 402 HttpError when over quota. */
export async function createDeploymentTrack(webAppId: string, input: CreateDeploymentTrackInput): Promise<DeploymentTrack> {
  return webAppHostingClient.post<DeploymentTrack>(`${base(webAppId)}/tracks`, input);
}

export async function checkDeploymentTrackDeletable(webAppId: string, trackId: string): Promise<TrackDeletableResult> {
  return webAppHostingClient.get<TrackDeletableResult>(`${base(webAppId)}/tracks/${enc(trackId)}/deletable`);
}

export async function deleteDeploymentTrack(webAppId: string, trackId: string): Promise<void> {
  await webAppHostingClient.delete<void>(`${base(webAppId)}/tracks/${enc(trackId)}`);
}

export async function updateAutoDeploy(webAppId: string, trackId: string, autoDeploy: boolean): Promise<DeploymentTrack> {
  return webAppHostingClient.put<DeploymentTrack>(`${base(webAppId)}/tracks/${enc(trackId)}/auto-deploy`, { autoDeploy });
}
