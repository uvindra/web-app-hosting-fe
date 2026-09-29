import type { Pod, PodEvent, ReleaseDetails } from '../types/runtime';
import type { EnvironmentId } from '../types/webApp';
import { buildEvents, buildLogs, buildPods, buildRelease } from '../mock-data/runtime';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const releases = new Map<string, ReleaseDetails>();
const key = (webAppId: string, env: EnvironmentId): string => `${webAppId}:${env}`;

export async function fetchReleaseDetails(webAppId: string, env: EnvironmentId): Promise<ReleaseDetails> {
  await delay(NETWORK_DELAY_MS);
  return releases.get(key(webAppId, env)) ?? buildRelease(webAppId, env);
}

export async function fetchPods(webAppId: string, env: EnvironmentId): Promise<Pod[]> {
  await delay(NETWORK_DELAY_MS);
  return buildPods(webAppId, env);
}

export async function fetchPodEvents(webAppId: string, env: EnvironmentId, podName: string): Promise<PodEvent[]> {
  await delay(NETWORK_DELAY_MS);
  void [webAppId, env, podName];
  return buildEvents();
}

export async function fetchPodLogs(webAppId: string, env: EnvironmentId, podName: string): Promise<string[]> {
  await delay(NETWORK_DELAY_MS);
  void [webAppId, env, podName];
  return buildLogs();
}

export async function redeployRelease(webAppId: string, env: EnvironmentId): Promise<ReleaseDetails> {
  await delay(NETWORK_DELAY_MS);
  const next = { ...(releases.get(key(webAppId, env)) ?? buildRelease(webAppId, env)), deployedAt: new Date().toISOString() };
  releases.set(key(webAppId, env), next);
  return next;
}
