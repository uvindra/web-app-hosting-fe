import { useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Grid, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Cloud, Container, GitFork, Github, Gitlab, MoreHorizontal } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../components/EmptyListing';
import SampleCard from '../components/SampleCard';
import { useProjectByHandler } from '../hooks/useProjects';
import { useCreateWebApp } from '../hooks/useWebApps';
import { useSamples } from '../hooks/useSamples';
import { hasProject, useScope } from '../nav';
import { buildGitHubOAuthUrl, configureWebAppUrl, newWebAppUrl, webAppOverviewUrl } from '../paths';
import { generateAndSaveGitHubState, validateAndClearGitHubState } from '../auth/tokenManager';
import { toHandler } from '../utils/toHandler';
import type { Sample } from '../types/sample';
import type { WebAppSourceType } from '../types/webApp';

const GITHUB_BROADCAST_CHANNEL = 'EXTERNALOAUTH';
const POPUP_DIMENSIONS = 'width=800,height=600';
const POPUP_POLL_INTERVAL_MS = 500;

type OtherProvider = 'bitbucket' | 'gitlab' | 'azure';

const OTHER_PROVIDERS: { id: OtherProvider; label: string; Icon: typeof Gitlab }[] = [
  { id: 'gitlab', label: 'GitLab', Icon: Gitlab },
  { id: 'bitbucket', label: 'Bitbucket', Icon: GitFork },
  { id: 'azure', label: 'Azure DevOps', Icon: Cloud },
];

/** Wireframe page 5 — expanded git-provider options once "Import a repository from" is chosen. */
export default function ImportWebAppOptions(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const [deployingSampleId, setDeployingSampleId] = useState<string | null>(null);
  const [showOtherProviders, setShowOtherProviders] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
      channelRef.current?.close();
    },
    [],
  );

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const projectId = project?.id ?? '';
  const { data: samples, isLoading: loadingSamples } = useSamples();
  const createWebApp = useCreateWebApp(projectId);

  if (loadingProject) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!project) {
    return (
      <PageContent>
        <EmptyListing icon={<Container size={48} />} title="Project not found" description="This project doesn't exist or you don't have access to it." />
      </PageContent>
    );
  }

  const goToConfigure = (state: { sourceType: WebAppSourceType; provider?: OtherProvider; authenticated?: boolean }) => navigate(configureWebAppUrl(scope.org, project.handler), { state });

  // Continue With GitHub — opens the WSO2 GitHub App OAuth popup. There's no backend yet to
  // exchange the returned code for a token, so once we capture it we treat the connection as
  // "authenticated" for UI purposes only (the configure page falls back to plain text inputs
  // instead of live GitHub-API-backed org/repo/branch pickers).
  const handleContinueWithGitHub = () => {
    setAuthError(null);
    const { githubAppClientId, githubAppAuthRedirectUrl } = window.API_CONFIG;
    if (!githubAppClientId) {
      setAuthError('GitHub App is not configured for this environment.');
      return;
    }
    setAuthenticating(true);
    const state = generateAndSaveGitHubState();
    const url = buildGitHubOAuthUrl(githubAppAuthRedirectUrl ?? '', githubAppClientId, state);
    const popup = window.open(url, 'github-oauth', POPUP_DIMENSIONS);
    if (!popup) {
      setAuthenticating(false);
      setAuthError('Please allow popups for this site and try again.');
      return;
    }

    const channel = new BroadcastChannel(GITHUB_BROADCAST_CHANNEL);
    channelRef.current = channel;
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        channel.close();
        channelRef.current = null;
        setAuthenticating(false);
      }
    }, POPUP_POLL_INTERVAL_MS);
    pollRef.current = pollClosed;

    channel.onmessage = (event) => {
      clearInterval(pollClosed);
      channel.close();
      const { authCode, state: returnedState } = event.data as { authCode: string | null; state: string | null };
      if (!returnedState || !validateAndClearGitHubState(returnedState) || !authCode) {
        setAuthenticating(false);
        setAuthError('GitHub authorization failed. Please try again.');
        return;
      }
      goToConfigure({ sourceType: 'github', authenticated: true });
    };
  };

  const handleQuickDeploy = async (sample: Sample) => {
    setDeployingSampleId(sample.id);
    try {
      const webApp = await createWebApp.mutateAsync({ sourceType: 'sample', sampleId: sample.id, displayName: sample.name, handler: toHandler(sample.name) });
      navigate(webAppOverviewUrl(scope.org, project.handler, webApp.handler));
    } finally {
      setDeployingSampleId(null);
    }
  };

  return (
    <PageContent sx={{ pt: 4 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(newWebAppUrl(scope.org, project.handler))} sx={{ mb: 2 }}>
        Back to Create
      </Button>

      <Typography variant="h1" sx={{ mb: 1 }}>
        Create a Web Application
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Connect your source code from an existing Git Repository or select one of our samples.
      </Typography>

      {authError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setAuthError(null)}>
          {authError}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 1.5 }}>
            Connect a Git Repository
          </Typography>
          <Stack gap={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', mb: 3 }}>
            <Button
              fullWidth
              onClick={handleContinueWithGitHub}
              disabled={authenticating}
              startIcon={authenticating ? <CircularProgress size={16} /> : <Github size={18} />}
              sx={{ justifyContent: 'flex-start', px: 2, py: 1.5, borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
              {authenticating ? 'Waiting for GitHub authorization…' : 'Continue With GitHub'}
            </Button>
            <Button fullWidth onClick={() => goToConfigure({ sourceType: 'public-git' })} startIcon={<Github size={18} />} sx={{ justifyContent: 'flex-start', px: 2, py: 1.5, borderRadius: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
              Use Public GitHub Repository
            </Button>
            <Button fullWidth onClick={() => setShowOtherProviders((v) => !v)} startIcon={<MoreHorizontal size={18} />} sx={{ justifyContent: 'flex-start', px: 2, py: 1.5, borderRadius: 0 }}>
              Try a Different Git Provider
            </Button>
            {showOtherProviders && (
              <Stack direction="row" gap={1.5} sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                {OTHER_PROVIDERS.map(({ id, label, Icon }) => (
                  <Button key={id} variant="outlined" size="small" startIcon={<Icon size={16} />} onClick={() => goToConfigure({ sourceType: 'public-git', provider: id })}>
                    {label}
                  </Button>
                ))}
              </Stack>
            )}
          </Stack>

          <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
            <Typography variant="caption" color="text.secondary">
              OR
            </Typography>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 1.5 }}>
            Connect a Docker Image
          </Typography>
          <Card variant="outlined" sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }} onClick={() => goToConfigure({ sourceType: 'docker' })}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Container size={22} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  Container Registry
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Deploy from an existing container image
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 2 }}>
            Get started with a sample
          </Typography>
          {loadingSamples ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Grid container spacing={2}>
              {(samples ?? []).map((sample) => (
                <Grid key={sample.id} size={{ xs: 12, sm: 6 }}>
                  <SampleCard sample={sample} onQuickDeploy={() => handleQuickDeploy(sample)} deploying={deployingSampleId === sample.id} />
                </Grid>
              ))}
            </Grid>
          )}
        </Grid>
      </Grid>
    </PageContent>
  );
}
