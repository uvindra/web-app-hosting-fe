import { useState, type JSX } from 'react';
import { Box, CircularProgress } from '@wso2/oxygen-ui';
import { ChartLine } from '@wso2/oxygen-ui-icons-react';
import { useQueryClient } from '@tanstack/react-query';
import WebAppPage from '../components/webapp/WebAppPage';
import EnvironmentSelect from '../components/webapp/EnvironmentSelect';
import EmptyListing from '../components/EmptyListing';
import MetricsHeader from '../components/observability/MetricsHeader';
import MetricGraph, { type MetricSeries } from '../components/observability/MetricGraph';
import { useEnvironments } from '../hooks/useBuilds';
import { useMetrics } from '../hooks/useMetrics';
import { ENVIRONMENT_LABEL } from '../constants/environments';
import type { MetricsRange } from '../types/metrics';
import type { EnvironmentId } from '../types/webApp';

const REQUEST_SERIES: MetricSeries[] = [
  { key: 'total', name: 'Total requests', color: 'primary' },
  { key: 'success', name: 'Successful requests', color: 'success' },
];
const LATENCY_SERIES: MetricSeries[] = [
  { key: 'p50', name: 'p50', color: 'info' },
  { key: 'p95', name: 'p95', color: 'warning' },
  { key: 'p99', name: 'p99', color: 'error' },
];
const ERROR_SERIES: MetricSeries[] = [
  { key: 'clientErrors', name: '4xx client errors', color: 'warning' },
  { key: 'serverErrors', name: '5xx server errors', color: 'error' },
];
const CPU_SERIES: MetricSeries[] = [
  { key: 'usage', name: 'CPU usage', color: 'primary' },
  { key: 'request', name: 'CPU request', color: 'info', dashed: true },
  { key: 'limit', name: 'CPU limit', color: 'error', dashed: true },
];
const MEMORY_SERIES: MetricSeries[] = [
  { key: 'usage', name: 'Memory usage', color: 'primary' },
  { key: 'request', name: 'Memory request', color: 'info', dashed: true },
  { key: 'limit', name: 'Memory limit', color: 'error', dashed: true },
];

function MetricsBody({ webAppId, environment }: { webAppId: string; environment: EnvironmentId }): JSX.Element {
  const queryClient = useQueryClient();
  const { data: environments, isLoading: loadingEnvironments } = useEnvironments(webAppId);
  const [range, setRange] = useState<MetricsRange>('24h');
  const [refreshSeconds, setRefreshSeconds] = useState(0);

  const deployed = environments?.find((e) => e.environment === environment)?.deployed === true;
  const metrics = useMetrics(webAppId, environment, range, refreshSeconds, deployed);

  if (loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!deployed) {
    return <EmptyListing icon={<ChartLine size={48} />} title={`Not deployed to ${ENVIRONMENT_LABEL[environment]}`} description="Metrics appear once the web app is deployed to this environment and receiving traffic." />;
  }

  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['metrics', webAppId, environment] });
  const shared = { isLoading: metrics.isLoading, isError: metrics.isError, onRetry: refresh };

  return (
    <>
      <MetricsHeader range={range} onRangeChange={setRange} refreshSeconds={refreshSeconds} onRefreshSecondsChange={setRefreshSeconds} onRefresh={refresh} isRefreshing={metrics.isFetching} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        <MetricGraph title="Request Rate" unit="requests/s" rows={metrics.data?.requestRows} series={REQUEST_SERIES} {...shared} />
        <MetricGraph title="Latency" unit="ms" rows={metrics.data?.latencyRows} series={LATENCY_SERIES} {...shared} />
        <MetricGraph title="Error Rate" unit="% of requests" rows={metrics.data?.errorRows} series={ERROR_SERIES} {...shared} />
        <MetricGraph title="CPU Usage" unit="vCPU" rows={metrics.data?.cpuRows} series={CPU_SERIES} {...shared} />
        <MetricGraph title="Memory Usage" unit="MB" rows={metrics.data?.memoryRows} series={MEMORY_SERIES} {...shared} />
      </Box>
    </>
  );
}

export default function WebAppMetrics(): JSX.Element {
  const [environment, setEnvironment] = useState<EnvironmentId>('development');
  return (
    <WebAppPage title="Metrics" description="Traffic, latency, errors and resource usage." actions={<EnvironmentSelect value={environment} onChange={setEnvironment} />}>
      {({ webApp }) => <MetricsBody webAppId={webApp.id} environment={environment} />}
    </WebAppPage>
  );
}
