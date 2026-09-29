import { describe, expect, it } from 'vitest';
import { formatBuildDuration, getBuildStatusColor, getBuildStatusLabel } from './buildFormat';

describe('buildFormat', () => {
  it('formats duration', () => {
    expect(formatBuildDuration({ triggeredAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:01:05Z' })).toBe('1m 05s');
    expect(formatBuildDuration({ triggeredAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:42Z' })).toBe('42s');
    expect(formatBuildDuration({ triggeredAt: '2026-01-01T00:00:00Z' })).toBe('');
  });
  it('maps status', () => {
    expect(getBuildStatusLabel('in-progress')).toBe('In Progress');
    expect(getBuildStatusColor('failed')).toBe('error');
  });
});
