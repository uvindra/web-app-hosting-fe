import type { JSX } from 'react';
import { Alert, Box, Button, CircularProgress } from '@wso2/oxygen-ui';
import { RefreshCw } from '@wso2/oxygen-ui-icons-react';
import PodDrawerShell from './PodDrawerShell';
import { usePodLogs } from '../../hooks/useRuntime';
import type { EnvironmentId } from '../../types/webApp';
import type { TrackRef } from '../../types/track';

interface PodLogsDrawerProps {
  track: TrackRef;
  environment: EnvironmentId;
  podName: string;
  onClose: () => void;
}

export default function PodLogsDrawer({ track, environment, podName, onClose }: PodLogsDrawerProps): JSX.Element {
  const { data, isLoading, isError, isFetching, refetch } = usePodLogs(track, environment, podName);

  const refresh = (
    <Button size="small" variant="outlined" onClick={() => void refetch()} disabled={isFetching} startIcon={<RefreshCw size={14} />}>
      Refresh
    </Button>
  );

  if (isLoading) {
    return (
      <PodDrawerShell title="Pod logs" podName={podName} onClose={onClose}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      </PodDrawerShell>
    );
  }
  if (isError || !data) {
    return (
      <PodDrawerShell title="Pod logs" podName={podName} onClose={onClose} headerActions={refresh}>
        <Alert severity="error">Failed to load logs.</Alert>
      </PodDrawerShell>
    );
  }
  return (
    <PodDrawerShell title="Pod logs" podName={podName} onClose={onClose} headerActions={refresh}>
      {data.length === 0 ? (
        <Alert severity="info">No logs available for this pod.</Alert>
      ) : (
        <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {data.join('\n')}
        </Box>
      )}
    </PodDrawerShell>
  );
}
