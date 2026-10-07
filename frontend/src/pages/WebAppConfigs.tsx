import type { JSX } from 'react';
import WebAppPage from '../components/webapp/WebAppPage';
import DeployedGate from '../components/runtime/DeployedGate';
import ConfigList from '../components/configs/ConfigList';
import { isSpaPreset } from '../constants/buildPresets';

export default function WebAppConfigs(): JSX.Element {
  return (
    <WebAppPage title="Configs & Secrets" description="Environment variables, secrets and mounted files (e.g. a SPA config.js) per environment." withEnvironment>
      {({ track, environment, environmentName, webApp }) => (
        <DeployedGate track={track} environment={environment} environmentName={environmentName}>
          {/* key drops any open editor/notice when the environment changes */}
          <ConfigList key={`${track.trackId}:${environment}`} track={track} environment={environment} isSpa={isSpaPreset(webApp.buildPreset)} />
        </DeployedGate>
      )}
    </WebAppPage>
  );
}
