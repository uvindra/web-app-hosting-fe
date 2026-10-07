import type { JSX } from 'react';
import WebAppPage from '../components/webapp/WebAppPage';
import ComingSoon from '../components/ComingSoon';

/** Health checks (liveness/readiness probes) land with P1; the probe editor components are kept for it. */
export default function WebAppHealthChecks(): JSX.Element {
  return (
    <WebAppPage title="Health Checks" description="Liveness and readiness probes for your web app." hideTrackSelect>
      {() => <ComingSoon title="Health checks" description="Configure liveness and readiness probes per environment. Until then, a web app is considered ready once its container starts." />}
    </WebAppPage>
  );
}
