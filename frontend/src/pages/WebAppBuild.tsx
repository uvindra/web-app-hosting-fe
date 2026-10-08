import { useState } from 'react';
import type { JSX } from 'react';
import { Alert, Box, CircularProgress, Stack } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import BuildConfigPanel from '../components/build/BuildConfigPanel';
import BuildDetailsDrawer from '../components/build/BuildDetailsDrawer';
import BuildHistory from '../components/build/BuildHistory';
import LatestCommitCard from '../components/build/LatestCommitCard';
import { useBuildConfig, useBuildLogs, useBuildRuns, useLatestCommit, useTriggerBuild } from '../hooks/useBuilds';
import type { TrackRef } from '../types/track';

function BuildContent({ track }: { track: TrackRef }): JSX.Element {
  const config = useBuildConfig(track);
  const runs = useBuildRuns(track);
  const commit = useLatestCommit(track);
  const trigger = useTriggerBuild(track);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const selectedRun = runs.data?.find((r) => r.id === selectedId);
  // Step logs load on demand for the open build (live while it runs, archived afterwards).
  const logs = useBuildLogs(track, selectedId, selectedRun?.status === 'in-progress');

  // The latest commit (read from GitHub) degrades inside its own card; it doesn't block the page.
  if (config.isLoading || runs.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (config.isError || runs.isError || !config.data || !runs.data) {
    return <Alert severity="error">Failed to load build information.</Alert>;
  }

  // Status comes from the polled list; steps + logs from the logs query once loaded.
  const selected = selectedRun && logs.data ? { ...selectedRun, steps: logs.data.steps } : selectedRun;

  return (
    <Stack gap={3}>
      {trigger.isError && <Alert severity="error">Failed to trigger build: {trigger.error instanceof Error ? trigger.error.message : 'unknown error'}</Alert>}
      <LatestCommitCard
        commit={commit.data}
        loading={commit.isLoading}
        error={commit.error}
        onRetry={() => void commit.refetch()}
        building={trigger.isPending || runs.data.some((r) => r.status === 'in-progress')}
        onBuild={() => trigger.mutate(commit.data)}
      />
      <BuildHistory builds={runs.data} selectedId={selectedId} onSelect={(b) => setSelectedId(b.id)} />
      <BuildConfigPanel config={config.data} />
      <BuildDetailsDrawer build={selected} onClose={() => setSelectedId(undefined)} />
    </Stack>
  );
}

export default function WebAppBuild(): JSX.Element {
  return (
    <WebAppPage title="Build" description="Build your web app from source and review build history.">
      {({ track }) => <BuildContent track={track} />}
    </WebAppPage>
  );
}
