import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReplicas, fetchScaling, updateScaling } from '../api/scaling';
import type { ScalingConfig } from '../types/scaling';
import type { EnvironmentId } from '../types/webApp';

export function useScaling(webAppId: string, environment: EnvironmentId) {
  return useQuery({
    queryKey: ['scaling', webAppId, environment],
    queryFn: () => fetchScaling(webAppId, environment),
    enabled: !!webAppId,
  });
}

export function useUpdateScaling(webAppId: string, environment: EnvironmentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ScalingConfig) => updateScaling(webAppId, environment, data),
    onSuccess: (saved) => {
      queryClient.setQueryData(['scaling', webAppId, environment], saved);
      void queryClient.invalidateQueries({ queryKey: ['replicas', webAppId, environment] });
    },
  });
}

export function useReplicas(webAppId: string, environment: EnvironmentId) {
  return useQuery({
    queryKey: ['replicas', webAppId, environment],
    queryFn: () => fetchReplicas(webAppId, environment),
    enabled: !!webAppId,
  });
}
