/**
 * Web app scaling, configured per environment. Scale-to-zero is deliberately not offered: it needs KEDA on
 * the WSO2 Cloud data plane, which is deferred (see ADAPTATION_NOTES.md).
 */

export const ScalingMethod = {
  HPA: 'HPA',
  None: 'None',
} as const;
export type ScalingMethod = (typeof ScalingMethod)[keyof typeof ScalingMethod];

export interface HpaSettings {
  minReplicas: number;
  maxReplicas: number;
  /** Target CPU utilization percentage; undefined when the CPU metric is disabled. */
  cpuUtilization?: number;
  /** Target memory utilization percentage; undefined when the memory metric is disabled. */
  memoryUtilization?: number;
}

export interface ScalingConfig {
  method: ScalingMethod;
  hpa: HpaSettings;
  /** Used when method is None. */
  fixedReplicas: number;
}

export interface ReplicaPod {
  name: string;
  status: 'Running' | 'Pending' | 'Terminating';
  readyContainers: number;
  totalContainers: number;
  restarts: number;
  /** vCPU, e.g. 0.02. Set only for a single replica (usage is reported as totals). */
  cpuUsage?: number;
  /** MB. As cpuUsage. */
  memoryUsageMb?: number;
  startedAt: string;
}
