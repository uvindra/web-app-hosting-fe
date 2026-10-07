import type { EnvironmentId } from './webApp';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

/** `access` = web server request line, `app` = application/server process output. */
export type LogSource = 'access' | 'app';

export interface LogRow {
  /** Stable per-entry id, used as the React key and to track expanded rows. */
  id: string;
  timestamp: string;
  level: LogLevel;
  logLine: string;
  source: LogSource;
  podName: string;
  containerName: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
}

export interface LogsRequest {
  environment: EnvironmentId;
  levels: LogLevel[];
  startTime: string;
  endTime: string;
  searchPhrase: string;
  sort: 'asc' | 'desc';
  limit: number;
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string;
}

export interface LogsPage {
  items: LogRow[];
  nextCursor?: string;
}
