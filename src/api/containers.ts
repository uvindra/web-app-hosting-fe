import type { ContainerUpdate, WebAppContainer } from '../types/containers';
import type { EnvironmentId } from '../types/webApp';
import { buildContainers } from '../mock-data/containers';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const store = new Map<string, WebAppContainer[]>();
const key = (webAppId: string, env: EnvironmentId): string => `${webAppId}:${env}`;

function load(webAppId: string, env: EnvironmentId): WebAppContainer[] {
  const existing = store.get(key(webAppId, env));
  if (existing) return existing;
  const fresh = buildContainers(webAppId, env);
  store.set(key(webAppId, env), fresh);
  return fresh;
}

export async function fetchContainers(webAppId: string, env: EnvironmentId): Promise<WebAppContainer[]> {
  await delay(NETWORK_DELAY_MS);
  return load(webAppId, env);
}

export async function updateContainer(webAppId: string, env: EnvironmentId, containerId: string, update: ContainerUpdate): Promise<WebAppContainer> {
  await delay(NETWORK_DELAY_MS);
  const list = load(webAppId, env);
  const idx = list.findIndex((c) => c.id === containerId);
  if (idx < 0) throw new Error('Container not found.');
  const next = { ...list[idx], ...update, updatedAt: new Date().toISOString() };
  store.set(
    key(webAppId, env),
    list.map((c, i) => (i === idx ? next : c)),
  );
  return next;
}
