import { describe, expect, it } from 'vitest';
import { RANGE_CONFIG, bucketLabel, bucketTimes, round, scaleRows, seededRandom } from './metrics';

describe('bucketTimes', () => {
  it('returns one timestamp per point, oldest first, ending at now', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const times = bucketTimes('1h', now);
    expect(times).toHaveLength(RANGE_CONFIG['1h'].points);
    expect(times[times.length - 1]).toBe(now);
    expect(times[0]).toBeLessThan(times[1]);
  });
});

describe('bucketLabel', () => {
  it('uses time of day up to 24h and adds the date for 7d', () => {
    const t = new Date(2026, 2, 5, 9, 7).getTime();
    expect(bucketLabel(t, '24h')).toBe('09:07');
    expect(bucketLabel(t, '7d')).toBe('3/5 09:07');
  });
});

describe('seededRandom', () => {
  it('is deterministic per seed and within [0, 1)', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    const values = [a(), a(), a()];
    expect(values).toEqual([b(), b(), b()]);
    values.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
    expect(seededRandom('y')()).not.toBe(values[0]);
  });
});

describe('scaleRows', () => {
  it('scales only the given numeric keys', () => {
    const rows = [{ label: '10:00', usage: 2048, other: 5 }];
    expect(scaleRows(rows, ['usage'], 1024)).toEqual([{ label: '10:00', usage: 2, other: 5 }]);
  });
});

describe('round', () => {
  it('rounds to decimals', () => expect(round(1.23456, 2)).toBe(1.23));
});
