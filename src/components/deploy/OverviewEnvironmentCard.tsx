import type { JSX } from 'react';
import { Link } from 'react-router';
import { Box, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import type { Deployment } from '../../types/deployment';
import type { EnvironmentId } from '../../types/webApp';
import { ENVIRONMENT_LABEL } from '../../constants/environments';
import DeploymentStatusChip from './DeploymentStatusChip';
import DeploymentSummary from './DeploymentSummary';

interface OverviewEnvironmentCardProps {
  environment: EnvironmentId;
  current: Deployment | undefined;
  deployUrl: string;
}

/** Compact per-environment card for the Overview page; the header links to the Deploy page. */
export default function OverviewEnvironmentCard({ environment, current, deployUrl }: OverviewEnvironmentCardProps): JSX.Element {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6" component={Link} to={deployUrl} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
          {ENVIRONMENT_LABEL[environment]}
        </Typography>
        {current && <DeploymentStatusChip status={current.status} />}
      </Stack>
      <Divider sx={{ my: 2 }} />
      {current ? (
        <DeploymentSummary deployment={current} />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          This component has not been deployed to this environment yet.
        </Typography>
      )}
    </Box>
  );
}
