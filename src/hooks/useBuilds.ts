import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchBuildConfig, fetchBuildRuns, fetchBuilds, fetchEnvironments, fetchLatestCommit, triggerBuild } from '../api/builds';
import type { LatestCommit } from '../types/build';

export function useBuilds(webAppId: string) {
  return useQuery({
    queryKey: ['builds', webAppId],
    queryFn: () => fetchBuilds(webAppId),
    enabled: !!webAppId,
  });
}

export function useEnvironments(webAppId: string) {
  return useQuery({
    queryKey: ['environments', webAppId],
    queryFn: () => fetchEnvironments(webAppId),
    enabled: !!webAppId,
  });
}

// ---- Build page hooks ----

export function useBuildRuns(webAppId: string) {
  return useQuery({
    queryKey: ['build-runs', webAppId],
    queryFn: () => fetchBuildRuns(webAppId),
    enabled: !!webAppId,
    // Poll while any build is running so status/logs update.
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'in-progress') ? 2000 : false),
  });
}

export function useBuildConfig(webAppId: string, repoUrl?: string) {
  return useQuery({
    queryKey: ['build-config', webAppId],
    queryFn: () => fetchBuildConfig(webAppId, repoUrl),
    enabled: !!webAppId,
  });
}

export function useLatestCommit(webAppId: string, repoUrl: string | undefined, branch: string | undefined) {
  return useQuery({
    queryKey: ['latest-commit', webAppId, branch],
    queryFn: () => fetchLatestCommit(webAppId, repoUrl, branch ?? 'main'),
    enabled: !!webAppId && !!branch,
  });
}

export function useTriggerBuild(webAppId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commit: LatestCommit) => triggerBuild(webAppId, commit),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['builds', webAppId] });
      void queryClient.invalidateQueries({ queryKey: ['build-runs', webAppId] });
    },
  });
}
