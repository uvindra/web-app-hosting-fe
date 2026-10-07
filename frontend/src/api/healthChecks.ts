import type { HealthCheck } from '../types/healthChecks';
import type { EnvironmentId } from '../types/webApp';
import { MOCK_HEALTH_CHECKS, defaultHealthCheck } from '../mock-data/healthChecks';

// STUB — see src/api/builds.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** In-memory copy so edits persist for the session. */
const store: Record<string, HealthCheck> = {};
const keyOf = (webAppId: string, environment: EnvironmentId) => `${webAppId}:${environment}`;

function current(webAppId: string, environment: EnvironmentId): HealthCheck {
  return store[keyOf(webAppId, environment)] ?? MOCK_HEALTH_CHECKS[webAppId]?.[environment] ?? defaultHealthCheck(environment);
}

export async function fetchHealthCheck(webAppId: string, environment: EnvironmentId): Promise<HealthCheck> {
  await delay(NETWORK_DELAY_MS);
  return current(webAppId, environment);
}

/** Replaces the environment's probes. Omit a probe to remove it. */
export async function updateHealthCheck(webAppId: string, environment: EnvironmentId, data: HealthCheck): Promise<HealthCheck> {
  await delay(NETWORK_DELAY_MS);
  store[keyOf(webAppId, environment)] = data;
  return data;
}
