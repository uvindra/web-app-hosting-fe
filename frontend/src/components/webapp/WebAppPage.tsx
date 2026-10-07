import { useState, type JSX, type ReactNode } from 'react';
import { Box, CircularProgress, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { AppWindow } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../EmptyListing';
import TrackSelect from './TrackSelect';
import EnvironmentSelect from './EnvironmentSelect';
import { useWebAppContext } from '../../hooks/useWebAppContext';
import type { WebAppContextState } from '../../hooks/useWebAppContext';
import { environmentLabel } from '../../constants/environments';
import type { EnvironmentId } from '../../types/webApp';

/** Shared content width so every web-app page lines up in the sidebar layout. */
export const WEB_APP_PAGE_MAX_WIDTH = 1100;

export type ReadyWebAppContext = Extract<WebAppContextState, { status: 'ready' }> & {
  /** The selected environment (pages with `withEnvironment`; otherwise the pipeline's first). */
  environment: EnvironmentId;
  environmentName: string;
};

interface WebAppPageProps {
  title: string;
  description?: string;
  /** Right-aligned header content (e.g. a primary action). */
  actions?: ReactNode;
  /** Show an environment picker (over the project's pipeline environments) in the header. */
  withEnvironment?: boolean;
  /** Hide the deployment-track picker (web-app-wide pages such as Settings → Deployment Tracks). */
  hideTrackSelect?: boolean;
  maxWidth?: number | string;
  children: (ctx: ReadyWebAppContext) => ReactNode;
}

/** Shared frame for every web-app sub-page: resolves the web app, track and environments, renders loading / not-found, then a titled page. */
export default function WebAppPage({ title, description, actions, withEnvironment = false, hideTrackSelect = false, maxWidth = WEB_APP_PAGE_MAX_WIDTH, children }: WebAppPageProps): JSX.Element {
  const ctx = useWebAppContext();
  const [chosenEnv, setChosenEnv] = useState<EnvironmentId | null>(null);

  if (ctx.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (ctx.status === 'not-found') {
    return (
      <PageContent>
        <EmptyListing icon={<AppWindow size={48} />} title="Web app not found" description="This web app doesn't exist or you don't have access to it." />
      </PageContent>
    );
  }

  const environment = chosenEnv && ctx.environments.some((e) => e.id === chosenEnv) ? chosenEnv : (ctx.environments[0]?.id ?? '');
  const ready: ReadyWebAppContext = { ...ctx, environment, environmentName: environmentLabel(ctx.environments, environment) };

  return (
    <PageContent sx={{ pt: 4, maxWidth }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h1">{title}</Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
        <Stack direction="row" alignItems="center" gap={1.5}>
          {!hideTrackSelect && <TrackSelect track={ctx.track} />}
          {withEnvironment && <EnvironmentSelect environments={ctx.environments} value={environment} onChange={setChosenEnv} />}
          {actions}
        </Stack>
      </Stack>
      {children(ready)}
    </PageContent>
  );
}
