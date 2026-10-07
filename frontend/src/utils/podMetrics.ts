import type { Pod, UsageSummary } from '../types/runtime';

/** Millicores -> "0.25 vCPU". */
export function formatMillicores(millicores: number): string {
  return `${(millicores / 1000).toFixed(2)} vCPU`;
}

/** Bytes -> binary-unit string ("128.00 MiB"). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 Bytes';
  const units = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

/** Used/limit as a 0-100 integer, clamped; 0 when there is no limit. */
export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function summarize(used: number, limit: number): UsageSummary {
  return { used, limit, percent: usagePercent(used, limit) };
}

/** Aggregate CPU/memory usage across all pods. */
export function aggregateUsage(pods: Pod[]): { cpu: UsageSummary; memory: UsageSummary } {
  const sum = (pick: (p: Pod) => number): number => pods.reduce((total, p) => total + pick(p), 0);
  return {
    cpu: summarize(
      sum((p) => p.cpuUsageMillicores),
      sum((p) => p.cpuLimitMillicores),
    ),
    memory: summarize(
      sum((p) => p.memoryUsageBytes),
      sum((p) => p.memoryLimitBytes),
    ),
  };
}
