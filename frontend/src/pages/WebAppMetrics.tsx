import type { JSX } from 'react';
import WebAppPage from '../components/webapp/WebAppPage';
import ComingSoon from '../components/ComingSoon';

/** Metrics land with P1 (after verifying the observability plane's metrics API); the chart components are kept for it. */
export default function WebAppMetrics(): JSX.Element {
  return (
    <WebAppPage title="Metrics" description="Requests, latency, errors and resource usage." hideTrackSelect>
      {() => <ComingSoon title="Metrics" description="Request rate, latency, error and CPU/memory charts per environment. Use Runtime Logs and the Runtime page in the meantime." />}
    </WebAppPage>
  );
}
