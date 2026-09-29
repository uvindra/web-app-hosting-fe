/** Web app scaling, configured per environment. Scale-to-zero is the default method for web apps. */

export const ScalingMethod = {
  ScaleToZero: 'ScaleToZero',
  HPA: 'HPA',
  None: 'None',
} as const;
export type ScalingMethod = (typeof ScalingMethod)[keyof typeof ScalingMethod];

export interface ScaleToZeroSettings {
  maxReplicas: number;
  targetPendingRequests: number;
}

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
  scaleToZero: ScaleToZeroSettings;
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
  /** vCPU, e.g. 0.02 */
  cpuUsage: number;
  /** MB */
  memoryUsageMb: number;
  startedAt: string;
}
