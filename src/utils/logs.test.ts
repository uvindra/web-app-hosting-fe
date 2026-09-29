import { describe, expect, it } from 'vitest';
import type { LogRow } from '../types/logs';
import { CUSTOM_PRESET, formatLogText, levelColor, levelForStatus, matchesLogFilters, resolveTimeWindow, statusCodeColor } from './logs';

const row = (overrides: Partial<LogRow> = {}): LogRow => ({
  id: '1',
  timestamp: '2026-03-01T10:00:00.000Z',
  level: 'INFO',
  logLine: 'GET /index.html 200 512B 3ms',
  source: 'access',
  podName: 'pod-a',
  containerName: 'web',
  ...overrides,
});

const window = { levels: [], startTime: '2026-03-01T09:00:00.000Z', endTime: '2026-03-01T11:00:00.000Z', searchPhrase: '' };

describe('matchesLogFilters', () => {
  it('accepts a row inside the window with no other filters', () => expect(matchesLogFilters(row(), window)).toBe(true));
  it('rejects rows outside the window', () => {
    expect(matchesLogFilters(row({ timestamp: '2026-03-01T08:00:00.000Z' }), window)).toBe(false);
    expect(matchesLogFilters(row({ timestamp: '2026-03-01T12:00:00.000Z' }), window)).toBe(false);
  });
  it('filters by level', () => {
    expect(matchesLogFilters(row(), { ...window, levels: ['ERROR'] })).toBe(false);
    expect(matchesLogFilters(row({ level: 'ERROR' }), { ...window, levels: ['ERROR', 'WARN'] })).toBe(true);
  });
  it('searches case-insensitively', () => {
    expect(matchesLogFilters(row(), { ...window, searchPhrase: 'INDEX.HTML' })).toBe(true);
    expect(matchesLogFilters(row(), { ...window, searchPhrase: 'favicon' })).toBe(false);
  });
});

describe('resolveTimeWindow', () => {
  const now = Date.UTC(2026, 2, 1, 12, 0, 0);
  it('uses the preset hours', () => {
    const w = resolveTimeWindow({ preset: 'Past 1 hour', customStart: '', customEnd: '', now });
    expect(new Date(w.endTime).getTime() - new Date(w.startTime).getTime()).toBe(3600_000);
  });
  it('falls back to the default window for an invalid custom range', () => {
    const w = resolveTimeWindow({ preset: CUSTOM_PRESET, customStart: 'x', customEnd: 'y', now });
    expect(new Date(w.endTime).getTime() - new Date(w.startTime).getTime()).toBe(24 * 3600_000);
  });
  it('uses a valid custom range', () => {
    const w = resolveTimeWindow({ preset: CUSTOM_PRESET, customStart: '2026-03-01T08:00', customEnd: '2026-03-01T09:00', now });
    expect(new Date(w.endTime).getTime() - new Date(w.startTime).getTime()).toBe(3600_000);
  });
});

describe('level and status helpers', () => {
  it('maps levels and codes to palette colors', () => {
    expect(levelColor('ERROR')).toBe('error');
    expect(statusCodeColor(404)).toBe('warning');
    expect(statusCodeColor(200)).toBe('success');
    expect(statusCodeColor(503)).toBe('error');
  });
  it('derives a level from a status code', () => {
    expect(levelForStatus(500)).toBe('ERROR');
    expect(levelForStatus(404)).toBe('WARN');
    expect(levelForStatus(304)).toBe('INFO');
  });
});

describe('formatLogText', () => {
  it('includes timestamp, level and line', () => expect(formatLogText(row())).toBe('2026-03-01T10:00:00.000Z [INFO] GET /index.html 200 512B 3ms'));
});
