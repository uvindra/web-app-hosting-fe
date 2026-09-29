import { useQuery } from '@tanstack/react-query';
import { fetchBuilds, fetchEnvironments } from '../api/builds';

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
