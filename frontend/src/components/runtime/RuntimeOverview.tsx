import { useState, type JSX } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useRedeploy } from '../../hooks/useRuntime';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import type { ReleaseDetails } from '../../types/runtime';
import type { EnvironmentId } from '../../types/webApp';
import type { TrackRef } from '../../types/track';

interface RuntimeOverviewProps {
  track: TrackRef;
  environment: EnvironmentId;
  release: ReleaseDetails;
}

const STATUS_COLOR = { Running: 'success', Deploying: 'warning', Failed: 'error' } as const;

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Box sx={{ minWidth: label === 'Port' ? 64 : 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontFamily: label === 'Image' ? 'monospace' : undefined, wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function RuntimeOverview({ track, environment, release }: RuntimeOverviewProps): JSX.Element {
  const redeploy = useRedeploy(track, environment);
  const [done, setDone] = useState(false);

  const onRedeploy = (): void => {
    setDone(false);
    redeploy.mutate(undefined, { onSuccess: () => setDone(true) });
  };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Typography variant="h6">Current release</Typography>
          <Chip size="small" label={release.status} color={STATUS_COLOR[release.status]} />
        </Stack>
        <Button variant="outlined" size="small" onClick={onRedeploy} disabled={redeploy.isPending} startIcon={redeploy.isPending ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={14} />}>
          Redeploy
        </Button>
      </Stack>
      {redeploy.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to redeploy the web app.
        </Alert>
      )}
      {done && (
        <Alert severity="success" onClose={() => setDone(false)} sx={{ mb: 2 }}>
          Redeployment initiated.
        </Alert>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} flexWrap="wrap" columnGap={6} rowGap={2}>
        <Field label="Image" value={release.image} />
        <Field label="Commit" value={`${release.commitSha} · ${release.commitMessage}`} />
        <Field label="Port" value={String(release.port)} />
        <Field label="Deployed" value={formatRelativeTime(release.deployedAt)} />
      </Stack>
    </Box>
  );
}
