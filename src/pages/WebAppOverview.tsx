import type { JSX } from 'react';
import { Box, Chip, CircularProgress, Divider, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { AppWindow, GitBranch, Github } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../components/EmptyListing';
import { useProjectByHandler } from '../hooks/useProjects';
import { useWebAppByHandler } from '../hooks/useWebApps';
import { useBuilds, useEnvironments } from '../hooks/useBuilds';
import { hasProject, hasWebApp, useScope } from '../nav';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { getStatusColor } from '../utils/statusColor';
import type { EnvironmentDeployment, WebApp } from '../types/webApp';

const ENV_LABEL: Record<EnvironmentDeployment['environment'], string> = {
  development: 'Development',
  production: 'Production',
};

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

function LatestBuildCard({ webAppId }: { webAppId: string }): JSX.Element {
  const { data: builds, isLoading } = useBuilds(webAppId);
  const lastBuild = builds?.[0];

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, mb: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: lastBuild || isLoading ? 1.5 : 0 }}>
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

function EnvironmentCard({ env }: { env: EnvironmentDeployment }): JSX.Element {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6" component="h2">
          {ENV_LABEL[env.environment]}
        </Typography>
        {env.deployed && env.status && <Chip label={env.status === 'active' ? 'Active' : env.status} color={getStatusColor(env.status)} size="small" />}
      </Stack>
      {!env.deployed && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            This component has not been deployed to this environment yet.
          </Typography>
        </>
      )}
    </Box>
  );
}

/** Wireframe page 8 — the created web app's overview: source/commit header, latest build, per-environment deployment status. */
export default function WebAppOverview(): JSX.Element {
  const scope = useScope();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const webAppHandler = hasWebApp(scope) ? scope.webApp : '';

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const projectId = project?.id ?? '';
  const { data: webApp, isLoading: loadingWebApp } = useWebAppByHandler(projectId, webAppHandler);
  const { data: environments, isLoading: loadingEnvironments } = useEnvironments(webApp?.id ?? '');

  if (loadingProject || (loadingWebApp && !!projectId)) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!project || !webApp) {
    return (
      <PageContent>
        <EmptyListing icon={<AppWindow size={48} />} title="Web app not found" description="This web app doesn't exist or you don't have access to it." />
      </PageContent>
    );
  }

  return (
    <PageContent sx={{ pt: 4, maxWidth: 900 }}>
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 1 }}>
        <AppWindow size={32} />
        <Typography variant="h1">{webApp.displayName}</Typography>
        <Chip label={webApp.status === 'active' ? 'Active' : webApp.status} color={getStatusColor(webApp.status)} size="small" />
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

      <LatestBuildCard webAppId={webApp.id} />

      {loadingEnvironments ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        (environments ?? []).map((env) => <EnvironmentCard key={env.environment} env={env} />)
      )}
    </PageContent>
  );
}
