import type { JSX } from 'react';
import { Link } from 'react-router';
import { Box, Chip, CircularProgress, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { AppWindow, GitBranch, Github } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../components/EmptyListing';
import { WEB_APP_PAGE_MAX_WIDTH } from '../components/webapp/WebAppPage';
import { useWebAppContext } from '../hooks/useWebAppContext';
import TrackSelect from '../components/webapp/TrackSelect';
import { useBuilds } from '../hooks/useBuilds';
import { useDeployments } from '../hooks/useDeployments';
import OverviewEnvironmentCard from '../components/deploy/OverviewEnvironmentCard';
import { currentDeployment } from '../components/deploy/deploymentUtils';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { getStatusColor } from '../utils/statusColor';
import { webAppBuildUrl, webAppDeployUrl, withTrack } from '../paths';
import type { WebApp } from '../types/webApp';
import type { TrackRef } from '../types/track';

function SourceLink({ webApp }: { webApp: WebApp }): JSX.Element | null {
  if (!webApp.repoUrl) return null;
  const Icon = webApp.sourceType === 'github' ? Github : GitBranch;
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Typography variant="body2" color="text.secondary">
        Source:
      </Typography>
      <Icon size={14} />
      <Typography
        variant="body2"
        component="a"
        href={webApp.repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={webApp.repoUrl}>
        {webApp.repoUrl}
      </Typography>
    </Stack>
  );
}

function LatestBuildCard({ track, buildUrl }: { track: TrackRef; buildUrl: string }): JSX.Element {
  const { data: builds, isLoading } = useBuilds(track);
  const lastBuild = builds?.[0];

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, mb: 3 }}>
      <Typography variant="h6" component={Link} to={buildUrl} sx={{ display: 'block', color: 'inherit', textDecoration: 'none', '&:hover': { color: 'primary.main' }, mb: lastBuild || isLoading ? 1.5 : 0 }}>
        Latest Build
      </Typography>
      {isLoading ? (
        <CircularProgress size={18} />
      ) : lastBuild ? (
        <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
          <Chip label={lastBuild.status === 'success' ? 'Success' : lastBuild.status === 'failed' ? 'Failed' : 'In Progress'} color={lastBuild.status === 'success' ? 'success' : lastBuild.status === 'failed' ? 'error' : 'warning'} size="small" />
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {lastBuild.commitSha}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {lastBuild.commitMessage}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatRelativeTime(lastBuild.triggeredAt)}
          </Typography>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No builds yet.
        </Typography>
      )}
    </Box>
  );
}

/** Wireframe page 8 — the created web app's overview: source/commit header, latest build, per-environment deployment status. */
export default function WebAppOverview(): JSX.Element {
  const ctx = useWebAppContext();
  const ready = ctx.status === 'ready' ? ctx : undefined;
  const { data: deployments, isLoading: loadingDeployments } = useDeployments(ready?.track ?? { webAppId: '', trackId: '' });

  if (ctx.status === 'loading') {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (ctx.status === 'not-found' || !ready) {
    return (
      <PageContent>
        <EmptyListing icon={<AppWindow size={48} />} title="Web app not found" description="This web app doesn't exist or you don't have access to it." />
      </PageContent>
    );
  }

  const { scope, webApp, track, environments } = ready;
  const deployUrl = withTrack(webAppDeployUrl(scope.org, scope.project, scope.webApp), track.trackId === webApp.defaultTrackId ? null : track.trackId);
  return (
    <PageContent sx={{ pt: 4, maxWidth: WEB_APP_PAGE_MAX_WIDTH }}>
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 1 }}>
        <AppWindow size={32} />
        <Typography variant="h1">{webApp.displayName}</Typography>
        <Chip label={webApp.status === 'active' ? 'Active' : webApp.status} color={getStatusColor(webApp.status)} size="small" />
        <Box sx={{ flex: 1 }} />
        <TrackSelect track={track} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Web Application
      </Typography>

      <Stack gap={0.75} sx={{ mb: 4 }}>
        <SourceLink webApp={webApp} />
        {webApp.latestCommit && (
          <Stack direction="row" alignItems="center" gap={1}>
            <Typography variant="body2" color="text.secondary">
              Latest Commit on Source:
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {webApp.latestCommit.sha}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {webApp.latestCommit.message}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatRelativeTime(webApp.latestCommit.committedAt)} by {webApp.latestCommit.author}
            </Typography>
          </Stack>
        )}
      </Stack>

      <LatestBuildCard track={track} buildUrl={withTrack(webAppBuildUrl(scope.org, scope.project, scope.webApp), track.trackId === webApp.defaultTrackId ? null : track.trackId)} />

      {loadingDeployments ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        environments.map((env) => <OverviewEnvironmentCard key={env.id} environment={env.id} environmentName={env.name} current={currentDeployment(deployments ?? [], env.id)} deployUrl={deployUrl} />)
      )}
    </PageContent>
  );
}
