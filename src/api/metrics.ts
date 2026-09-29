import type { MetricsRange, WebAppMetrics } from '../types/metrics';
import type { EnvironmentId } from '../types/webApp';
import { generateMetrics } from '../mock-data/metrics';

// STUB — see src/api/builds.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchMetrics(webAppId: string, environment: EnvironmentId, range: MetricsRange): Promise<WebAppMetrics> {
  await delay(NETWORK_DELAY_MS);
  return generateMetrics(`${webAppId}:${environment}`, range);
}
