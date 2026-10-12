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
  /** The org's default project: it cannot be deleted. */
  isDefault?: boolean;
  /** Components of every product in the project (only on a single-project read); it deletes only when 0. */
  componentCount?: number;
}

export interface CreateProjectInput {
  orgHandle: string;
  name: string;
  handler: string;
  description?: string;
}
