import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createConfig, deleteConfig, fetchConfigs, updateConfig } from '../api/configs';
import type { ConfigWrite } from '../types/configs';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';

export function useConfigs(track: TrackRef, env: EnvironmentId) {
  return useQuery({ queryKey: ['configs', ...trackKey(track), env], queryFn: () => fetchConfigs(track, env), enabled: !!track.trackId });
}

export function useSaveConfig(track: TrackRef, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, write }: { id?: string; write: ConfigWrite }) => (id ? updateConfig(track, env, id, write) : createConfig(track, env, write)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configs', ...trackKey(track), env] }),
  });
}

export function useDeleteConfig(track: TrackRef, env: EnvironmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteConfig(track, env, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configs', ...trackKey(track), env] }),
  });
}
