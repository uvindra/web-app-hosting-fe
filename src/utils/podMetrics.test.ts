import { describe, expect, it } from 'vitest';
import type { Pod } from '../types/runtime';
import { aggregateUsage, formatBytes, formatMillicores, usagePercent } from './podMetrics';

const pod = (cpu: number, cpuLimit: number, mem: number, memLimit: number): Pod => ({
  name: 'p',
  phase: 'Running',
  ready: '1/1',
  restarts: 0,
  startedAt: '',
  cpuUsageMillicores: cpu,
  cpuLimitMillicores: cpuLimit,
  memoryUsageBytes: mem,
  memoryLimitBytes: memLimit,
  conditions: [],
});

describe('podMetrics', () => {
  it('formats millicores', () => expect(formatMillicores(250)).toBe('0.25 vCPU'));
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(512)).toBe('512 Bytes');
    expect(formatBytes(128 * 1024 ** 2)).toBe('128.00 MiB');
  });
  it('clamps percent and handles no limit', () => {
    expect(usagePercent(5, 0)).toBe(0);
    expect(usagePercent(200, 100)).toBe(100);
    expect(usagePercent(25, 100)).toBe(25);
  });
  it('aggregates pods', () => {
    const agg = aggregateUsage([pod(50, 100, 10, 100), pod(50, 100, 30, 100)]);
    expect(agg.cpu).toEqual({ used: 100, limit: 200, percent: 50 });
    expect(agg.memory.percent).toBe(20);
  });
});
