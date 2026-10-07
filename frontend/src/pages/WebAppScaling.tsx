import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, Snackbar, Stack } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import ScalingEditor from '../components/scaling/ScalingEditor';
import ReplicasTable from '../components/scaling/ReplicasTable';
import DeployedGate from '../components/runtime/DeployedGate';
import { useScaling, useUpdateScaling } from '../hooks/useScaling';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';

interface Notice {
  severity: 'success' | 'error';
  message: string;
}

function ScalingBody({ track, environment }: { track: TrackRef; environment: EnvironmentId }): JSX.Element {
  const { data: scaling, isLoading, isError, refetch } = useScaling(track, environment);
  const update = useUpdateScaling(track, environment);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !scaling) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void refetch()}>
            Retry
          </Button>
        }>
        Failed to load the scaling configuration.
      </Alert>
    );
  }

  return (
    <Stack gap={4}>
      <ScalingEditor
        key={JSON.stringify(scaling)}
        saved={scaling}
        isSaving={update.isPending}
        onSave={(config) =>
          update.mutate(config, {
            onSuccess: () => setNotice({ severity: 'success', message: 'Scaling configuration saved.' }),
            onError: (e) => setNotice({ severity: 'error', message: e instanceof Error ? e.message : 'Failed to save the scaling configuration.' }),
          })
        }
      />
      <ReplicasTable track={track} environment={environment} />
      <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {notice ? (
          <Alert severity={notice.severity} onClose={() => setNotice(null)} variant="filled">
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}

export default function WebAppScaling(): JSX.Element {
  return (
    <WebAppPage title="Scaling" description="Set how many replicas run in each environment. Autoscaling (HPA) is coming soon." withEnvironment>
      {({ track, environment, environmentName }) => (
        <DeployedGate track={track} environment={environment} environmentName={environmentName}>
          <ScalingBody key={`${track.trackId}:${environment}`} track={track} environment={environment} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
