import { useState, type JSX } from 'react';
import { Button, Chip, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import EmptyListing from '../EmptyListing';
import UsageBar from './UsageBar';
import PodLogsDrawer from './PodLogsDrawer';
import PodEventsDrawer from './PodEventsDrawer';
import { Server } from '@wso2/oxygen-ui-icons-react';
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
      <ListingTable.Container>
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
                <ListingTable.Cell sx={{ fontFamily: 'monospace', minWidth: 240, wordBreak: 'break-all' }}>{p.name}</ListingTable.Cell>
                <ListingTable.Cell>
                  <Chip size="small" label={p.phase} color={PHASE_COLOR[p.phase]} />
                </ListingTable.Cell>
                <ListingTable.Cell>{p.ready}</ListingTable.Cell>
                <ListingTable.Cell>{p.restarts}</ListingTable.Cell>
                <ListingTable.Cell>
                  <UsageBar percent={usagePercent(p.cpuUsageMillicores, p.cpuLimitMillicores)} label={`${p.name} CPU`} />
                </ListingTable.Cell>
                <ListingTable.Cell>
                  <UsageBar percent={usagePercent(p.memoryUsageBytes, p.memoryLimitBytes)} label={`${p.name} memory`} />
                </ListingTable.Cell>
                <ListingTable.Cell>{formatRelativeTime(p.startedAt)}</ListingTable.Cell>
                <ListingTable.Cell align="right">
                  <Stack direction="row" gap={1} justifyContent="flex-end">
                    <Button size="small" onClick={() => setDrawer({ kind: 'logs', podName: p.name })}>
                      Logs
                    </Button>
                    <Button size="small" onClick={() => setDrawer({ kind: 'events', podName: p.name })}>
                      Events
                    </Button>
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
