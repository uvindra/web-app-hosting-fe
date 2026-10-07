import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchHealthCheck, updateHealthCheck } from '../api/healthChecks';
import type { HealthCheck } from '../types/healthChecks';
import type { EnvironmentId } from '../types/webApp';

export function useHealthCheck(webAppId: string, environment: EnvironmentId) {
  return useQuery({
    queryKey: ['healthCheck', webAppId, environment],
    queryFn: () => fetchHealthCheck(webAppId, environment),
    enabled: !!webAppId,
  });
}

export function useUpdateHealthCheck(webAppId: string, environment: EnvironmentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HealthCheck) => updateHealthCheck(webAppId, environment, data),
    onSuccess: (saved) => queryClient.setQueryData(['healthCheck', webAppId, environment], saved),
  });
}
