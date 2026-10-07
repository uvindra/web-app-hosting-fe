import type { MetricsRange, WebAppMetrics } from '../types/metrics';
import type { EnvironmentId } from '../types/webApp';
import { generateMetrics } from '../mock-data/metrics';

// STUB (P1) — no backend yet; the Health Checks / Metrics pages show a "coming soon" notice instead.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchMetrics(webAppId: string, environment: EnvironmentId, range: MetricsRange): Promise<WebAppMetrics> {
  await delay(NETWORK_DELAY_MS);
  return generateMetrics(`${webAppId}:${environment}`, range);
}
