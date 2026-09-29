import type { CustomDomainMapping } from '../types/urlSettings';

const DAYS = 24 * 60 * 60 * 1000;
const now = Date.now();

export const MOCK_CUSTOM_DOMAINS: Record<string, CustomDomainMapping[]> = {
  'webapp-my-portfolio': [
    { id: 'dom-1', environment: 'production', domain: 'www.amila.dev', status: 'verified', cnameTarget: 'my-portfolio-production.choreoapps.dev', createdAt: new Date(now - 30 * DAYS).toISOString() },
    { id: 'dom-2', environment: 'production', domain: 'portfolio.example.org', status: 'pending', cnameTarget: 'my-portfolio-production.choreoapps.dev', createdAt: new Date(now - 1 * DAYS).toISOString() },
  ],
};
