import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWebApps, fetchWebApp, createWebApp } from '../api/webApps';
import type { CreateWebAppInput } from '../types/webApp';

export function useWebApps(projectId: string) {
  return useQuery({
    queryKey: ['webApps', projectId],
    queryFn: () => fetchWebApps(projectId),
    enabled: !!projectId,
  });
}

export function useWebApp(projectId: string, webAppId: string) {
  return useQuery({
    queryKey: ['webApp', projectId, webAppId],
    queryFn: () => fetchWebApp(projectId, webAppId),
    enabled: !!projectId && !!webAppId,
  });
}

export function useWebAppByHandler(projectId: string, handler: string) {
  const { data: webApps = [], isLoading } = useWebApps(projectId);
  const data = handler ? (webApps.find((a) => a.handler === handler) ?? undefined) : undefined;
  return { data, isLoading: !data && isLoading && !!handler };
}

export function useCreateWebApp(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebAppInput) => createWebApp(projectId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webApps', projectId] }),
  });
}
