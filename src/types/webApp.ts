export type WebAppStatus = 'active' | 'deploying' | 'not-deployed' | 'failed';

export type WebAppSourceType = 'github' | 'public-git' | 'docker' | 'sample';

export type BuildPreset = 'nodejs' | 'react' | 'angular' | 'dotnet' | 'vuejs' | 'python' | 'go' | 'ruby' | 'php' | 'springboot' | 'static' | 'docker';

export interface WebApp {
  id: string;
  handler: string;
  displayName: string;
  framework: string;
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
  branch: string;
  componentDirectory: string;
  displayName: string;
  handler: string;
  description?: string;
  buildPreset: BuildPreset;
  buildCommand: string;
  buildPath: string;
  nodeVersion?: string;
  port: number;
}

export interface CreateWebAppDockerInput {
  sourceType: 'docker';
  displayName: string;
  handler: string;
  description?: string;
  registryType: 'dockerhub' | 'acr' | 'ecr' | 'gcr' | 'ghcr' | 'other';
  image: string;
  tag: string;
  credentialRef?: string;
  port: number;
}

export interface CreateWebAppSampleInput {
  sourceType: 'sample';
  sampleId: string;
  displayName: string;
  handler: string;
}

export type CreateWebAppInput = CreateWebAppGitInput | CreateWebAppDockerInput | CreateWebAppSampleInput;

export interface Build {
  id: string;
  status: 'success' | 'failed' | 'in-progress';
  commitSha: string;
  commitMessage: string;
  triggeredAt: string;
}

export interface EnvironmentDeployment {
  environment: 'development' | 'production';
  deployed: boolean;
  status?: WebAppStatus;
}
