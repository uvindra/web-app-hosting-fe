import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPodEvents, fetchPodLogs, fetchPods, fetchReleaseDetails, redeployRelease } from '../api/runtime';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';

const on = (t: TrackRef) => !!t.webAppId && !!t.trackId;

export function useReleaseDetails(track: TrackRef, env: EnvironmentId) {
  return useQuery({ queryKey: ['runtime', 'release', ...trackKey(track), env], queryFn: () => fetchReleaseDetails(track, env), enabled: on(track), refetchInterval: 15_000 });
}

export function usePods(track: TrackRef, env: EnvironmentId) {
  return useQuery({ queryKey: ['runtime', 'pods', ...trackKey(track), env], queryFn: () => fetchPods(track, env), enabled: on(track), refetchInterval: 15_000 });
}

export function usePodEvents(track: TrackRef, env: EnvironmentId, podName: string) {
  return useQuery({ queryKey: ['runtime', 'events', ...trackKey(track), env, podName], queryFn: () => fetchPodEvents(track, env, podName), enabled: on(track) && !!podName });
}

export function usePodLogs(track: TrackRef, env: EnvironmentId, podName: string) {
  return useQuery({ queryKey: ['runtime', 'logs', ...trackKey(track), env, podName], queryFn: () => fetchPodLogs(track, env, podName), enabled: on(track) && !!podName });
}

export function useRedeploy(track: TrackRef, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => redeployRelease(track, env),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runtime'] }),
  });
}
