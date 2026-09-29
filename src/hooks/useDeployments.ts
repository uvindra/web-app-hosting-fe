import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deployBuild, fetchDeployments, promoteDeployment, redeployDeployment, stopDeployment } from '../api/deployments';
import type { DeployBuildInput, Deployment, PromoteInput } from '../types/deployment';
import type { EnvironmentId } from '../types/webApp';

const ROLLOUT_POLL_MS = 1000;

export function useDeployments(webAppId: string) {
  return useQuery({
    queryKey: ['deployments', webAppId],
    queryFn: () => fetchDeployments(webAppId),
    enabled: !!webAppId,
    // Poll while a rollout is in flight so it flips to "active" without a manual refresh.
    refetchInterval: (query) => (query.state.data?.some((d) => d.status === 'deploying') ? ROLLOUT_POLL_MS : false),
  });
}

function useDeploymentMutation<TInput>(webAppId: string, fn: (webAppId: string, input: TInput) => Promise<Deployment>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => fn(webAppId, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['deployments', webAppId] });
      void queryClient.invalidateQueries({ queryKey: ['environments', webAppId] });
    },
  });
}

export const useDeployBuild = (webAppId: string) => useDeploymentMutation<DeployBuildInput>(webAppId, deployBuild);
export const usePromote = (webAppId: string) => useDeploymentMutation<PromoteInput>(webAppId, promoteDeployment);
export const useRedeploy = (webAppId: string) => useDeploymentMutation<EnvironmentId>(webAppId, redeployDeployment);
export const useStopDeployment = (webAppId: string) => useDeploymentMutation<EnvironmentId>(webAppId, stopDeployment);
