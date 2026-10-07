import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '../api/metrics';
import type { MetricsRange } from '../types/metrics';
import type { EnvironmentId } from '../types/webApp';

/** `refreshSeconds` of 0 disables auto-refresh; `enabled` should be false for environments the web app is not deployed to. */
export function useMetrics(webAppId: string, environment: EnvironmentId, range: MetricsRange, refreshSeconds: number, enabled: boolean) {
  return useQuery({
    queryKey: ['metrics', webAppId, environment, range],
    queryFn: () => fetchMetrics(webAppId, environment, range),
    enabled: enabled && !!webAppId,
    refetchInterval: refreshSeconds > 0 ? refreshSeconds * 1000 : false,
  });
}
