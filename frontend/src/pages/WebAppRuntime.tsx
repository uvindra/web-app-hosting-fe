import type { JSX } from 'react';
import WebAppPage from '../components/webapp/WebAppPage';
import DeployedGate from '../components/runtime/DeployedGate';
import RuntimeContent from '../components/runtime/RuntimeContent';

export default function WebAppRuntime(): JSX.Element {
  return (
    <WebAppPage title="Runtime" description="Live release, pods and resource usage." withEnvironment>
      {({ track, environment, environmentName }) => (
        <DeployedGate track={track} environment={environment} environmentName={environmentName}>
          <RuntimeContent track={track} environment={environment} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
