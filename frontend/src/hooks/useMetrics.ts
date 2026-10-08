import { useQuery } from '@tanstack/react-query';
import { fetchMetrics, fetchUsage } from '../api/metrics';
import type { MetricsRange } from '../types/metrics';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';

/** `refreshSeconds` of 0 disables auto-refresh; `enabled` should be false for environments the track is not deployed to. */
export function useMetrics(track: TrackRef, environment: EnvironmentId, range: MetricsRange, refreshSeconds: number, enabled: boolean) {
  return useQuery({
    queryKey: ['metrics', ...trackKey(track), environment, range],
    queryFn: () => fetchMetrics(track, environment, range),
    enabled: enabled && !!track.trackId,
    refetchInterval: refreshSeconds > 0 ? refreshSeconds * 1000 : false,
  });
}

/** Latest CPU/memory totals (Runtime page cards). */
export function useUsage(track: TrackRef, environment: EnvironmentId) {
  return useQuery({
    queryKey: ['usage', ...trackKey(track), environment],
    queryFn: () => fetchUsage(track, environment),
    enabled: !!track.trackId,
    refetchInterval: 30_000,
    retry: 1,
  });
}
