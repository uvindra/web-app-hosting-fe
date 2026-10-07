import { useState } from 'react';
import type { JSX } from 'react';
import { Alert, Box, CircularProgress, Stack } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import BuildConfigPanel from '../components/build/BuildConfigPanel';
import BuildDetailsDrawer from '../components/build/BuildDetailsDrawer';
import BuildHistory from '../components/build/BuildHistory';
import LatestCommitCard from '../components/build/LatestCommitCard';
import { useBuildConfig, useBuildRuns, useLatestCommit, useTriggerBuild } from '../hooks/useBuilds';
import type { WebApp } from '../types/webApp';

function BuildContent({ webApp }: { webApp: WebApp }): JSX.Element {
  const config = useBuildConfig(webApp.id, webApp.repoUrl);
  const runs = useBuildRuns(webApp.id);
  const commit = useLatestCommit(webApp.id, webApp.repoUrl, config.data?.branch);
  const trigger = useTriggerBuild(webApp.id);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  if (config.isLoading || runs.isLoading || commit.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (config.isError || runs.isError || commit.isError || !config.data || !runs.data || !commit.data) {
    return <Alert severity="error">Failed to load build information.</Alert>;
  }

  const commitData = commit.data;
  // Derive from the polled list so the open drawer reflects live status/logs.
  const selected = runs.data.find((r) => r.id === selectedId);

  return (
    <Stack gap={3}>
      {trigger.isError && <Alert severity="error">Failed to trigger build.</Alert>}
      <LatestCommitCard commit={commitData} building={trigger.isPending || runs.data.some((r) => r.status === 'in-progress')} onBuild={() => trigger.mutate(commitData)} />
      <BuildHistory builds={runs.data} selectedId={selectedId} onSelect={(b) => setSelectedId(b.id)} />
      <BuildConfigPanel config={config.data} />
      <BuildDetailsDrawer build={selected} onClose={() => setSelectedId(undefined)} />
    </Stack>
  );
}

export default function WebAppBuild(): JSX.Element {
  return (
    <WebAppPage title="Build" description="Build your web app from source and review build history.">
      {({ webApp }) => <BuildContent webApp={webApp} />}
    </WebAppPage>
  );
}
