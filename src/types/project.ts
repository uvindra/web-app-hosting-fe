export type ProjectStatus = 'active' | 'deploying';

export interface Project {
  id: string;
  handler: string;
  name: string;
  description?: string;
  updatedAt: string;
  activeWebAppCount: number;
  status: ProjectStatus;
  deleting?: boolean;
}

export interface CreateProjectInput {
  orgHandle: string;
  name: string;
  handler: string;
  description?: string;
}
