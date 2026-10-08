import type { JSX } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleCheck, Info, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useReplicas } from '../../hooks/useScaling';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import type { EnvironmentId } from '../../types/webApp';
import type { TrackRef } from '../../types/track';

interface ReplicasTableProps {
  track: TrackRef;
  environment: EnvironmentId;
}

export default function ReplicasTable({ track, environment }: ReplicasTableProps): JSX.Element {
  const { data: pods, isLoading, isError, isFetching, refetch } = useReplicas(track, environment);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !pods) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void refetch()}>
            Retry
          </Button>
        }>
        Failed to load replicas.
      </Alert>
    );
  }

  const running = pods.filter((p) => p.status === 'Running').length;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Replicas
        </Typography>
        <Stack direction="row" alignItems="center" gap={1}>
          <Info size={16} />
          <Typography variant="body2" color="text.secondary">
            {running}/{pods.length} Running
          </Typography>
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" aria-label="Refresh replicas" onClick={() => void refetch()} disabled={isFetching}>
                {isFetching ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {pods.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
          No running replicas.
        </Typography>
      ) : (
        <ListingTable.Container sx={{ overflowX: 'auto' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Replica</ListingTable.Cell>
                <ListingTable.Cell>CPU usage</ListingTable.Cell>
                <ListingTable.Cell>Memory usage</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell>Ready</ListingTable.Cell>
                <ListingTable.Cell>Restarts</ListingTable.Cell>
                <ListingTable.Cell>Started</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {pods.map((pod) => (
                <ListingTable.Row key={pod.name}>
                  <ListingTable.Cell>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {pod.name}
                    </Typography>
                  </ListingTable.Cell>
                  {/* Per-replica usage is only known for a single replica (the platform reports totals): "—" otherwise, never a fake 0. */}
                  <ListingTable.Cell>{pod.cpuUsage === undefined ? '—' : `${pod.cpuUsage.toFixed(3)} vCPU`}</ListingTable.Cell>
                  <ListingTable.Cell>{pod.memoryUsageMb === undefined ? '—' : `${pod.memoryUsageMb} MB`}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Chip icon={pod.status === 'Running' ? <CircleCheck size={14} /> : <Info size={14} />} label={pod.status} size="small" variant="outlined" color={pod.status === 'Running' ? 'success' : 'default'} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    {pod.readyContainers} / {pod.totalContainers}
                  </ListingTable.Cell>
                  <ListingTable.Cell>{pod.restarts}</ListingTable.Cell>
                  <ListingTable.Cell>{formatRelativeTime(pod.startedAt)}</ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}
    </Box>
  );
}
