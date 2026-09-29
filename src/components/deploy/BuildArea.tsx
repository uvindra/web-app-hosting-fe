import type { JSX } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { Rocket } from '@wso2/oxygen-ui-icons-react';
import type { Build } from '../../types/webApp';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const BUILD_STATUS = {
  success: { label: 'Success', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  'in-progress': { label: 'In Progress', color: 'warning' },
} as const;

interface BuildAreaProps {
  loading: boolean;
  latestBuild: Build | undefined;
  deploying: boolean;
  /** Label of the first pipeline environment the build deploys to. */
  targetEnvName: string;
  onDeploy: (build: Build) => void;
}

/** Start of the pipeline: the latest build and the action that deploys it to the first environment. */
export default function BuildArea({ loading, latestBuild, deploying, targetEnvName, onDeploy }: BuildAreaProps): JSX.Element {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        Latest Build
      </Typography>
      {loading ? (
        <CircularProgress size={18} />
      ) : !latestBuild ? (
        <Typography variant="body2" color="text.secondary">
          No builds yet. Trigger a build from the Build page to deploy it.
        </Typography>
      ) : (
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
          <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
            <Chip label={BUILD_STATUS[latestBuild.status].label} color={BUILD_STATUS[latestBuild.status].color} size="small" />
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {latestBuild.commitSha}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {latestBuild.commitMessage}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatRelativeTime(latestBuild.triggeredAt)}
            </Typography>
          </Stack>
          <Button variant="contained" size="small" startIcon={<Rocket size={14} />} disabled={latestBuild.status !== 'success' || deploying} onClick={() => onDeploy(latestBuild)}>
            {deploying ? 'Deploying…' : `Deploy to ${targetEnvName}`}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
