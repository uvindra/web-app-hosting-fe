import type { MetricsDatum, MetricsRange, Usage, WebAppMetrics } from '../types/metrics';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { envPath } from './trackPath';
import { bucketLabel } from '../utils/metrics';

/** BFF rows carry an RFC 3339 `time`; the x-axis label is the viewer's local time of day. */
type RawRow = { time: string } & Record<string, number | string>;
type RawMetrics = Omit<WebAppMetrics, 'requestRows' | 'latencyRows' | 'errorRows' | 'cpuRows' | 'memoryRows'> & Record<'requestRows' | 'latencyRows' | 'errorRows' | 'cpuRows' | 'memoryRows', RawRow[]>;

const label = (rows: RawRow[]): MetricsDatum[] => rows.map((r) => ({ ...r, label: bucketLabel(Date.parse(r.time)) }));

export async function fetchMetrics(track: TrackRef, environment: EnvironmentId, range: MetricsRange): Promise<WebAppMetrics> {
  const raw = await webAppHostingClient.get<RawMetrics>(`${envPath(track, environment)}/metrics?${new URLSearchParams({ range })}`);
  return {
    httpAvailable: raw.httpAvailable,
    requestRows: label(raw.requestRows),
    latencyRows: label(raw.latencyRows),
    errorRows: label(raw.errorRows),
    cpuRows: label(raw.cpuRows),
    memoryRows: label(raw.memoryRows),
  };
}

/** Latest CPU/memory usage, totals across the environment's pods. */
export async function fetchUsage(track: TrackRef, environment: EnvironmentId): Promise<Usage> {
  return webAppHostingClient.get<Usage>(`${envPath(track, environment)}/usage`);
}
