import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkDeploymentTrackDeletable, createDeploymentTrack, deleteDeploymentTrack, fetchDeploymentTracks, fetchRepoBranches, updateAutoDeploy } from '../api/deploymentTracks';
import type { CreateDeploymentTrackInput, DeploymentTrack } from '../types/deploymentTracks';
import { HttpError } from '../types/http';

const key = (webAppId: string | undefined) => ['deploymentTracks', webAppId];

/** A web app's deployment tracks (`undefined`: not known yet, nothing is fetched). */
export function useDeploymentTracks(webAppId: string | undefined) {
  return useQuery({ queryKey: key(webAppId), queryFn: webAppId ? () => fetchDeploymentTracks(webAppId) : skipToken });
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
    onSuccess: (created) => {
      // Show the new row straight away; the refetch then brings the server's view.
      qc.setQueryData<DeploymentTrack[]>(key(webAppId), (tracks) => (tracks && !tracks.some((t) => t.id === created.id) ? [...tracks, created] : tracks));
      void qc.invalidateQueries({ queryKey: key(webAppId) });
    },
  });
}

export function useCheckDeploymentTrackDeletable(webAppId: string) {
  return useMutation({ mutationFn: (trackId: string) => checkDeploymentTrackDeletable(webAppId, trackId) });
}

export function useDeleteDeploymentTrack(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) => deleteDeploymentTrack(webAppId, trackId),
    onSuccess: (_, trackId) => {
      // OpenChoreo deletes asynchronously, so drop the row now rather than wait for the refetch (the BFF also
      // hides Components that are being deleted). Not awaited: the mutation settles without waiting for it.
      qc.setQueryData<DeploymentTrack[]>(key(webAppId), (tracks) => tracks?.filter((t) => t.id !== trackId));
      void qc.invalidateQueries({ queryKey: key(webAppId) });
    },
  });
}

export function useUpdateAutoDeploy(webAppId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, autoDeploy }: { trackId: string; autoDeploy: boolean }) => updateAutoDeploy(webAppId, trackId, autoDeploy),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(webAppId) }),
  });
}
