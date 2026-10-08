import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchHealthCheck, updateHealthCheck } from '../api/healthChecks';
import type { HealthCheck } from '../types/healthChecks';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';

export function useHealthCheck(track: TrackRef, environment: EnvironmentId) {
  return useQuery({
    queryKey: ['healthCheck', ...trackKey(track), environment],
    queryFn: () => fetchHealthCheck(track, environment),
    enabled: !!track.trackId,
  });
}

export function useUpdateHealthCheck(track: TrackRef, environment: EnvironmentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: HealthCheck) => updateHealthCheck(track, environment, data),
    onSuccess: (saved) => {
      queryClient.setQueryData(['healthCheck', ...trackKey(track), environment], saved);
      // Saving rolls the pods.
      void queryClient.invalidateQueries({ queryKey: ['runtime'] });
    },
  });
}
