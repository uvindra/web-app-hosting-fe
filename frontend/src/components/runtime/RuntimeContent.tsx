import type { JSX } from 'react';
import { Alert, Box, CircularProgress } from '@wso2/oxygen-ui';
import RuntimeOverview from './RuntimeOverview';
import ResourceUsageCards from './ResourceUsageCards';
import PodInsightsTable from './PodInsightsTable';
import { usePods, useReleaseDetails } from '../../hooks/useRuntime';
import { useUsage } from '../../hooks/useMetrics';
import type { EnvironmentId } from '../../types/webApp';
import type { TrackRef } from '../../types/track';

export default function RuntimeContent({ track, environment }: { track: TrackRef; environment: EnvironmentId }): JSX.Element {
  const release = useReleaseDetails(track, environment);
  const pods = usePods(track, environment);
  // Decoration: the cards fall back to request/limit without it.
  const usage = useUsage(track, environment);

  if (release.isLoading || pods.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (release.isError || pods.isError || !release.data || !pods.data) {
    return <Alert severity="error">Failed to load runtime details.</Alert>;
  }
  return (
    <>
      <RuntimeOverview track={track} environment={environment} release={release.data} />
      <ResourceUsageCards pods={pods.data} usage={usage.data} />
      <PodInsightsTable track={track} environment={environment} pods={pods.data} />
    </>
  );
}
