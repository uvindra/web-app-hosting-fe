import type { EnvironmentId } from './webApp';

export type DeploymentStatus = 'deploying' | 'active' | 'failed' | 'stopped';

/** One deployment of a build to an environment. History is newest first; the first entry per environment is the current one. */
export interface Deployment {
  id: string;
  environment: EnvironmentId;
  buildId: string;
  commitSha: string;
  commitMessage: string;
  status: DeploymentStatus;
  deployedAt: string;
  url: string;
}

export interface DeployBuildInput {
  environment: EnvironmentId;
  build: { id: string; commitSha: string; commitMessage: string };
}

export interface PromoteInput {
  sourceEnvironment: EnvironmentId;
  targetEnvironment: EnvironmentId;
}
