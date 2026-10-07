import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchReplicas, fetchScaling, updateScaling } from '../api/scaling';
import type { ScalingConfig } from '../types/scaling';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';

export function useScaling(track: TrackRef, environment: EnvironmentId) {
  return useQuery({
    queryKey: ['scaling', ...trackKey(track), environment],
    queryFn: () => fetchScaling(track, environment),
    enabled: !!track.trackId,
  });
}

export function useUpdateScaling(track: TrackRef, environment: EnvironmentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ScalingConfig) => updateScaling(track, environment, data),
    onSuccess: (saved) => {
      queryClient.setQueryData(['scaling', ...trackKey(track), environment], saved);
      void queryClient.invalidateQueries({ queryKey: ['replicas', ...trackKey(track), environment] });
    },
  });
}

export function useReplicas(track: TrackRef, environment: EnvironmentId) {
  return useQuery({
    queryKey: ['replicas', ...trackKey(track), environment],
    queryFn: () => fetchReplicas(track, environment),
    enabled: !!track.trackId,
    refetchInterval: 15_000,
  });
}
