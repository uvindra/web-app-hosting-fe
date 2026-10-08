import { describe, expect, it } from 'vitest';
import type { Pod } from '../types/runtime';
import { aggregateUsage, formatAllocation, formatBytes, formatMillicores, usagePercent } from './podMetrics';

const pod = (usage: { cpu?: number; mem?: number }, cpuLimit = 100, memLimit = 100): Pod => ({
  name: 'p',
  phase: 'Running',
  ready: '1/1',
  restarts: 0,
  startedAt: '',
  cpuUsageMillicores: usage.cpu,
  cpuRequestMillicores: cpuLimit / 2,
  cpuLimitMillicores: cpuLimit,
  memoryUsageBytes: usage.mem,
  memoryRequestBytes: memLimit / 2,
  memoryLimitBytes: memLimit,
  conditions: [],
});

describe('podMetrics', () => {
  it('formats millicores', () => expect(formatMillicores(250)).toBe('0.25 vCPU'));
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(512)).toBe('512 Bytes');
    expect(formatBytes(128 * 1024 ** 2)).toBe('128 MiB');
    expect(formatBytes(350 * 1024 ** 2)).toBe('350 MiB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GiB');
  });
  it('clamps percent and handles no limit', () => {
    expect(usagePercent(5, 0)).toBe(0);
    expect(usagePercent(200, 100)).toBe(100);
    expect(usagePercent(25, 100)).toBe(25);
  });
  it('formats request and limit', () => {
    expect(formatAllocation(350 * 1024 ** 2, 1024 ** 3, formatBytes)).toBe('Request 350 MiB · Limit 1 GiB');
    expect(formatAllocation(0, 100, formatMillicores)).toBe('Limit 0.10 vCPU');
    expect(formatAllocation(0, 0, formatMillicores)).toBe('No request or limit set');
  });
  it('aggregates pods with usage', () => {
    const agg = aggregateUsage([pod({ cpu: 50, mem: 10 }), pod({ cpu: 50, mem: 30 })]);
    expect(agg.cpu).toEqual({ used: 100, request: 100, limit: 200, percent: 50 });
    expect(agg.memory.percent).toBe(20);
  });
  it('reports no usage (not 0) when metrics are unavailable', () => {
    const agg = aggregateUsage([pod({}), pod({})]);
    expect(agg.cpu).toEqual({ request: 100, limit: 200 });
    expect(agg.memory.used).toBeUndefined();
    expect(aggregateUsage([]).cpu.used).toBeUndefined();
  });
  it('reports no usage when any pod lacks it', () => {
    expect(aggregateUsage([pod({ cpu: 50, mem: 10 }), pod({})]).cpu.used).toBeUndefined();
  });
  it('uses the environment totals when given, even without per-pod usage', () => {
    const agg = aggregateUsage([pod({}), pod({})], { cpuMillicores: 50, memoryBytes: 40 });
    expect(agg.cpu).toEqual({ used: 50, request: 100, limit: 200, percent: 25 });
    expect(agg.memory.percent).toBe(20);
    // A total without a field keeps that resource without usage; no pods = nothing to show.
    expect(aggregateUsage([pod({}), pod({})], { cpuMillicores: 50 }).memory.used).toBeUndefined();
    expect(aggregateUsage([], { cpuMillicores: 50 }).cpu.used).toBeUndefined();
  });
});
