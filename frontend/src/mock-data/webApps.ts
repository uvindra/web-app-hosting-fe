import type { WebApp } from '../types/webApp';

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;
const now = Date.now();

export const MOCK_WEB_APPS: Record<string, WebApp[]> = {
  'proj-default': [
    {
      id: 'webapp-my-portfolio',
      handler: 'my-portfolio',
      displayName: 'my-portfolio',
      framework: 'React',
      url: 'my-portfolio-dev.webapp.wso2.com',
      status: 'active',
      updatedAt: new Date(now - 2 * HOURS).toISOString(),
      sourceType: 'github',
      repoUrl: 'https://github.com/amiladesilva/my-portfolio',
      latestCommit: {
        sha: '7fb07eb',
        message: 'Add test message to readme',
        author: 'Amila De Silva',
        committedAt: new Date(now - 3 * HOURS).toISOString(),
      },
    },
    {
      id: 'webapp-admin-dashboard',
      handler: 'admin-dashboard',
      displayName: 'admin-dashboard',
      framework: 'Next.js',
      url: 'admin-dash-dev.webapp.wso2.com',
      status: 'active',
      updatedAt: new Date(now - 1 * DAYS).toISOString(),
      sourceType: 'github',
      repoUrl: 'https://github.com/amiladesilva/admin-dashboard',
      latestCommit: {
        sha: 'a3c9f21',
        message: 'Update dashboard widgets',
        author: 'Amila De Silva',
        committedAt: new Date(now - 26 * HOURS).toISOString(),
      },
    },
  ],
  'proj-my-portfolio': [
    {
      id: 'webapp-portfolio-site',
      handler: 'portfolio-site',
      displayName: 'portfolio-site',
      framework: 'Vue',
      url: 'portfolio-site-dev.webapp.wso2.com',
      status: 'active',
      updatedAt: new Date(now - 1 * DAYS).toISOString(),
      sourceType: 'github',
      repoUrl: 'https://github.com/amiladesilva/portfolio-site',
    },
  ],
  'proj-ecommerce-frontend': [
    {
      id: 'webapp-storefront',
      handler: 'storefront',
      displayName: 'storefront',
      framework: 'Angular',
      status: 'deploying',
      updatedAt: new Date(now - 5 * DAYS).toISOString(),
      sourceType: 'public-git',
      repoUrl: 'https://github.com/amiladesilva/storefront',
    },
  ],
};
