import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, Snackbar, Stack } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import EnvironmentSelect from '../components/webapp/EnvironmentSelect';
import ScalingEditor from '../components/scaling/ScalingEditor';
import ReplicasTable from '../components/scaling/ReplicasTable';
import { useScaling, useUpdateScaling } from '../hooks/useScaling';
import type { EnvironmentId } from '../types/webApp';

interface Notice {
  severity: 'success' | 'error';
  message: string;
}

function ScalingBody({ webAppId, environment }: { webAppId: string; environment: EnvironmentId }): JSX.Element {
  const { data: scaling, isLoading, isError, refetch } = useScaling(webAppId, environment);
  const update = useUpdateScaling(webAppId, environment);
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
      <ReplicasTable webAppId={webAppId} environment={environment} />
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
  const [environment, setEnvironment] = useState<EnvironmentId>('development');
  return (
    <WebAppPage title="Scaling" description="Control how your web app scales with traffic." actions={<EnvironmentSelect value={environment} onChange={setEnvironment} />}>
      {({ webApp }) => <ScalingBody webAppId={webApp.id} environment={environment} />}
    </WebAppPage>
  );
}
