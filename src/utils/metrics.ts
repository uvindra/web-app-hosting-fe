import type { MetricsDatum, MetricsRange } from '../types/metrics';

const MINUTE_MS = 60 * 1000;

/** Window length and number of chart points per range. */
export const RANGE_CONFIG: Record<MetricsRange, { minutes: number; points: number }> = {
  '30m': { minutes: 30, points: 30 },
  '1h': { minutes: 60, points: 30 },
  '6h': { minutes: 360, points: 36 },
  '24h': { minutes: 1440, points: 48 },
  '7d': { minutes: 10080, points: 56 },
};

/** Timestamps (ms) of each chart point, oldest first, ending at `now`. */
export function bucketTimes(range: MetricsRange, now: number): number[] {
  const { minutes, points } = RANGE_CONFIG[range];
  const step = (minutes * MINUTE_MS) / points;
  return Array.from({ length: points }, (_, i) => Math.round(now - (points - 1 - i) * step));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** X-axis label: time of day for windows up to a day, day plus hour for a week. */
export function bucketLabel(time: number, range: MetricsRange): string {
  const d = new Date(time);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return range === '7d' ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : hm;
}

/** Deterministic pseudo-random generator (mulberry32) so mock charts do not jitter between fetches. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round to a fixed number of decimals. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Scale the given numeric series keys of every row (e.g. bytes to MB). */
export function scaleRows(rows: MetricsDatum[], keys: string[], divisor: number, decimals = 2): MetricsDatum[] {
  return rows.map((row) => {
    const out: MetricsDatum = { ...row };
    keys.forEach((key) => {
      const value = row[key];
      if (typeof value === 'number') out[key] = round(value / divisor, decimals);
    });
    return out;
  });
}
