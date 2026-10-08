import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBuildConfig, fetchBuildLogs, fetchBuildRuns, fetchBuilds, fetchEnvironments, fetchLatestCommit, triggerBuild } from '../api/builds';
import type { BuildRun, LatestCommit } from '../types/build';
import { HttpError } from '../types/http';
import { trackKey, type TrackRef } from '../types/track';

/** Status polling as in ICP: builds every 5s while one is running, 15s otherwise. */
export const BUILD_POLL_RUNNING_MS = 5_000;
export const BUILD_POLL_IDLE_MS = 15_000;
/** Deployments / environments poll every ~8s while a rollout is in flight, 15s otherwise (auto-deploys land in the background). */
export const DEPLOY_POLL_ACTIVE_MS = 8_000;
export const DEPLOY_POLL_IDLE_MS = 15_000;
/** After a build finishes its logs move to the observability plane, which lags: re-read them for a while. */
export const BUILD_LOG_SETTLE_MS = 10_000;
export const BUILD_LOG_SETTLE_WINDOW_MS = 60_000;

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

/**
 * One build's step logs (`run` from the polled build list; undefined = none open). Polls while the build runs; the
 * status is part of the key, so the run finishing fetches the final logs at once, then re-reads them every
 * BUILD_LOG_SETTLE_MS for BUILD_LOG_SETTLE_WINDOW_MS after completion while the archived logs catch up.
 */
export function useBuildLogs(track: TrackRef, run: BuildRun | undefined) {
  return useQuery({
    queryKey: ['build-logs', ...trackKey(track), run?.id, run?.status],
    queryFn: run && enabled(track) ? () => fetchBuildLogs(track, run.id) : skipToken,
    // Keep showing this build's logs (not another build's) while its next status is fetched.
    placeholderData: (previous, previousQuery) => (run && previousQuery?.queryKey[3] === run.id ? previous : undefined),
    refetchInterval: () => (run ? buildLogsInterval(run, Date.now()) : false),
  });
}

/** The logs poll interval for a run at `now` (ms since epoch). */
export function buildLogsInterval(run: BuildRun, now: number): number | false {
  if (run.status === 'in-progress') return BUILD_POLL_RUNNING_MS;
  if (!run.completedAt) return false;
  const completed = Date.parse(run.completedAt);
  return Number.isFinite(completed) && now - completed < BUILD_LOG_SETTLE_WINDOW_MS ? BUILD_LOG_SETTLE_MS : false;
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
