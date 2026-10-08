import { describe, expect, it } from 'vitest';
import { bucketLabel } from './metrics';

describe('bucketLabel', () => {
  it('uses the time of day', () => {
    const t = new Date(2026, 2, 5, 9, 7).getTime();
    expect(bucketLabel(t)).toBe('09:07');
  });
});
