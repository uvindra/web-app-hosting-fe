import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBuildConfig, fetchBuildLogs, fetchBuildRuns, fetchBuilds, fetchEnvironments, fetchLatestCommit, triggerBuild } from '../api/builds';
import type { LatestCommit } from '../types/build';
import { HttpError } from '../types/http';
import { trackKey, type TrackRef } from '../types/track';

/** Status polling as in ICP: builds every 5s while one is running, 15s otherwise. */
export const BUILD_POLL_RUNNING_MS = 5_000;
export const BUILD_POLL_IDLE_MS = 15_000;
/** Deployments / environments poll every ~8s while a rollout is in flight, 15s otherwise (auto-deploys land in the background). */
export const DEPLOY_POLL_ACTIVE_MS = 8_000;
export const DEPLOY_POLL_IDLE_MS = 15_000;

const enabled = (t: TrackRef) => !!t.webAppId && !!t.trackId;

export function useBuilds(track: TrackRef) {
  return useQuery({
    queryKey: ['builds', ...trackKey(track)],
    queryFn: () => fetchBuilds(track),
    enabled: enabled(track),
    refetchInterval: (query) => (query.state.data?.some((b) => b.status === 'in-progress') ? BUILD_POLL_RUNNING_MS : BUILD_POLL_IDLE_MS),
  });
}

export function useEnvironments(track: TrackRef) {
  return useQuery({
    queryKey: ['environments', ...trackKey(track)],
    queryFn: () => fetchEnvironments(track),
    enabled: enabled(track),
    refetchInterval: (query) => (query.state.data?.some((e) => e.status === 'deploying') ? DEPLOY_POLL_ACTIVE_MS : DEPLOY_POLL_IDLE_MS),
  });
}

// ---- Build page hooks ----

export function useBuildRuns(track: TrackRef) {
  return useQuery({
    queryKey: ['build-runs', ...trackKey(track)],
    queryFn: () => fetchBuildRuns(track),
    enabled: enabled(track),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'in-progress') ? BUILD_POLL_RUNNING_MS : BUILD_POLL_IDLE_MS),
  });
}

/** One build's step logs; polls while the build runs. */
export function useBuildLogs(track: TrackRef, buildId: string | undefined, running: boolean) {
  return useQuery({
    queryKey: ['build-logs', ...trackKey(track), buildId],
    queryFn: () => fetchBuildLogs(track, buildId ?? ''),
    enabled: enabled(track) && !!buildId,
    refetchInterval: running ? BUILD_POLL_RUNNING_MS : false,
  });
}

export function useBuildConfig(track: TrackRef) {
  return useQuery({
    queryKey: ['build-config', ...trackKey(track)],
    queryFn: () => fetchBuildConfig(track),
    enabled: enabled(track),
  });
}

export function useLatestCommit(track: TrackRef) {
  return useQuery({
    queryKey: ['latest-commit', ...trackKey(track)],
    queryFn: () => fetchLatestCommit(track),
    enabled: enabled(track),
    staleTime: 30_000,
    // Don't hammer GitHub once it rate-limits us (BFF 429 GIT_RATE_LIMITED).
    retry: (failures, err) => !(err instanceof HttpError && err.status === 429) && failures < 2,
  });
}

export function useTriggerBuild(track: TrackRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commit: LatestCommit | undefined) => triggerBuild(track, commit),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['builds', ...trackKey(track)] });
      void queryClient.invalidateQueries({ queryKey: ['build-runs', ...trackKey(track)] });
    },
  });
}
