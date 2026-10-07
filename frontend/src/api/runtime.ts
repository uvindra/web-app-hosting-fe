import type { Pod, PodEvent, ReleaseDetails } from '../types/runtime';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { envPath } from './trackPath';

const enc = encodeURIComponent;

export async function fetchReleaseDetails(track: TrackRef, env: EnvironmentId): Promise<ReleaseDetails> {
  return webAppHostingClient.get<ReleaseDetails>(`${envPath(track, env)}/release`);
}

export async function fetchPods(track: TrackRef, env: EnvironmentId): Promise<Pod[]> {
  return webAppHostingClient.get<Pod[]>(`${envPath(track, env)}/pods`);
}

export async function fetchPodEvents(track: TrackRef, env: EnvironmentId, podName: string): Promise<PodEvent[]> {
  return webAppHostingClient.get<PodEvent[]>(`${envPath(track, env)}/pods/${enc(podName)}/events`);
}

export async function fetchPodLogs(track: TrackRef, env: EnvironmentId, podName: string): Promise<string[]> {
  return webAppHostingClient.get<string[]>(`${envPath(track, env)}/pods/${enc(podName)}/logs`);
}

/** Rolling restart of the environment (re-applies its binding). */
export async function redeployRelease(track: TrackRef, env: EnvironmentId): Promise<ReleaseDetails> {
  await webAppHostingClient.post(`${envPath(track, env)}/redeploy`);
  return fetchReleaseDetails(track, env);
}
