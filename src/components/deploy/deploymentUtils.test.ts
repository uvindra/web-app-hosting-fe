import { describe, expect, it } from 'vitest';
import type { Deployment } from '../../types/deployment';
import { currentDeployment, historyFor } from './deploymentUtils';

const dep = (id: string, environment: Deployment['environment']): Deployment => ({
  id,
  environment,
  buildId: 'b',
  commitSha: 's',
  commitMessage: 'm',
  status: 'active',
  deployedAt: '2026-01-01T00:00:00Z',
  url: 'https://x.dev',
});

describe('deploymentUtils', () => {
  const list = [dep('3', 'development'), dep('2', 'production'), dep('1', 'development')];
  it('returns the newest deployment per environment', () => {
    expect(currentDeployment(list, 'development')?.id).toBe('3');
    expect(currentDeployment(list, 'production')?.id).toBe('2');
  });
  it('filters history by environment', () => {
    expect(historyFor(list, 'development').map((d) => d.id)).toEqual(['3', '1']);
  });
  it('returns undefined when never deployed', () => {
    expect(currentDeployment([], 'production')).toBeUndefined();
  });
});
