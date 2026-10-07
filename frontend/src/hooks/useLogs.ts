import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { fetchLogs } from '../api/logs';
import type { LogsRequest } from '../types/logs';
import { trackKey, type TrackRef } from '../types/track';

/** Infinite ("load more") logs query. Pass `false` for `refetchInterval` to disable auto-fetch; `enabled` false skips fetching. */
export function useInfiniteLogs(track: TrackRef, request: Omit<LogsRequest, 'cursor'>, refetchInterval: number | false, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['logs', ...trackKey(track), request],
    queryFn: ({ pageParam }) => fetchLogs(track, { ...request, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && !!track.trackId,
    refetchInterval,
    placeholderData: keepPreviousData,
  });
}
