import type { JSX } from 'react';
import { Alert, Box, CircularProgress } from '@wso2/oxygen-ui';
import RuntimeOverview from './RuntimeOverview';
import ResourceUsageCards from './ResourceUsageCards';
import PodInsightsTable from './PodInsightsTable';
import { usePods, useReleaseDetails } from '../../hooks/useRuntime';
import type { EnvironmentId } from '../../types/webApp';

export default function RuntimeContent({ webAppId, environment }: { webAppId: string; environment: EnvironmentId }): JSX.Element {
  const release = useReleaseDetails(webAppId, environment);
  const pods = usePods(webAppId, environment);

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
      <RuntimeOverview webAppId={webAppId} environment={environment} release={release.data} />
      <ResourceUsageCards pods={pods.data} />
      <PodInsightsTable webAppId={webAppId} environment={environment} pods={pods.data} />
    </>
  );
}
