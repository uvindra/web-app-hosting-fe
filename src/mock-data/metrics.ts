import type { MetricsRange, WebAppMetrics } from '../types/metrics';
import { bucketLabel, bucketTimes, round, seededRandom } from '../utils/metrics';

/** Generates a plausible traffic curve for a web app (a daily wave plus noise), deterministic per seed. */
export function generateMetrics(seed: string, range: MetricsRange, now: number = Date.now()): WebAppMetrics {
  const rand = seededRandom(seed);
  const baseRps = 4 + rand() * 10;
  const baseLatency = 25 + rand() * 30;
  const baseMemory = 60 + rand() * 40;
  const errorProneness = rand();

  const requestRows: WebAppMetrics['requestRows'] = [];
  const latencyRows: WebAppMetrics['latencyRows'] = [];
  const errorRows: WebAppMetrics['errorRows'] = [];
  const cpuRows: WebAppMetrics['cpuRows'] = [];
  const memoryRows: WebAppMetrics['memoryRows'] = [];

  bucketTimes(range, now).forEach((time) => {
    const label = bucketLabel(time);
    const hour = new Date(time).getHours() + new Date(time).getMinutes() / 60;
    // Traffic peaks mid-afternoon and dips overnight.
    const wave = 0.65 + 0.35 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    const rps = Math.max(0.2, baseRps * wave * (0.85 + rand() * 0.3));
    const p50 = baseLatency * (0.9 + rand() * 0.25) * (1 + (rps / baseRps - 1) * 0.3);
    const clientErrors = 0.4 + rand() * 1.6 * errorProneness;
    const serverErrors = rand() > 0.9 ? 0.5 + rand() * 1.5 * errorProneness : rand() * 0.15;
    const failedShare = (clientErrors + serverErrors) / 100;

    requestRows.push({ label, total: round(rps), success: round(rps * (1 - failedShare)) });
    latencyRows.push({ label, p50: round(p50, 1), p95: round(p50 * (2.2 + rand() * 0.6), 1), p99: round(p50 * (4 + rand() * 1.5), 1) });
    errorRows.push({ label, clientErrors: round(clientErrors), serverErrors: round(serverErrors) });
    cpuRows.push({ label, usage: round(0.02 + 0.06 * wave * (0.8 + rand() * 0.4), 3), request: 0.1, limit: 0.25 });
    memoryRows.push({ label, usage: round(baseMemory + 12 * wave + rand() * 6, 1), request: 128, limit: 256 });
  });

  return { requestRows, latencyRows, errorRows, cpuRows, memoryRows };
}
