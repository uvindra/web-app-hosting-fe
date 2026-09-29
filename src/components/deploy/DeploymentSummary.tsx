import type { JSX } from 'react';
import { Stack, Typography } from '@wso2/oxygen-ui';
import type { Deployment } from '../../types/deployment';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import WebAppUrlRow from './WebAppUrlRow';

/** Deployed build/commit + URL for an environment's current deployment. Shared by the Deploy and Overview env cards. */
export default function DeploymentSummary({ deployment }: { deployment: Deployment }): JSX.Element {
  return (
    <Stack gap={1}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          Deployed build:
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {deployment.commitSha}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {deployment.commitMessage}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatRelativeTime(deployment.deployedAt)}
        </Typography>
      </Stack>
      {deployment.status !== 'stopped' && <WebAppUrlRow url={deployment.url} />}
    </Stack>
  );
}
