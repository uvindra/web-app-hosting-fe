import { useState } from 'react';
import type { JSX } from 'react';
import { Alert, Box, Button, Divider, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowDown, History, RefreshCw, Rocket, Square } from '@wso2/oxygen-ui-icons-react';
import type { Deployment } from '../../types/deployment';
import type { EnvironmentId } from '../../types/webApp';
import { ENVIRONMENT_LABEL } from '../../constants/environments';
import DeploymentHistoryDrawer from './DeploymentHistoryDrawer';
import DeploymentStatusChip from './DeploymentStatusChip';
import DeploymentSummary from './DeploymentSummary';

interface DeployEnvironmentCardProps {
  environment: EnvironmentId;
  current: Deployment | undefined;
  history: Deployment[];
  /** Label of the next environment in the pipeline; undefined for the last one. */
  promoteTargetName?: string;
  /** Whether a build is available to deploy directly into this environment (first stage only). */
  canDeployBuild: boolean;
  busy: boolean;
  error?: string;
  onDeployBuild: () => void;
  onRedeploy: () => void;
  onStop: () => void;
  onPromote: () => void;
}

export default function DeployEnvironmentCard({ environment, current, history, promoteTargetName, canDeployBuild, busy, error, onDeployBuild, onRedeploy, onStop, onPromote }: DeployEnvironmentCardProps): JSX.Element {
  const [historyOpen, setHistoryOpen] = useState(false);
  const envName = ENVIRONMENT_LABEL[environment];
  const running = current?.status === 'active';

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6" component="h2">
          {envName}
        </Typography>
        <Stack direction="row" alignItems="center" gap={1}>
          {current && <DeploymentStatusChip status={current.status} />}
          <Button size="small" variant="text" startIcon={<History size={14} />} onClick={() => setHistoryOpen(true)}>
            History
          </Button>
        </Stack>
      </Stack>
      <Divider sx={{ my: 2 }} />

      {current ? (
        <DeploymentSummary deployment={current} />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          This web app has not been deployed to this environment yet.
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Scale to zero is enabled: the app scales down when idle and starts on the first request.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
        {canDeployBuild && !current && (
          <Button variant="contained" size="small" startIcon={<Rocket size={14} />} disabled={busy} onClick={onDeployBuild}>
            Deploy
          </Button>
        )}
        {current && (
          <Button variant="outlined" size="small" startIcon={<RefreshCw size={14} />} disabled={busy || current.status === 'deploying'} onClick={onRedeploy}>
            {current.status === 'stopped' ? 'Start' : 'Redeploy'}
          </Button>
        )}
        {current && current.status !== 'stopped' && (
          <Button variant="outlined" size="small" color="error" startIcon={<Square size={14} />} disabled={busy} onClick={onStop}>
            Stop
          </Button>
        )}
        {promoteTargetName && (
          <Tooltip title={running ? '' : 'Only an active deployment can be promoted'}>
            <span>
              <Button variant="outlined" size="small" startIcon={<ArrowDown size={14} />} disabled={busy || !running} onClick={onPromote}>
                {`Promote to ${promoteTargetName}`}
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>

      <DeploymentHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} envName={envName} deployments={history} />
    </Box>
  );
}
