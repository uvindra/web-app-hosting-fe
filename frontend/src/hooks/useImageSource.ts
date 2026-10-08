import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deployImageTag, fetchImageSource } from '../api/images';
import { trackKey, type TrackRef } from '../types/track';

export function useImageSource(track: TrackRef, enabled = true) {
  return useQuery({ queryKey: ['imageSource', ...trackKey(track)], queryFn: () => fetchImageSource(track), enabled: enabled && !!track.trackId });
}

export function useDeployImageTag(track: TrackRef) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tag: string) => deployImageTag(track, tag),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['imageSource', ...trackKey(track)] });
      void queryClient.invalidateQueries({ queryKey: ['deployments', ...trackKey(track)] });
      void queryClient.invalidateQueries({ queryKey: ['environments', ...trackKey(track)] });
      void queryClient.invalidateQueries({ queryKey: ['runtime'] });
    },
  });
}
