import { useState, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Alert, Box, Button, Card, CircularProgress, Grid, MenuItem, PageContent, Select, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Code } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../components/EmptyListing';
import WebAppCreationLoader from '../components/WebAppCreationLoader';
import { useProjectByHandler } from '../hooks/useProjects';
import { useCreateWebApp } from '../hooks/useWebApps';
import { useBranches, useGitHubInstallations, useGitHubRepos } from '../hooks/useGit';
import { hasProject, useScope } from '../nav';
import { gitProviderBase, importWebAppUrl, newWebAppUrl, webAppOverviewUrl } from '../paths';
import { isSpaPreset } from '../constants/buildPresets';
import { toHandler } from '../utils/toHandler';
import { normalizeGitHubRepoUrl, parseGitHubUrl } from '../utils/parseGitHubUrl';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { HttpError } from '../types/http';
import type { BuildPreset, CreateWebAppDockerInput, CreateWebAppGitInput, WebAppSourceType } from '../types/webApp';
import nodejsLogo from '../assets/build-presets/nodejs.svg';
import reactLogo from '../assets/build-presets/react.svg';
import angularLogo from '../assets/build-presets/angular.svg';
import dotnetLogo from '../assets/build-presets/dotnet.svg';
import vuejsLogo from '../assets/build-presets/vuejs.svg';
import pythonLogo from '../assets/build-presets/python.svg';
import goLogo from '../assets/build-presets/go.svg';
import rubyLogo from '../assets/build-presets/ruby.svg';
import phpLogo from '../assets/build-presets/php.svg';
import springbootLogo from '../assets/build-presets/springboot.svg';
import staticLogo from '../assets/build-presets/static.svg';
import dockerLogo from '../assets/build-presets/docker.svg';

// Logos extracted from choreo-console's buildpack picker (ComponentTemplates/) — see
// ADAPTATION_NOTES.md. None are theme-aware, but each is a self-contained brand mark; the light
// badge each preset chip renders them on (see BUILD_PRESETS below) keeps them legible in dark mode.
const BUILD_PRESET_LOGOS: Record<BuildPreset, string> = {
  nodejs: nodejsLogo,
  react: reactLogo,
  angular: angularLogo,
  dotnet: dotnetLogo,
  vuejs: vuejsLogo,
  python: pythonLogo,
  go: goLogo,
  ruby: rubyLogo,
  php: phpLogo,
  springboot: springbootLogo,
  static: staticLogo,
  docker: dockerLogo,
};

interface ImportLocationState {
  sourceType?: WebAppSourceType;
  provider?: 'bitbucket' | 'gitlab' | 'azure';
  authenticated?: boolean;
}

const BUILD_PRESETS: { value: BuildPreset; label: string }[] = [
  { value: 'nodejs', label: 'NodeJS' },
  { value: 'react', label: 'React' },
  { value: 'angular', label: 'Angular' },
  { value: 'dotnet', label: '.NET' },
  { value: 'vuejs', label: 'Vue.js' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'springboot', label: 'Spring Boot' },
  { value: 'static', label: 'Static Site' },
  { value: 'docker', label: 'Docker' },
];

const REGISTRY_TYPES: { value: CreateWebAppDockerInput['registryType']; label: string }[] = [
  { value: 'dockerhub', label: 'Docker Hub' },
  { value: 'acr', label: 'Azure Container Registry' },
  { value: 'ecr', label: 'Amazon ECR' },
  { value: 'gcr', label: 'Google Container Registry' },
  { value: 'ghcr', label: 'GitHub Container Registry' },
  { value: 'other', label: 'Other' },
];

const REGISTRY_LABEL_FOR_PROVIDER: Record<'bitbucket' | 'gitlab' | 'azure', string> = {
  bitbucket: 'Bitbucket',
  gitlab: 'GitLab',
  azure: 'Azure DevOps',
};

const HANDLER_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const BRANCH_LOOKUP_DEBOUNCE_MS = 500;

