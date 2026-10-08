import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { Box, Button, Card, CardContent, Chip, CircularProgress, Grid, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Container, GitBranch } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../components/EmptyListing';
import SampleCard from '../components/SampleCard';
import { useProjectByHandler } from '../hooks/useProjects';
import { useCreateSampleWebApp } from '../hooks/useWebApps';
import { useSamples } from '../hooks/useSamples';
import { hasProject, useScope } from '../nav';
import { importWebAppUrl, projectHomeUrl, webAppOverviewUrl } from '../paths';
import ErrorAlert from '../components/ErrorAlert';
import type { Sample } from '../types/sample';

/** Wireframe page 4 — the initial "how would you like to create your web app?" wizard entry. */
export default function CreateWebAppOptions(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const [deployingSampleId, setDeployingSampleId] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<unknown>(null);

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const projectId = project?.id ?? '';
  const { data: samples, isLoading: loadingSamples } = useSamples();
  const createSample = useCreateSampleWebApp(projectId);

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

  const handleQuickDeploy = async (sample: Sample) => {
    setDeployingSampleId(sample.id);
    setSampleError(null);
    try {
      const webApp = await createSample.mutateAsync(sample);
      navigate(webAppOverviewUrl(scope.org, project.handler, webApp.handler));
    } catch (err) {
      setSampleError(err);
    } finally {
      setDeployingSampleId(null);
    }
  };

  return (
    <PageContent sx={{ pt: 4 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(projectHomeUrl(scope.org, project.handler))} sx={{ mb: 2 }}>
        Back to Project Home
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        How would you like to create your web app?
      </Typography>
      {sampleError !== null && (
        <Box sx={{ mb: 3 }}>
          <ErrorAlert error={sampleError} fallback="Failed to create the sample web app." onClose={() => setSampleError(null)} />
        </Box>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack gap={2}>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              Import your own
            </Typography>
            <Card variant="outlined" sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }} onClick={() => navigate(importWebAppUrl(scope.org, project.handler))}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <GitBranch size={22} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    Import a repository from
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Connect your source code from GitHub
                  </Typography>
                </Box>
              </CardContent>
            </Card>

            <Stack direction="row" alignItems="center" gap={1.5}>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
              <Typography variant="caption" color="text.secondary">
                OR
              </Typography>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
              Connect a Docker Image
            </Typography>
            {/* Docker image import is P1: shown, but not selectable yet. */}
            <Card variant="outlined" sx={{ opacity: 0.6 }} aria-disabled>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Container size={22} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    Container Registry <Chip label="Coming soon" size="small" color="info" sx={{ ml: 1 }} />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Deploy from an existing container image
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 2 }}>
            Samples
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
