import type { DeployBuildInput, Deployment, PromoteInput } from '../types/deployment';
import type { EnvironmentDeployment, EnvironmentId } from '../types/webApp';
import { ENVIRONMENT_IDS } from '../constants/environments';
import { buildWebAppUrl, MOCK_DEPLOYMENTS } from '../mock-data/deployments';

// STUB — see src/api/projects.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** How long a fake rollout stays in "deploying" before flipping to "active". */
const ROLLOUT_MS = 3000;

// In-memory copy of the mock data so deploy/promote/stop mutations persist for the session.
const store: Record<string, Deployment[]> = Object.fromEntries(Object.entries(MOCK_DEPLOYMENTS).map(([id, list]) => [id, [...list]]));
let nextId = 1;

function historyOf(webAppId: string): Deployment[] {
  const existing = store[webAppId];
  if (existing) return existing;
  const created: Deployment[] = [];
  store[webAppId] = created;
  return created;
}

function currentOf(webAppId: string, environment: EnvironmentId): Deployment | undefined {
  return historyOf(webAppId).find((d) => d.environment === environment);
}

function addDeployment(webAppId: string, environment: EnvironmentId, source: Pick<Deployment, 'buildId' | 'commitSha' | 'commitMessage'>): Deployment {
  const deployment: Deployment = {
    id: `dep-${webAppId}-${nextId++}`,
    environment,
    buildId: source.buildId,
    commitSha: source.commitSha,
    commitMessage: source.commitMessage,
    status: 'deploying',
    deployedAt: new Date().toISOString(),
    url: buildWebAppUrl(webAppId, environment),
  };
  historyOf(webAppId).unshift(deployment);
  setTimeout(() => {
    deployment.status = 'active';
  }, ROLLOUT_MS);
  return deployment;
}

/** Derives the per-environment summary (used by Overview data / useEnvironments) from the deployment store. */
export function environmentsFromStore(webAppId: string): EnvironmentDeployment[] {
  return ENVIRONMENT_IDS.map((environment) => {
    const current = currentOf(webAppId, environment);
    if (!current || current.status === 'stopped') return { environment, deployed: false };
    return { environment, deployed: true, status: current.status };
  });
}

export async function fetchDeployments(webAppId: string): Promise<Deployment[]> {
  await delay(NETWORK_DELAY_MS);
  return historyOf(webAppId).map((d) => ({ ...d }));
}

export async function deployBuild(webAppId: string, input: DeployBuildInput): Promise<Deployment> {
  await delay(NETWORK_DELAY_MS);
  return { ...addDeployment(webAppId, input.environment, { buildId: input.build.id, commitSha: input.build.commitSha, commitMessage: input.build.commitMessage }) };
}

export async function promoteDeployment(webAppId: string, input: PromoteInput): Promise<Deployment> {
  await delay(NETWORK_DELAY_MS);
  const source = currentOf(webAppId, input.sourceEnvironment);
  if (!source || source.status !== 'active') throw new Error('Nothing to promote: the source environment has no active deployment.');
  return { ...addDeployment(webAppId, input.targetEnvironment, source) };
}

export async function redeployDeployment(webAppId: string, environment: EnvironmentId): Promise<Deployment> {
  await delay(NETWORK_DELAY_MS);
  const current = currentOf(webAppId, environment);
  if (!current) throw new Error('Nothing to redeploy in this environment.');
  return { ...addDeployment(webAppId, environment, current) };
}

export async function stopDeployment(webAppId: string, environment: EnvironmentId): Promise<Deployment> {
  await delay(NETWORK_DELAY_MS);
  const current = currentOf(webAppId, environment);
  if (!current) throw new Error('Nothing to stop in this environment.');
  current.status = 'stopped';
  return { ...current };
}
