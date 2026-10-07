import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchContainers, updateContainer } from '../api/containers';
import type { ContainerUpdate } from '../types/containers';
import type { EnvironmentId } from '../types/webApp';

export function useContainers(webAppId: string, env: EnvironmentId) {
  return useQuery({ queryKey: ['containers', webAppId, env], queryFn: () => fetchContainers(webAppId, env), enabled: !!webAppId });
}

export function useUpdateContainer(webAppId: string, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ containerId, update }: { containerId: string; update: ContainerUpdate }) => updateContainer(webAppId, env, containerId, update),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers', webAppId, env] }),
  });
}
