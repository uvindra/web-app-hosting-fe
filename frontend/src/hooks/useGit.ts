import { useMutation, useQuery } from '@tanstack/react-query';
import { bindGitHubInstallations, fetchBranches, fetchGitHubInstallations, fetchGitHubRepos } from '../api/git';

export function useBindGitHubInstallations() {
  return useMutation({ mutationFn: (code: string) => bindGitHubInstallations(code) });
}

export function useGitHubInstallations(enabled: boolean) {
  return useQuery({ queryKey: ['gitHubInstallations'], queryFn: fetchGitHubInstallations, enabled });
}

export function useGitHubRepos(installationId: number | undefined) {
  return useQuery({ queryKey: ['gitHubRepos', installationId], queryFn: () => fetchGitHubRepos(installationId ?? 0), enabled: !!installationId });
}

/**
 * Branches of a repository. Pass a normalized `repoUrl` (see `normalizeGitHubRepoUrl`) so the cache key is stable;
 * results are reused for a minute (the BFF caches public GitHub reads for as long).
 */
export function useBranches(query: { repoUrl?: string; installationId?: number; owner?: string; repo?: string }, enabled: boolean) {
  return useQuery({ queryKey: ['branches', query], queryFn: () => fetchBranches(query), enabled, retry: false, staleTime: 60_000 });
}
