import { useState, type JSX } from 'react';
import { Chip, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import EmptyListing from '../EmptyListing';
import UsageBar from './UsageBar';
import PodLogsDrawer from './PodLogsDrawer';
import PodEventsDrawer from './PodEventsDrawer';
import { Activity, ScrollText, Server } from '@wso2/oxygen-ui-icons-react';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import { usagePercent } from '../../utils/podMetrics';
import type { Pod } from '../../types/runtime';
import type { EnvironmentId } from '../../types/webApp';
import type { TrackRef } from '../../types/track';

interface PodInsightsTableProps {
  track: TrackRef;
  environment: EnvironmentId;
  pods: Pod[];
}

type Drawer = { kind: 'logs' | 'events'; podName: string } | null;

const PHASE_COLOR = { Running: 'success', Pending: 'warning', Failed: 'error', Succeeded: 'default' } as const;

/** A usage bar once metrics exist (P1); "—" until then, never a fake 0%. */
function UsageCell({ used, limit, label }: { used: number | undefined; limit: number; label: string }): JSX.Element {
  if (used === undefined) {
    return (
      <Typography variant="body2" color="text.secondary" aria-label={`${label}: not available`}>
        —
      </Typography>
    );
  }
  return <UsageBar percent={usagePercent(used, limit)} label={label} />;
}

export default function PodInsightsTable({ track, environment, pods }: PodInsightsTableProps): JSX.Element {
  const [drawer, setDrawer] = useState<Drawer>(null);
  const drawerPod = drawer ? pods.find((p) => p.name === drawer.podName) : undefined;

  if (pods.length === 0) {
    return <EmptyListing icon={<Server size={48} />} title="No pods running" description="No pods are currently running for this web app in this environment." />;
  }

  return (
    <>
      <Typography variant="h6" sx={{ mb: 1.5 }}>
        Pods
      </Typography>
      {/* Scrolls inside its own container rather than clipping the actions column on narrow pages. */}
      <ListingTable.Container sx={{ overflowX: 'auto' }}>
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Name</ListingTable.Cell>
              <ListingTable.Cell>Status</ListingTable.Cell>
              <ListingTable.Cell>Ready</ListingTable.Cell>
              <ListingTable.Cell>Restarts</ListingTable.Cell>
              <ListingTable.Cell>CPU</ListingTable.Cell>
              <ListingTable.Cell>Memory</ListingTable.Cell>
              <ListingTable.Cell>Started</ListingTable.Cell>
              <ListingTable.Cell align="right">Actions</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {pods.map((p) => (
              <ListingTable.Row key={p.name}>
                <ListingTable.Cell sx={{ fontFamily: 'monospace', minWidth: 160, wordBreak: 'break-all' }}>{p.name}</ListingTable.Cell>
                <ListingTable.Cell>
                  <Chip size="small" label={p.phase} color={PHASE_COLOR[p.phase]} />
                </ListingTable.Cell>
                <ListingTable.Cell>{p.ready}</ListingTable.Cell>
                <ListingTable.Cell>{p.restarts}</ListingTable.Cell>
                <ListingTable.Cell>
                  <UsageCell used={p.cpuUsageMillicores} limit={p.cpuLimitMillicores} label={`${p.name} CPU`} />
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <UsageCell used={p.memoryUsageBytes} limit={p.memoryLimitBytes} label={`${p.name} memory`} />
                </ListingTable.Cell>
                <ListingTable.Cell sx={{ whiteSpace: 'nowrap' }}>{formatRelativeTime(p.startedAt)}</ListingTable.Cell>
                <ListingTable.Cell align="right">
                  <Stack direction="row" gap={0.5} justifyContent="flex-end">
                    <Tooltip title="Logs">
                      <IconButton size="small" aria-label={`Logs for ${p.name}`} onClick={() => setDrawer({ kind: 'logs', podName: p.name })}>
                        <ScrollText size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Events">
                      <IconButton size="small" aria-label={`Events for ${p.name}`} onClick={() => setDrawer({ kind: 'events', podName: p.name })}>
                        <Activity size={16} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </ListingTable.Cell>
              </ListingTable.Row>
            ))}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
      {drawer?.kind === 'logs' && <PodLogsDrawer track={track} environment={environment} podName={drawer.podName} onClose={() => setDrawer(null)} />}
      {drawer?.kind === 'events' && drawerPod && <PodEventsDrawer track={track} environment={environment} pod={drawerPod} onClose={() => setDrawer(null)} />}
    </>
  );
}
