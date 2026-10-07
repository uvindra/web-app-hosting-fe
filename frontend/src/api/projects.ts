import type { CreateProjectInput, Project } from '../types/project';
import { MOCK_PROJECTS } from '../mock-data/projects';

// STUB — the Web App Hosting backend doesn't exist yet. These resolve from mock-data after an
// artificial delay so the loading states are exercised. Swap each body for a `webAppHostingClient`
// call once the backend exists; signatures are written to match what that call will look like.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let projects = [...MOCK_PROJECTS];

export async function fetchProjects(orgHandle: string): Promise<Project[]> {
  await delay(NETWORK_DELAY_MS);
  void orgHandle; // single mock org for now — every org handle returns the same list
  return projects;
}

export async function fetchProject(projectId: string): Promise<Project | null> {
  await delay(NETWORK_DELAY_MS);
  return projects.find((p) => p.id === projectId) ?? null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  await delay(NETWORK_DELAY_MS);
  const project: Project = {
    id: `proj-${input.handler}`,
    handler: input.handler,
    name: input.name,
    description: input.description,
    updatedAt: new Date().toISOString(),
    activeWebAppCount: 0,
    status: 'active',
  };
  projects = [project, ...projects];
  return project;
}
