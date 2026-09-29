import type { Build, EnvironmentDeployment } from '../types/webApp';
import { MOCK_BUILDS } from '../mock-data/builds';
import { DEFAULT_ENVIRONMENTS, MOCK_ENVIRONMENTS } from '../mock-data/environments';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchBuilds(webAppId: string): Promise<Build[]> {
  await delay(NETWORK_DELAY_MS);
  return MOCK_BUILDS[webAppId] ?? [];
}

export async function fetchEnvironments(webAppId: string): Promise<EnvironmentDeployment[]> {
  await delay(NETWORK_DELAY_MS);
  return MOCK_ENVIRONMENTS[webAppId] ?? DEFAULT_ENVIRONMENTS;
}
