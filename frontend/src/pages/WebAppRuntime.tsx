import { useState, type JSX } from 'react';
import WebAppPage from '../components/webapp/WebAppPage';
import EnvironmentSelect from '../components/webapp/EnvironmentSelect';
import DeployedGate from '../components/runtime/DeployedGate';
import RuntimeContent from '../components/runtime/RuntimeContent';
import type { EnvironmentId } from '../types/webApp';

export default function WebAppRuntime(): JSX.Element {
  const [env, setEnv] = useState<EnvironmentId>('development');
  return (
    <WebAppPage title="Runtime" description="Live release, pods and resource usage." actions={<EnvironmentSelect value={env} onChange={setEnv} />}>
      {({ webApp }) => (
        <DeployedGate webAppId={webApp.id} environment={env}>
          <RuntimeContent webAppId={webApp.id} environment={env} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
