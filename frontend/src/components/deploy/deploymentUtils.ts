import type { Deployment, DeploymentStatus } from '../../types/deployment';
import type { EnvironmentId } from '../../types/webApp';
import type { PaletteColor } from '../../utils/statusColor';

/** Deployments are newest first, so the first match for an environment is its current deployment. */
export function currentDeployment(deployments: Deployment[], environment: EnvironmentId): Deployment | undefined {
  return deployments.find((d) => d.environment === environment);
}

export function historyFor(deployments: Deployment[], environment: EnvironmentId): Deployment[] {
  return deployments.filter((d) => d.environment === environment);
}

export const DEPLOYMENT_STATUS_LABEL: Record<DeploymentStatus, string> = {
  active: 'Active',
  deploying: 'Deploying',
  failed: 'Failed',
  stopped: 'Stopped',
};

export const DEPLOYMENT_STATUS_COLOR: Record<DeploymentStatus, PaletteColor> = {
  active: 'success',
  deploying: 'warning',
  failed: 'error',
  stopped: 'default',
};
