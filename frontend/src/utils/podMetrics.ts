import type { Usage } from '../types/metrics';
import type { Pod, UsageSummary } from '../types/runtime';
import type { ReplicaPod } from '../types/scaling';

/** Millicores -> "0.25 vCPU". */
export function formatMillicores(millicores: number): string {
  return `${(millicores / 1000).toFixed(2)} vCPU`;
}

/** Bytes -> binary-unit string, at most two decimals ("350 MiB", "1.5 GiB"). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 Bytes';
  const units = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${Number(value.toFixed(exponent === 0 ? 0 : 2))} ${units[exponent]}`;
}

/** Used/limit as a 0-100 integer, clamped; 0 when there is no limit. */
export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** "Request 350 MiB · Limit 1 GiB", skipping unset (0) values; "No request or limit set" when neither is set. */
export function formatAllocation(request: number, limit: number, format: (n: number) => string): string {
  const parts = [request > 0 ? `Request ${format(request)}` : '', limit > 0 ? `Limit ${format(limit)}` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'No request or limit set';
}

function summarize(pods: Pod[], used: (p: Pod) => number | undefined, request: (p: Pod) => number, limit: (p: Pod) => number): UsageSummary {
  const total = (pick: (p: Pod) => number) => pods.reduce((sum, p) => sum + pick(p), 0);
  const summary: UsageSummary = { request: total(request), limit: total(limit) };
  const usages = pods.map(used);
  if (pods.length > 0 && usages.every((u): u is number => u !== undefined)) {
    summary.used = usages.reduce((sum, u) => sum + u, 0);
    summary.percent = usagePercent(summary.used, summary.limit);
  }
  return summary;
}

/**
 * Totals CPU/memory across all pods. Usage comes from `totals` (the environment's usage, as the observability
 * plane reports it) when given, else from the pods — only when every pod reports it.
 */
export function aggregateUsage(pods: Pod[], totals?: Usage): { cpu: UsageSummary; memory: UsageSummary } {
  const out = {
    cpu: summarize(
      pods,
      (p) => p.cpuUsageMillicores,
      (p) => p.cpuRequestMillicores,
      (p) => p.cpuLimitMillicores,
    ),
    memory: summarize(
      pods,
      (p) => p.memoryUsageBytes,
      (p) => p.memoryRequestBytes,
      (p) => p.memoryLimitBytes,
    ),
  };
  const withTotal = (s: UsageSummary, used: number | undefined): UsageSummary => (used === undefined || pods.length === 0 ? s : { ...s, used, percent: usagePercent(used, s.limit) });
  return { cpu: withTotal(out.cpu, totals?.cpuMillicores), memory: withTotal(out.memory, totals?.memoryBytes) };
}

/**
 * The environment's usage totals as the usage of its pod when it runs exactly one (running) pod — the platform
 * reports totals, so per-pod usage is unknown with several pods. Returns the pods unchanged otherwise.
 */
export function withSinglePodUsage(pods: Pod[], totals?: Usage): Pod[] {
  if (pods.length !== 1 || pods[0].phase !== 'Running' || totals === undefined) return pods;
  return [{ ...pods[0], cpuUsageMillicores: totals.cpuMillicores, memoryUsageBytes: totals.memoryBytes }];
}

/** As withSinglePodUsage, for the Scaling page's replicas (vCPU, MB). */
export function withSingleReplicaUsage(replicas: ReplicaPod[], totals?: Usage): ReplicaPod[] {
  if (replicas.length !== 1 || replicas[0].status !== 'Running' || totals === undefined) return replicas;
  const { cpuMillicores, memoryBytes } = totals;
  return [
    {
      ...replicas[0],
      cpuUsage: cpuMillicores === undefined ? undefined : cpuMillicores / 1000,
      memoryUsageMb: memoryBytes === undefined ? undefined : Math.round((memoryBytes / 1024 ** 2) * 10) / 10,
    },
  ];
}
