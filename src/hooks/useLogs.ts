import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { fetchLogs } from '../api/logs';
import type { LogsRequest } from '../types/logs';

/** Infinite ("load more") logs query. Pass `false` for `refetchInterval` to disable auto-fetch; `enabled` false skips fetching. */
export function useInfiniteLogs(webAppId: string, request: Omit<LogsRequest, 'cursor'>, refetchInterval: number | false, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['logs', webAppId, request],
    queryFn: ({ pageParam }) => fetchLogs(webAppId, { ...request, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && !!webAppId,
    refetchInterval,
    placeholderData: keepPreviousData,
  });
}
