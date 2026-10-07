import { useState, type JSX } from 'react';
import WebAppPage from '../components/webapp/WebAppPage';
import EnvironmentSelect from '../components/webapp/EnvironmentSelect';
import DeployedGate from '../components/runtime/DeployedGate';
import ConfigList from '../components/configs/ConfigList';
import type { EnvironmentId } from '../types/webApp';

export default function WebAppConfigs(): JSX.Element {
  const [env, setEnv] = useState<EnvironmentId>('development');
  return (
    <WebAppPage title="Configs & Secrets" description="Environment variables and secrets injected into the web app." actions={<EnvironmentSelect value={env} onChange={setEnv} />}>
      {({ webApp }) => (
        <DeployedGate webAppId={webApp.id} environment={env}>
          {/* key drops any open editor/notice when the environment changes */}
          <ConfigList key={env} webAppId={webApp.id} environment={env} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