function branchErrorText(err: unknown): string {
  if (err instanceof HttpError && err.code === 'GIT_RATE_LIMITED') return `${err.message} — enter a branch`;
  if (err instanceof HttpError && err.status === 404) return 'Repository not found (is it public?) — enter a branch';
  return 'Could not list branches — enter one';
}

/** Wireframe page 6 — the web app details/build-config form; page 7 (the creation loader) renders in its place while the create mutation is pending. */
export default function CreateWebAppForm(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const location = useLocation();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const state = (location.state ?? {}) as ImportLocationState;
  const sourceType = state.sourceType ?? 'public-git';
  const isDocker = sourceType === 'docker';
  const isAuthenticatedGitHub = sourceType === 'github' && !!state.authenticated;

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const projectId = project?.id ?? '';
  const createWebApp = useCreateWebApp(projectId);

  // Common fields
  const [displayName, setDisplayName] = useState('');
  const [handler, setHandler] = useState('');
  const [handlerEdited, setHandlerEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [port, setPort] = useState('8080');

  // Git fields
  const [gitOrganization, setGitOrganization] = useState('');
  const [repository, setRepository] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [componentDirectory, setComponentDirectory] = useState('/');
  const [buildPreset, setBuildPreset] = useState<BuildPreset>('react');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [buildPath, setBuildPath] = useState('/build');
  const [nodeVersion, setNodeVersion] = useState('18');

  // Docker fields
  const [registryType, setRegistryType] = useState<CreateWebAppDockerInput['registryType']>('dockerhub');
  const [image, setImage] = useState('');
  const [tag, setTag] = useState('latest');
  const [credentialRef, setCredentialRef] = useState('');

  const [submitError, setSubmitError] = useState<string | null>(null);

  // GitHub App: installations bound to the org → their repositories → the chosen repo's branches.
  const installations = useGitHubInstallations(isAuthenticatedGitHub);
  const [installationId, setInstallationId] = useState<number | undefined>();
  const effectiveInstallationId = installationId ?? installations.data?.[0]?.installationId;
  const repos = useGitHubRepos(isAuthenticatedGitHub ? effectiveInstallationId : undefined);
  // Public repos: look branches up only for a complete https://github.com/<owner>/<repo> URL, once typing
  // pauses — not per keystroke (the unauthenticated GitHub API allows 60 requests an hour).
  const publicRepoUrl = normalizeGitHubRepoUrl(useDebouncedValue(repoUrl, BRANCH_LOOKUP_DEBOUNCE_MS));
  const branchQuery = isAuthenticatedGitHub ? { installationId: effectiveInstallationId, owner: gitOrganization, repo: repository } : { repoUrl: publicRepoUrl ?? '' };
  const branches = useBranches(branchQuery, isAuthenticatedGitHub ? !!effectiveInstallationId && !!gitOrganization && !!repository : !!publicRepoUrl);

  const effectiveHandler = handlerEdited ? handler : toHandler(displayName);
  const handlerError = !effectiveHandler ? null : !HANDLER_RE.test(effectiveHandler) ? 'Use lowercase letters, numbers and hyphens only' : null;
  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536;

  const handleRepoUrlBlur = () => {
    const parsed = parseGitHubUrl(repoUrl);
    if (parsed) {
      setGitOrganization(parsed.organization);
      setRepository(parsed.repository);
    } else {
      setRepository(repoUrl.trim());
    }
  };

  const gitReady = isAuthenticatedGitHub ? !!gitOrganization.trim() && !!repository.trim() : !!repository.trim();
  const dockerReady = !!image.trim();
  const canSubmit = !!displayName.trim() && !!effectiveHandler && !handlerError && portValid && (isDocker ? dockerReady : gitReady) && !createWebApp.isPending;

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
        <EmptyListing icon={<Code size={48} />} title="Project not found" description="This project doesn't exist or you don't have access to it." />
      </PageContent>
    );
  }

  if (createWebApp.isPending || createWebApp.isSuccess || createWebApp.isError) {
    return (
      <PageContent sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <WebAppCreationLoader
          isPending={createWebApp.isPending}
          isSuccess={createWebApp.isSuccess}
          error={createWebApp.isError ? createWebApp.error : null}
          onBack={() => createWebApp.reset()}
        />
      </PageContent>
    );
  }

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const input: CreateWebAppGitInput | CreateWebAppDockerInput = isDocker
        ? {
            sourceType: 'docker',
            displayName: displayName.trim(),
            handler: effectiveHandler,
            description: description.trim() || undefined,
            registryType,
            image: image.trim(),
            tag: tag.trim() || 'latest',
            credentialRef: credentialRef.trim() || undefined,
            port: portNumber,
          }
        : {
            sourceType: sourceType === 'github' ? 'github' : 'public-git',
            gitOrganization: gitOrganization.trim() || undefined,
            installationId: isAuthenticatedGitHub ? effectiveInstallationId : undefined,
            repository: repository.trim(),
            branch: branch.trim() || 'main',
            componentDirectory: componentDirectory.trim() || '/',
            displayName: displayName.trim(),
            handler: effectiveHandler,
            description: description.trim() || undefined,
            buildPreset,
            buildCommand: buildCommand.trim(),
            buildPath: buildPath.trim(),
            nodeVersion: nodeVersion.trim() || undefined,
            port: portNumber,
          };
      const webApp = await createWebApp.mutateAsync(input);
      navigate(webAppOverviewUrl(scope.org, project.handler, webApp.handler));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create web app. Please try again.');
    }
  };

  const repoUrlLabel = state.provider ? `${REGISTRY_LABEL_FOR_PROVIDER[state.provider]} Repository URL` : 'Repository URL';
  const repoUrlPlaceholder = state.provider ? `${gitProviderBase[state.provider]}/org/repo` : 'https://github.com/org/repo';

  return (
    <PageContent sx={{ pt: 4, maxWidth: 900 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(importWebAppUrl(scope.org, project.handler))} sx={{ mb: 2 }}>
        Back
      </Button>

      <Typography variant="h1" sx={{ mb: 1 }}>
        {isDocker ? 'Configure Container Image' : 'Connect your repository to start building.'}
      </Typography>

      {submitError && (
        <Alert severity="error" role="alert" sx={{ my: 3 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {!isDocker && (
        <>
          <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>
            Source
          </Typography>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {isAuthenticatedGitHub ? (
              <>
                {(installations.data?.length ?? 0) > 1 && (
                  <Grid size={{ xs: 12 }}>
                    <Select fullWidth value={effectiveInstallationId ?? ''} onChange={(e) => setInstallationId(Number(e.target.value))} inputProps={{ 'aria-label': 'GitHub installation' }}>
                      {(installations.data ?? []).map((i) => (
                        <MenuItem key={i.installationId} value={i.installationId}>
                          {i.githubAccount ?? `Installation ${i.installationId}`}
                        </MenuItem>
                      ))}
                    </Select>
                  </Grid>
                )}
                <Grid size={{ xs: 12 }}>
                  {installations.isLoading || repos.isLoading ? (
                    <CircularProgress size={20} />
                  ) : installations.isError || repos.isError ? (
                    <Alert severity="error">Failed to load your GitHub repositories.</Alert>
                  ) : (
                    <Select
                      fullWidth
                      displayEmpty
                      value={gitOrganization && repository ? `${gitOrganization}/${repository}` : ''}
                      onChange={(e) => {
                        const repo = (repos.data ?? []).find((r) => r.fullName === e.target.value);
                        if (!repo) return;
                        setGitOrganization(repo.owner);
                        setRepository(repo.name);
                        setBranch(repo.defaultBranch || 'main');
                      }}
                      inputProps={{ 'aria-label': 'Repository' }}>
                      <MenuItem value="" disabled>
                        Select repository
                      </MenuItem>
                      {(repos.data ?? []).map((r) => (
                        <MenuItem key={r.fullName} value={r.fullName}>
                          {r.fullName}
                          {r.private ? ' (private)' : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                </Grid>
              </>
            ) : (
              <Grid size={{ xs: 12 }}>
                <TextField label={repoUrlLabel} required placeholder={repoUrlPlaceholder} value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} onBlur={handleRepoUrlBlur} fullWidth helperText="Public repository URL" />
              </Grid>
            )}
            <Grid size={{ xs: 12, md: 6 }}>
              {branches.data && branches.data.length > 0 ? (
                <Select fullWidth value={branches.data.includes(branch) ? branch : ''} onChange={(e) => setBranch(String(e.target.value))} inputProps={{ 'aria-label': 'Branch' }}>
                  {branches.data.map((b) => (
                    <MenuItem key={b} value={b}>
                      {b}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <TextField label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} fullWidth helperText={branches.isError ? branchErrorText(branches.error) : 'Branch'} />
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Component Directory" value={componentDirectory} onChange={(e) => setComponentDirectory(e.target.value)} fullWidth helperText="Path (/ for root)" />
            </Grid>
          </Grid>
        </>
      )}

      {isDocker && (
        <>
          <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>
            Container Registry
          </Typography>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Select fullWidth value={registryType} onChange={(e) => setRegistryType(e.target.value as CreateWebAppDockerInput['registryType'])} size="medium">
                {REGISTRY_TYPES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField label="Image" required placeholder="e.g. myorg/my-web-app" value={image} onChange={(e) => setImage(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField label="Registry credential (optional)" placeholder="Secret reference" value={credentialRef} onChange={(e) => setCredentialRef(e.target.value)} fullWidth helperText="No credential picker yet — paste a secret reference." />
            </Grid>
          </Grid>
        </>
      )}

      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Component Details
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField label="Display Name" required placeholder="Display Name of the Web App" value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            label="Name"
            value={effectiveHandler}
            onChange={(e) => {
              setHandlerEdited(true);
              setHandler(e.target.value);
            }}
            fullWidth
            error={!!handlerError}
            helperText={handlerError ?? 'Auto-generated identifier'}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <TextField label="Description (Optional)" placeholder="Brief description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
        </Grid>
      </Grid>

      {!isDocker && (
        <>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Build Details
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Build Preset
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {BUILD_PRESETS.map((preset) => (
              <Grid key={preset.value} size="auto">
                <Card
                  variant="outlined"
                  onClick={() => setBuildPreset(preset.value)}
                  sx={{
                    cursor: 'pointer',
                    pl: 1,
                    pr: 2,
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderColor: buildPreset === preset.value ? 'primary.main' : 'divider',
                    bgcolor: buildPreset === preset.value ? 'action.selected' : 'transparent',
                  }}>
                  <Box
                    component="img"
                    src={BUILD_PRESET_LOGOS[preset.value]}
                    alt=""
                    sx={{ width: 24, height: 24, p: 0.25, borderRadius: 1, bgcolor: '#ffffff', flexShrink: 0 }}
                  />
                  <Typography variant="body2">{preset.label}</Typography>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Build Command" value={buildCommand} onChange={(e) => setBuildCommand(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Build Path" value={buildPath} onChange={(e) => setBuildPath(e.target.value)} fullWidth />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Node Version" value={nodeVersion} onChange={(e) => setNodeVersion(e.target.value)} fullWidth />
            </Grid>
          </Grid>
        </>
      )}

      <Grid container spacing={3} sx={{ mb: 5 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            label="Port"
            type="number"
            value={isSpaPreset(buildPreset) && !isDocker ? '8080' : port}
            onChange={(e) => setPort(e.target.value)}
            disabled={isSpaPreset(buildPreset) && !isDocker}
            fullWidth
            error={!portValid && port !== ''}
            helperText={isSpaPreset(buildPreset) && !isDocker ? 'Single-page and static apps are served by nginx on port 8080.' : !portValid && port !== '' ? 'Enter a valid port (1-65535)' : 'Port your app listens on'}
          />
        </Grid>
      </Grid>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(newWebAppUrl(scope.org, project.handler))} disabled={createWebApp.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
          Import Web App
        </Button>
      </Stack>
    </PageContent>
  );
}
