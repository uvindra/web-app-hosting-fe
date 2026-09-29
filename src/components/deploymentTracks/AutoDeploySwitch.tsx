import type { JSX } from 'react';
import { Switch } from '@wso2/oxygen-ui';
import { useUpdateAutoDeploy } from '../../hooks/useDeploymentTracks';
import type { DeploymentTrack } from '../../types/deploymentTracks';

interface AutoDeploySwitchProps {
  webAppId: string;
  track: DeploymentTrack;
  onError: (message: string) => void;
}

export default function AutoDeploySwitch({ webAppId, track, onError }: AutoDeploySwitchProps): JSX.Element {
  const update = useUpdateAutoDeploy(webAppId);
  return (
    <Switch
      size="small"
      checked={track.autoDeploy}
      disabled={update.isPending}
      slotProps={{ input: { 'aria-label': `Auto deploy ${track.name}` } }}
      onChange={(e) => update.mutate({ trackId: track.id, autoDeploy: e.target.checked }, { onError: (err) => onError(err instanceof Error ? err.message : 'Failed to update auto deploy.') })}
    />
  );
}
