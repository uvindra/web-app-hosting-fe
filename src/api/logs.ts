import type { LogsPage, LogRow, LogsRequest } from '../types/logs';
import { generateLogs } from '../mock-data/logs';
import { matchesLogFilters } from '../utils/logs';

// STUB — see src/api/builds.ts for the reasoning; same shape, swap for real calls later.
const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One generated log set per web app + environment, so paging is stable across requests. */
const logCache = new Map<string, LogRow[]>();

function logsFor(webAppId: string, environment: string): LogRow[] {
  const key = `${webAppId}:${environment}`;
  const cached = logCache.get(key);
  if (cached) return cached;
  const generated = generateLogs(key);
  logCache.set(key, generated);
  return generated;
}

/** Cursor-paginated: pass the previous page's `nextCursor` as `cursor`. */
export async function fetchLogs(webAppId: string, request: LogsRequest): Promise<LogsPage> {
  await delay(NETWORK_DELAY_MS);
  const matched = logsFor(webAppId, request.environment).filter((row) => matchesLogFilters(row, request));
  const ordered = request.sort === 'desc' ? matched : [...matched].reverse();
  const offset = request.cursor ? Number(request.cursor) : 0;
  const items = ordered.slice(offset, offset + request.limit);
  const next = offset + request.limit;
  return { items, nextCursor: next < ordered.length ? String(next) : undefined };
}
