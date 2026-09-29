import type { JSX, ReactNode } from 'react';
import { Box, CircularProgress, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { AppWindow } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../EmptyListing';
import { useWebAppContext } from '../../hooks/useWebAppContext';
import type { WebAppContextState } from '../../hooks/useWebAppContext';

/** Shared content width so every web-app page lines up in the sidebar layout. */
export const WEB_APP_PAGE_MAX_WIDTH = 1100;

export type ReadyWebAppContext = Extract<WebAppContextState, { status: 'ready' }>;

interface WebAppPageProps {
  title: string;
  description?: string;
  /** Right-aligned header content (e.g. an environment picker or primary action). */
  actions?: ReactNode;
  maxWidth?: number | string;
  children: (ctx: ReadyWebAppContext) => ReactNode;
}

/** Shared frame for every web-app sub-page: resolves the web app, renders loading / not-found, then a titled page. */
export default function WebAppPage({ title, description, actions, maxWidth = WEB_APP_PAGE_MAX_WIDTH, children }: WebAppPageProps): JSX.Element {
  const ctx = useWebAppContext();

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
        {actions}
      </Stack>
      {children(ctx)}
    </PageContent>
  );
}
