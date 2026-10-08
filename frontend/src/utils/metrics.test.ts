import { describe, expect, it } from 'vitest';
import { allocationSeriesName, bucketLabel } from './metrics';

describe('allocationSeriesName', () => {
  it('names the replica count behind a request/limit line', () => {
    expect(allocationSeriesName('CPU limit', 1)).toBe('CPU limit (1 replica)');
    expect(allocationSeriesName('Memory request', 3)).toBe('Memory request (3 replicas)');
  });
  it('keeps the plain name until the count is known', () => {
    expect(allocationSeriesName('CPU limit', undefined)).toBe('CPU limit');
  });
});

describe('bucketLabel', () => {
  it('uses the time of day', () => {
    const t = new Date(2026, 2, 5, 9, 7).getTime();
    expect(bucketLabel(t)).toBe('09:07');
  });
});
