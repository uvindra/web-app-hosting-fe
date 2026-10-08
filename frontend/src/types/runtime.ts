import type { EnvironmentId } from './webApp';

export interface ReleaseDetails {
  status: 'Running' | 'Deploying' | 'Failed';
  image: string;
  commitSha: string;
  commitMessage: string;
  deployedAt: string;
  port: number;
}

export interface PodCondition {
  type: 'PodScheduled' | 'Initialized' | 'ContainersReady' | 'Ready';
  status: 'True' | 'False';
  lastTransitionTime: string;
}

export interface Pod {
  name: string;
  phase: 'Running' | 'Pending' | 'Failed' | 'Succeeded';
  /** e.g. "1/1" */
  ready: string;
  restarts: number;
  startedAt: string;
  /** Absent until usage metrics exist (P1): `undefined` means "not available", never 0. */
  cpuUsageMillicores?: number;
  /** First container's request/limit; 0 when unset. */
  cpuRequestMillicores: number;
  cpuLimitMillicores: number;
  /** Absent until usage metrics exist (P1). */
  memoryUsageBytes?: number;
  memoryRequestBytes: number;
  memoryLimitBytes: number;
  conditions: PodCondition[];
}

export interface PodEvent {
  type: 'Normal' | 'Warning';
  reason: string;
  message: string;
  count: number;
  lastSeen: string;
}

/** Totals across pods. `used`/`percent` are `undefined` unless every pod reports usage. */
export interface UsageSummary {
  used?: number;
  request: number;
  limit: number;
  percent?: number;
}

export interface RuntimeTarget {
  webAppId: string;
  environment: EnvironmentId;
}
