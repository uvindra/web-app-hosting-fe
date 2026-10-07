import type { JSX } from 'react';
import { Box, CircularProgress } from '@wso2/oxygen-ui';
import { ScrollText } from '@wso2/oxygen-ui-icons-react';
import WebAppPage from '../components/webapp/WebAppPage';
import EmptyListing from '../components/EmptyListing';
import LogsFilters from '../components/logs/LogsFilters';
import LogsPanel from '../components/logs/LogsPanel';
import LogEntry from '../components/logs/LogEntry';
import { useEnvironments } from '../hooks/useBuilds';
import { useInfiniteLogs } from '../hooks/useLogs';
import { useLogsFilters } from '../hooks/useLogsFilters';
import { AUTO_FETCH_INTERVAL, PAGE_SIZE } from '../utils/logs';
import type { EnvironmentId } from '../types/webApp';
import type { TrackRef } from '../types/track';

function RuntimeLogsBody({ track, environment, environmentName }: { track: TrackRef; environment: EnvironmentId; environmentName: string }): JSX.Element {
  const filters = useLogsFilters();
  const { data: environments, isLoading: loadingEnvironments } = useEnvironments(track);
  const deployed = environments?.find((e) => e.environment === environment)?.deployed === true;

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteLogs(
    track,
    { environment, levels: filters.levelFilter, startTime: filters.startTime, endTime: filters.endTime, searchPhrase: filters.searchPhrase, sort: filters.sortDir, limit: PAGE_SIZE },
    filters.autoFetch ? AUTO_FETCH_INTERVAL : false,
    deployed,
  );

  if (loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!deployed) {
    return <EmptyListing icon={<ScrollText size={48} />} title={`Not deployed to ${environmentName}`} description="Runtime logs appear once the web app is deployed to this environment." />;
  }

  const logs = data ? data.pages.flatMap((page) => page.items) : [];

  return (
    <>
      <LogsFilters
        filters={filters}
        logs={logs}
        onRefresh={() => {
          filters.refresh();
          void refetch();
        }}
      />
      <LogsPanel
        items={logs}
        getKey={(l) => l.id}
        renderRow={(l, expanded, toggle) => <LogEntry log={l} expanded={expanded} onToggle={toggle} envName={environmentName} />}
        isLoading={isLoading}
        error={error}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onRefetch={() => void refetch()}
        onFetchNextPage={() => void fetchNextPage()}
        onClearFilters={filters.clearFilters}
      />
    </>
  );
}

export default function WebAppRuntimeLogs(): JSX.Element {
  return (
    <WebAppPage title="Runtime Logs" description="Web server and application output from your running replicas." withEnvironment>
      {({ track, environment, environmentName }) => <RuntimeLogsBody key={`${track.trackId}:${environment}`} track={track} environment={environment} environmentName={environmentName} />}
    </WebAppPage>
  );
}
