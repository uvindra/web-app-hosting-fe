import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPodEvents, fetchPodLogs, fetchPods, fetchReleaseDetails, redeployRelease } from '../api/runtime';
import type { EnvironmentId } from '../types/webApp';

export function useReleaseDetails(webAppId: string, env: EnvironmentId) {
  return useQuery({ queryKey: ['runtime', 'release', webAppId, env], queryFn: () => fetchReleaseDetails(webAppId, env), enabled: !!webAppId });
}

export function usePods(webAppId: string, env: EnvironmentId) {
  return useQuery({ queryKey: ['runtime', 'pods', webAppId, env], queryFn: () => fetchPods(webAppId, env), enabled: !!webAppId, refetchInterval: 30_000 });
}

export function usePodEvents(webAppId: string, env: EnvironmentId, podName: string) {
  return useQuery({ queryKey: ['runtime', 'events', webAppId, env, podName], queryFn: () => fetchPodEvents(webAppId, env, podName), enabled: !!webAppId && !!podName });
}

export function usePodLogs(webAppId: string, env: EnvironmentId, podName: string) {
  return useQuery({ queryKey: ['runtime', 'logs', webAppId, env, podName], queryFn: () => fetchPodLogs(webAppId, env, podName), enabled: !!webAppId && !!podName });
}

export function useRedeploy(webAppId: string, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => redeployRelease(webAppId, env),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runtime'] }),
  });
}
