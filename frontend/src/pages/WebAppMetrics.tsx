import { useState, type JSX } from 'react';
import { Alert, Box } from '@wso2/oxygen-ui';
import { useQueryClient } from '@tanstack/react-query';
import WebAppPage from '../components/webapp/WebAppPage';
import DeployedGate from '../components/runtime/DeployedGate';
import MetricsHeader from '../components/observability/MetricsHeader';
import MetricGraph, { type MetricSeries } from '../components/observability/MetricGraph';
import { useMetrics } from '../hooks/useMetrics';
import type { MetricsRange } from '../types/metrics';
import type { EnvironmentId } from '../types/webApp';
import { trackKey, type TrackRef } from '../types/track';

const REQUEST_SERIES: MetricSeries[] = [
  { key: 'total', name: 'Total requests', color: 'primary' },
  { key: 'success', name: 'Successful requests', color: 'success' },
];
const LATENCY_SERIES: MetricSeries[] = [
  { key: 'p50', name: 'p50', color: 'info' },
  { key: 'p90', name: 'p90', color: 'warning' },
  { key: 'p99', name: 'p99', color: 'error' },
];
const ERROR_SERIES: MetricSeries[] = [{ key: 'errorRate', name: 'Failed requests', color: 'error' }];
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

function MetricsBody({ track, environment }: { track: TrackRef; environment: EnvironmentId }): JSX.Element {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<MetricsRange>('1h');
  const [refreshSeconds, setRefreshSeconds] = useState(0);
  const metrics = useMetrics(track, environment, range, refreshSeconds, true);

  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['metrics', ...trackKey(track), environment] });
  const shared = { isLoading: metrics.isLoading, isError: metrics.isError, onRetry: refresh };
  // Hide the HTTP charts only once we know the platform has no HTTP metrics for this web app.
  const showHttp = metrics.data?.httpAvailable !== false;

  return (
    <>
      <MetricsHeader range={range} onRangeChange={setRange} refreshSeconds={refreshSeconds} onRefreshSecondsChange={setRefreshSeconds} onRefresh={refresh} isRefreshing={metrics.isFetching} />
      {!showHttp && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Request, latency and error metrics aren&apos;t available for this web app on this platform yet. CPU and memory usage are shown below.
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        {showHttp && <MetricGraph title="Request Rate" unit="requests/s" rows={metrics.data?.requestRows} series={REQUEST_SERIES} {...shared} />}
        {showHttp && <MetricGraph title="Latency" unit="ms" rows={metrics.data?.latencyRows} series={LATENCY_SERIES} {...shared} />}
        {showHttp && <MetricGraph title="Error Rate" unit="% of requests" rows={metrics.data?.errorRows} series={ERROR_SERIES} {...shared} />}
        <MetricGraph title="CPU Usage" unit="vCPU (all replicas)" rows={metrics.data?.cpuRows} series={CPU_SERIES} {...shared} />
        <MetricGraph title="Memory Usage" unit="MB (all replicas)" rows={metrics.data?.memoryRows} series={MEMORY_SERIES} {...shared} />
      </Box>
    </>
  );
}

export default function WebAppMetrics(): JSX.Element {
  return (
    <WebAppPage title="Metrics" description="Traffic, latency, errors and resource usage." withEnvironment>
      {({ track, environment, environmentName }) => (
        <DeployedGate track={track} environment={environment} environmentName={environmentName}>
          <MetricsBody key={`${track.trackId}:${environment}`} track={track} environment={environment} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
