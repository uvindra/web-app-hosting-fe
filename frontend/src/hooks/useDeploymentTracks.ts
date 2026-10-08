import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkDeploymentTrackDeletable, createDeploymentTrack, deleteDeploymentTrack, fetchDeploymentTracks, fetchRepoBranches, updateAutoDeploy } from '../api/deploymentTracks';
import type { CreateDeploymentTrackInput } from '../types/deploymentTracks';
import { HttpError } from '../types/http';

const key = (webAppId: string) => ['deploymentTracks', webAppId];

export function useDeploymentTracks(webAppId: string) {
  return useQuery({ queryKey: key(webAppId), queryFn: () => fetchDeploymentTracks(webAppId), enabled: !!webAppId });
}

export function useRepoBranches(webAppId: string) {
  return useQuery({
    queryKey: ['repoBranches', webAppId],
    queryFn: () => fetchRepoBranches(webAppId),
    enabled: !!webAppId,
    staleTime: 60_000,
    // A GitHub rate limit (BFF 429 GIT_RATE_LIMITED) won't clear on a quick retry.
    retry: (failures, err) => !(err instanceof HttpError && err.status === 429) && failures < 2,
  });
}

export function useCreateDeploymentTrack(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeploymentTrackInput) => createDeploymentTrack(webAppId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(webAppId) }),
  });
}

export function useCheckDeploymentTrackDeletable(webAppId: string) {
  return useMutation({ mutationFn: (trackId: string) => checkDeploymentTrackDeletable(webAppId, trackId) });
}

export function useDeleteDeploymentTrack(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) => deleteDeploymentTrack(webAppId, trackId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(webAppId) }),
  });
}

export function useUpdateAutoDeploy(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, autoDeploy }: { trackId: string; autoDeploy: boolean }) => updateAutoDeploy(webAppId, trackId, autoDeploy),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(webAppId) }),
  });
}
