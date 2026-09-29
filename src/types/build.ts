import type { BuildPreset } from './webApp';

export type BuildRunStatus = 'success' | 'failed' | 'in-progress';

export type BuildStepStatus = 'success' | 'failed' | 'in-progress' | 'pending';

export interface BuildStep {
  name: string;
  status: BuildStepStatus;
  logs: string[];
}

export interface BuildRun {
  id: string;
  status: BuildRunStatus;
  commitSha: string;
  commitMessage: string;
  author: string;
  /** Deployment track = branch. */
  branch: string;
  triggeredAt: string;
  completedAt?: string;
  steps: BuildStep[];
}

/** Build settings captured when the web app was created. */
export interface BuildConfig {
  repoUrl: string;
  branch: string;
  componentDirectory: string;
  buildPreset: BuildPreset;
  buildCommand: string;
  buildPath: string;
  nodeVersion?: string;
  port: number;
}

export interface LatestCommit {
  sha: string;
  message: string;
  author: string;
  committedAt: string;
  branch: string;
  repoUrl: string;
}
