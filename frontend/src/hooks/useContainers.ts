import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchContainers, updateContainer } from '../api/containers';
import type { ContainerUpdate } from '../types/containers';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';

export function useContainers(track: TrackRef, env: EnvironmentId) {
  return useQuery({ queryKey: ['containers', ...trackKey(track), env], queryFn: () => fetchContainers(track, env), enabled: !!track.trackId });
}

export function useUpdateContainer(track: TrackRef, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ containerId, update }: { containerId: string; update: ContainerUpdate }) => updateContainer(track, env, containerId, update),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers', ...trackKey(track), env] }),
  });
}
