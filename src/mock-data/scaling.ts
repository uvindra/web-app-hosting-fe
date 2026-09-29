import type { ReplicaPod, ScalingConfig } from '../types/scaling';
import type { EnvironmentId } from '../types/webApp';

export const DEFAULT_SCALING: ScalingConfig = {
  method: 'ScaleToZero',
  scaleToZero: { maxReplicas: 3, targetPendingRequests: 100 },
  hpa: { minReplicas: 1, maxReplicas: 3, cpuUtilization: 50 },
  fixedReplicas: 1,
};

export const MOCK_SCALING: Record<string, Partial<Record<EnvironmentId, ScalingConfig>>> = {
  'webapp-admin-dashboard': {
    development: {
      ...DEFAULT_SCALING,
      method: 'HPA',
      hpa: { minReplicas: 1, maxReplicas: 4, cpuUtilization: 60, memoryUtilization: 75 },
    },
  },
};

const MINUTES = 60 * 1000;

/** Replicas currently running, keyed by web app id then environment. Undeployed environments have none. */
export function mockReplicas(webAppId: string, environment: EnvironmentId, deployed: boolean, config: ScalingConfig): ReplicaPod[] {
  if (!deployed) return [];
  const suffix = webAppId.replace(/^webapp-/, '');
  const count = config.method === 'None' ? config.fixedReplicas : config.method === 'HPA' ? config.hpa.minReplicas : 1;
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    name: `${suffix}-${environment === 'development' ? 'dev' : 'prod'}-7c9d8b6f54-${['x4k2p', 'q9w7m', 'b5t8n', 'h2v6z', 'r3c1j'][i % 5]}`,
    status: 'Running' as const,
    readyContainers: 1,
    totalContainers: 1,
    restarts: i === 0 ? 0 : i % 2,
    cpuUsage: 0.01 + i * 0.008,
    memoryUsageMb: 42 + i * 9,
    startedAt: new Date(now - (35 + i * 140) * MINUTES).toISOString(),
  }));
}
