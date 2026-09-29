import type { JSX } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Tab, Tabs } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import { webAppDeploymentTracksUrl, webAppUrlSettingsUrl } from '../paths';

export default function WebAppSettings(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <WebAppPage title="Settings">
      {(ctx) => {
        const { org, project, webApp } = ctx.scope;
        const tabs = [
          { label: 'Deployment Tracks', url: webAppDeploymentTracksUrl(org, project, webApp) },
          { label: 'URL Settings', url: webAppUrlSettingsUrl(org, project, webApp) },
        ];
        const active = tabs.find((t) => pathname.startsWith(t.url))?.url ?? false;
        return (
          <>
            <Tabs value={active} onChange={(_, url: string) => navigate(url)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
              {tabs.map((t) => (
                <Tab key={t.url} label={t.label} value={t.url} />
              ))}
            </Tabs>
            <Outlet context={ctx} />
          </>
        );
      }}
    </WebAppPage>
  );
}
