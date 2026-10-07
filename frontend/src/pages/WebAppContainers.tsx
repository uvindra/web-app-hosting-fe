import { useState, type JSX } from 'react';
import { Alert, Box, CircularProgress } from '@wso2/oxygen-ui';
import { Box as BoxIcon } from '@wso2/oxygen-ui-icons-react';
import WebAppPage from '../components/webapp/WebAppPage';
import EmptyListing from '../components/EmptyListing';
import DeployedGate from '../components/runtime/DeployedGate';
import ContainerInfoCard from '../components/containers/ContainerInfoCard';
import { useContainers } from '../hooks/useContainers';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';

type Notice = { type: 'success' | 'error'; message: string } | null;

function ContainersContent({ track, environment }: { track: TrackRef; environment: EnvironmentId }): JSX.Element {
  const { data, isLoading, isError } = useContainers(track, environment);
  const [notice, setNotice] = useState<Notice>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !data) {
    return <Alert severity="error">Failed to load containers.</Alert>;
  }
  if (data.length === 0) {
    return <EmptyListing icon={<BoxIcon size={48} />} title="No containers" description="This web app has no containers in the selected environment yet." />;
  }
  return (
    <>
      {notice && (
        <Alert severity={notice.type} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.message}
        </Alert>
      )}
      {data.map((c) => (
        <ContainerInfoCard key={c.id} container={c} track={track} environment={environment} onSaved={(message) => setNotice({ type: 'success', message })} onError={(message) => setNotice({ type: 'error', message })} />
      ))}
    </>
  );
}

export default function WebAppContainers(): JSX.Element {
  return (
    <WebAppPage title="Containers" description="Image, ports and resources of the web app's containers." withEnvironment>
      {({ track, environment, environmentName }) => (
        <DeployedGate track={track} environment={environment} environmentName={environmentName}>
          {/* key resets notices when the track or environment changes */}
          <ContainersContent key={`${track.trackId}:${environment}`} track={track} environment={environment} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
