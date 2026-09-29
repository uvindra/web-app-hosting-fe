import type { ReplicaPod, ScalingConfig } from '../types/scaling';
import type { EnvironmentId } from '../types/webApp';
import { DEFAULT_SCALING, MOCK_SCALING, mockReplicas } from '../mock-data/scaling';
import { environmentsFromStore } from './deployments';

// STUB — see src/api/builds.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const store: Record<string, ScalingConfig> = {};
const keyOf = (webAppId: string, environment: EnvironmentId) => `${webAppId}:${environment}`;

function current(webAppId: string, environment: EnvironmentId): ScalingConfig {
  return store[keyOf(webAppId, environment)] ?? MOCK_SCALING[webAppId]?.[environment] ?? DEFAULT_SCALING;
}

export async function fetchScaling(webAppId: string, environment: EnvironmentId): Promise<ScalingConfig> {
  await delay(NETWORK_DELAY_MS);
  return current(webAppId, environment);
}

export async function updateScaling(webAppId: string, environment: EnvironmentId, data: ScalingConfig): Promise<ScalingConfig> {
  await delay(NETWORK_DELAY_MS);
  store[keyOf(webAppId, environment)] = data;
  return data;
}

export async function fetchReplicas(webAppId: string, environment: EnvironmentId): Promise<ReplicaPod[]> {
  await delay(NETWORK_DELAY_MS);
  const deployed = environmentsFromStore(webAppId).find((e) => e.environment === environment)?.deployed === true;
  return mockReplicas(webAppId, environment, deployed, current(webAppId, environment));
}
