import type { LogLevel, LogRow, LogsRequest } from '../types/logs';
import type { PaletteColor } from './statusColor';

export const LOG_LEVELS: readonly LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG'];

export const TIME_PRESETS: { label: string; hours: number }[] = [
  { label: 'Past 10 minutes', hours: 1 / 6 },
  { label: 'Past 30 minutes', hours: 0.5 },
  { label: 'Past 1 hour', hours: 1 },
  { label: 'Past 24 hours', hours: 24 },
  { label: 'Past 7 days', hours: 168 },
  { label: 'Past 30 days', hours: 720 },
];

export const CUSTOM_PRESET = 'custom';
export const DEFAULT_PRESET = 'Past 24 hours';
export const DEFAULT_HOURS = 24;
export const AUTO_FETCH_INTERVAL = 10_000;
export const PAGE_SIZE = 50;

const HOUR_MS = 3600_000;

export function levelColor(level: LogLevel): PaletteColor {
  switch (level) {
    case 'ERROR':
      return 'error';
    case 'WARN':
      return 'warning';
    case 'INFO':
      return 'info';
    case 'DEBUG':
      return 'default';
  }
}

export function statusCodeColor(code: number): PaletteColor {
  if (code >= 500) return 'error';
  if (code >= 400) return 'warning';
  if (code >= 200 && code < 400) return 'success';
  return 'default';
}

/** Log level implied by an HTTP status code: server errors are ERROR, client errors WARN. */
export function levelForStatus(code: number): LogLevel {
  if (code >= 500) return 'ERROR';
  if (code >= 400) return 'WARN';
  return 'INFO';
}

export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TimeWindowInput {
  preset: string;
  customStart: string;
  customEnd: string;
  now: number;
}

/** Resolves the preset (or a valid custom range) into ISO start/end times. Falls back to the default window. */
export function resolveTimeWindow({ preset, customStart, customEnd, now }: TimeWindowInput): { startTime: string; endTime: string } {
  if (preset === CUSTOM_PRESET) {
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start.getTime() < end.getTime()) {
      return { startTime: start.toISOString(), endTime: end.toISOString() };
    }
  }
  const hours = TIME_PRESETS.find((p) => p.label === preset)?.hours ?? DEFAULT_HOURS;
  return { startTime: new Date(now - hours * HOUR_MS).toISOString(), endTime: new Date(now).toISOString() };
}

/** Whether a row passes the request's level, time-window and search filters. */
export function matchesLogFilters(row: LogRow, req: Pick<LogsRequest, 'levels' | 'startTime' | 'endTime' | 'searchPhrase'>): boolean {
  if (req.levels.length > 0 && !req.levels.includes(row.level)) return false;
  const time = new Date(row.timestamp).getTime();
  if (time < new Date(req.startTime).getTime() || time > new Date(req.endTime).getTime()) return false;
  const phrase = req.searchPhrase.trim().toLowerCase();
  if (phrase && !row.logLine.toLowerCase().includes(phrase)) return false;
  return true;
}

export function formatLogText(log: LogRow): string {
  return `${new Date(log.timestamp).toISOString()} [${log.level}] ${log.logLine}`;
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

export function copyLog(log: LogRow): void {
  void navigator.clipboard.writeText(formatLogText(log));
}

export function downloadLogs(logs: LogRow[]): void {
  const blob = new Blob([logs.map(formatLogText).join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
