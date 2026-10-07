/** Capped at 24h: Prometheus on the WSO2 Cloud observability plane keeps metrics for 3 days by default. */
export type MetricsRange = '30m' | '1h' | '6h' | '24h';

export const METRICS_RANGES: { value: MetricsRange; label: string }[] = [
  { value: '30m', label: 'Last 30 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
];

export const METRICS_REFRESH_INTERVALS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
];

/** One chart row: an x-axis `label` plus one numeric value per series key. */
export type MetricsDatum = { label: string } & Record<string, number | string>;

export interface WebAppMetrics {
  /** requests per second: total, success (2xx/3xx) */
  requestRows: MetricsDatum[];
  /** milliseconds: p50, p95, p99 */
  latencyRows: MetricsDatum[];
  /** percent of requests: clientErrors (4xx), serverErrors (5xx) */
  errorRows: MetricsDatum[];
  /** vCPU: usage, request, limit */
  cpuRows: MetricsDatum[];
  /** MB: usage, request, limit */
  memoryRows: MetricsDatum[];
}
