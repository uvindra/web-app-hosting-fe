import type { LogsPage, LogsRequest } from '../types/logs';
import type { TrackRef } from '../types/track';
import { webAppHostingClient } from './httpClient';
import { trackPath } from './trackPath';

/** Archived runtime logs via the BFF (it queries the observability plane). Pass the previous page's `nextCursor` as `cursor`. */
export async function fetchLogs(track: TrackRef, request: LogsRequest): Promise<LogsPage> {
  return webAppHostingClient.post<LogsPage>(`${trackPath(track)}/logs/query`, request);
}
