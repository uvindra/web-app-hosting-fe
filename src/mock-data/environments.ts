import type { EnvironmentDeployment } from '../types/webApp';

/** Keyed by webApp id. Newly-created web apps simply have no entry (→ both environments "not deployed"). */
export const MOCK_ENVIRONMENTS: Record<string, EnvironmentDeployment[]> = {
  'webapp-my-portfolio': [
    { environment: 'development', deployed: true, status: 'active' },
    { environment: 'production', deployed: false },
  ],
  'webapp-admin-dashboard': [
    { environment: 'development', deployed: true, status: 'active' },
    { environment: 'production', deployed: false },
  ],
  'webapp-portfolio-site': [
    { environment: 'development', deployed: true, status: 'active' },
    { environment: 'production', deployed: false },
  ],
  'webapp-storefront': [
    { environment: 'development', deployed: true, status: 'deploying' },
    { environment: 'production', deployed: false },
  ],
};

export const DEFAULT_ENVIRONMENTS: EnvironmentDeployment[] = [
  { environment: 'development', deployed: false },
  { environment: 'production', deployed: false },
];
