import type { HealthCheck, Probe } from '../types/healthChecks';
import type { EnvironmentId } from '../types/webApp';

const httpProbe = (path: string, overrides: Partial<Probe> = {}): Probe => ({
  type: 'httpGet',
  failureThreshold: 3,
  successThreshold: 1,
  initialDelaySeconds: 10,
  periodSeconds: 30,
  timeoutSeconds: 10,
  httpGet: { path, port: 8080, httpHeaders: [] },
  ...overrides,
});

/** Keyed by webApp id, then environment. */
export const MOCK_HEALTH_CHECKS: Record<string, Partial<Record<EnvironmentId, HealthCheck>>> = {
  'webapp-my-portfolio': {
    development: { livenessProbe: httpProbe('/healthz'), readinessProbe: httpProbe('/', { periodSeconds: 15, successThreshold: 2 }) },
    production: {},
  },
  'webapp-admin-dashboard': {
    development: { readinessProbe: httpProbe('/index.html', { httpGet: { path: '/index.html', port: 8080, httpHeaders: [{ name: 'Accept', value: 'text/html' }] } }) },
  },
};

/** Web apps without an entry start with a single readiness probe in development and nothing elsewhere. */
export function defaultHealthCheck(environment: EnvironmentId): HealthCheck {
  return environment === 'development' ? { readinessProbe: httpProbe('/') } : {};
}
