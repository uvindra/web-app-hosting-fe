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
  cpuUsageMillicores: number;
  cpuLimitMillicores: number;
  memoryUsageBytes: number;
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

export interface UsageSummary {
  used: number;
  limit: number;
  percent: number;
}

export interface RuntimeTarget {
  webAppId: string;
  environment: EnvironmentId;
}
