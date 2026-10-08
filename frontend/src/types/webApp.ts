export type WebAppStatus = 'active' | 'deploying' | 'not-deployed' | 'failed';

export type WebAppSourceType = 'github' | 'public-git' | 'docker';

export type BuildPreset = 'nodejs' | 'react' | 'angular' | 'dotnet' | 'vuejs' | 'python' | 'go' | 'ruby' | 'php' | 'springboot' | 'static' | 'docker';

export interface WebApp {
  id: string;
  handler: string;
  displayName: string;
  description?: string;
  framework: string;
  buildPreset?: BuildPreset;
  /** Project the web app lives in. */
  projectId?: string;
  /** The default deployment track (an OpenChoreo Component name). */
  defaultTrackId?: string;
  url?: string;
  status: WebAppStatus;
  updatedAt: string;
  sourceType: WebAppSourceType;
  repoUrl?: string;
  latestCommit?: {
    sha: string;
    message: string;
    author: string;
    committedAt: string;
  };
}

export interface CreateWebAppGitInput {
  sourceType: 'github' | 'public-git';
  gitOrganization?: string;
  repository: string;
  /** GitHub App installation that grants access to the repository (sourceType `github`). */
  installationId?: number;
  branch: string;
  componentDirectory: string;
  displayName: string;
  handler: string;
  description?: string;
  buildPreset: BuildPreset;
  /** SPA presets (React/Angular/Vue) only. */
  buildCommand?: string;
  /** SPA output directory, or the static site's directory to serve. */
  buildPath?: string;
  /** SPA presets and NodeJS. */
  nodeVersion?: string;
  /** Ignored for SPA/static presets (always 8080). */
  port: number;
  /** Docker preset: both paths relative to `componentDirectory`. */
  docker?: DockerBuild;
}

export interface DockerBuild {
  filePath?: string;
  context?: string;
}

export interface CreateWebAppDockerInput {
  sourceType: 'docker';
  displayName: string;
  handler: string;
  description?: string;
  /** A publicly pullable image without the tag, e.g. `nginxinc/nginx-unprivileged` or `ghcr.io/org/app`. */
  image: string;
  tag: string;
  port: number;
}

/** Samples are created as public-Git web apps (`utils/sampleInput`). */
export type CreateWebAppInput = CreateWebAppGitInput | CreateWebAppDockerInput;

export interface Build {
  id: string;
  status: 'success' | 'failed' | 'in-progress';
  commitSha: string;
  commitMessage: string;
  triggeredAt: string;
}

/** An environment of the project's deployment pipeline (e.g. `development`). */
export type EnvironmentId = string;

export interface EnvironmentDeployment {
  environment: EnvironmentId;
  deployed: boolean;
  status?: WebAppStatus;
}
