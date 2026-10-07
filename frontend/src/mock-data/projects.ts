import type { Project } from '../types/project';

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;
const now = Date.now();

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-default',
    handler: 'default-project',
    name: 'Default Project',
    updatedAt: new Date(now - 3 * HOURS).toISOString(),
    activeWebAppCount: 2,
    status: 'active',
  },
  {
    id: 'proj-my-portfolio',
    handler: 'my-portfolio',
    name: 'My Portfolio',
    updatedAt: new Date(now - 1 * DAYS).toISOString(),
    activeWebAppCount: 1,
    status: 'active',
  },
  {
    id: 'proj-ecommerce-frontend',
    handler: 'e-commerce-frontend',
    name: 'E-Commerce Frontend',
    updatedAt: new Date(now - 5 * DAYS).toISOString(),
    activeWebAppCount: 0,
    status: 'deploying',
  },
];
