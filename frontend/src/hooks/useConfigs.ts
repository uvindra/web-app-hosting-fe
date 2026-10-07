import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createConfig, deleteConfig, fetchConfigs, updateConfig } from '../api/configs';
import type { ConfigWrite } from '../types/configs';
import type { EnvironmentId } from '../types/webApp';

export function useConfigs(webAppId: string, env: EnvironmentId) {
  return useQuery({ queryKey: ['configs', webAppId, env], queryFn: () => fetchConfigs(webAppId, env), enabled: !!webAppId });
}

export function useSaveConfig(webAppId: string, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, write }: { id?: string; write: ConfigWrite }) => (id ? updateConfig(webAppId, env, id, write) : createConfig(webAppId, env, write)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configs', webAppId, env] }),
  });
}

export function useDeleteConfig(webAppId: string, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConfig(webAppId, env, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configs', webAppId, env] }),
  });
}
