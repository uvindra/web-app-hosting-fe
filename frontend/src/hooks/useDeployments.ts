import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deployBuild, fetchDeployments, promoteDeployment, redeployDeployment, stopDeployment } from '../api/deployments';
import type { DeployBuildInput, Deployment, PromoteInput } from '../types/deployment';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';
import { DEPLOY_POLL_ACTIVE_MS, DEPLOY_POLL_IDLE_MS } from './useBuilds';

export function useDeployments(track: TrackRef) {
  return useQuery({
    queryKey: ['deployments', ...trackKey(track)],
    queryFn: () => fetchDeployments(track),
    enabled: !!track.webAppId && !!track.trackId,
    refetchInterval: (query) => (query.state.data?.some((d) => d.status === 'deploying') ? DEPLOY_POLL_ACTIVE_MS : DEPLOY_POLL_IDLE_MS),
  });
}

function useDeploymentMutation<TInput>(track: TrackRef, fn: (track: TrackRef, input: TInput) => Promise<Deployment>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => fn(track, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deployments', ...trackKey(track)] });
      void queryClient.invalidateQueries({ queryKey: ['environments', ...trackKey(track)] });
    },
  });
}

export const useDeployBuild = (track: TrackRef) => useDeploymentMutation<DeployBuildInput>(track, deployBuild);
export const usePromote = (track: TrackRef) => useDeploymentMutation<PromoteInput>(track, promoteDeployment);
export const useRedeploy = (track: TrackRef) => useDeploymentMutation<EnvironmentId>(track, redeployDeployment);
export const useStopDeployment = (track: TrackRef) => useDeploymentMutation<EnvironmentId>(track, stopDeployment);
