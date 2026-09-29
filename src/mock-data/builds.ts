import type { Build } from '../types/webApp';

const HOURS = 60 * 60 * 1000;
const now = Date.now();

/** Keyed by webApp id. Newly-created web apps simply have no entry (→ empty array), matching "No builds yet." */
export const MOCK_BUILDS: Record<string, Build[]> = {
  'webapp-my-portfolio': [
    {
      id: 'build-my-portfolio-1',
      status: 'success',
      commitSha: '7fb07eb',
      commitMessage: 'Add test message to readme',
      triggeredAt: new Date(now - 2 * HOURS).toISOString(),
    },
  ],
  'webapp-admin-dashboard': [
    {
      id: 'build-admin-dashboard-1',
      status: 'success',
      commitSha: 'a3c9f21',
      commitMessage: 'Update dashboard widgets',
      triggeredAt: new Date(now - 25 * HOURS).toISOString(),
    },
  ],
};
