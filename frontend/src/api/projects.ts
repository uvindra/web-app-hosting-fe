import type { CreateProjectInput, Project } from '../types/project';
import type { Environment } from '../types/environment';
import { webAppHostingClient } from './httpClient';

const enc = encodeURIComponent;

/** The org comes from the access token, so `orgHandle` only scopes the query cache. */
export async function fetchProjects(orgHandle: string): Promise<Project[]> {
  void orgHandle;
  return webAppHostingClient.get<Project[]>('/projects');
}

export async function fetchProject(projectId: string): Promise<Project | null> {
  return webAppHostingClient.get<Project>(`/projects/${enc(projectId)}`);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return webAppHostingClient.post<Project>('/projects', { name: input.name, handler: input.handler, description: input.description });
}

/** The project's deployment-pipeline environments, in promotion order. */
export async function fetchProjectEnvironments(projectId: string): Promise<Environment[]> {
  return webAppHostingClient.get<Environment[]>(`/projects/${enc(projectId)}/environments`);
}
