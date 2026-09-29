import type { JSX } from 'react';
import { Alert, Box, Chip, CircularProgress, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import PodDrawerShell from './PodDrawerShell';
import { usePodEvents } from '../../hooks/useRuntime';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import type { Pod } from '../../types/runtime';
import type { EnvironmentId } from '../../types/webApp';

interface PodEventsDrawerProps {
  webAppId: string;
  environment: EnvironmentId;
  pod: Pod;
  onClose: () => void;
}

export default function PodEventsDrawer({ webAppId, environment, pod, onClose }: PodEventsDrawerProps): JSX.Element {
  const { data, isLoading, isError } = usePodEvents(webAppId, environment, pod.name);

  if (isLoading) {
    return (
      <PodDrawerShell title="Pod events" podName={pod.name} onClose={onClose}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      </PodDrawerShell>
    );
  }
  if (isError || !data) {
    return (
      <PodDrawerShell title="Pod events" podName={pod.name} onClose={onClose}>
        <Alert severity="error">Failed to load events.</Alert>
      </PodDrawerShell>
    );
  }
  return (
    <PodDrawerShell title="Pod events" podName={pod.name} onClose={onClose}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Conditions
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 3 }}>
        {pod.conditions.map((c) => (
          <Chip key={c.type} size="small" variant="outlined" color={c.status === 'True' ? 'success' : 'warning'} label={c.type} />
        ))}
      </Stack>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Events
      </Typography>
      {data.length === 0 ? (
        <Alert severity="info">No events for this pod.</Alert>
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Type</ListingTable.Cell>
                <ListingTable.Cell>Reason</ListingTable.Cell>
                <ListingTable.Cell>Message</ListingTable.Cell>
                <ListingTable.Cell>Last seen</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {data.map((e, i) => (
                <ListingTable.Row key={`${e.reason}-${i}`}>
                  <ListingTable.Cell>
                    <Chip size="small" variant="outlined" color={e.type === 'Warning' ? 'warning' : 'default'} label={e.type} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>{e.reason}</ListingTable.Cell>
                  <ListingTable.Cell>{e.message}</ListingTable.Cell>
                  <ListingTable.Cell>{formatRelativeTime(e.lastSeen)}</ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}
    </PodDrawerShell>
  );
}
