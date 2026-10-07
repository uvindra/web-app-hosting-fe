import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { Box, Button, Chip, CircularProgress, Grid, Link, ListingTable, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { AppWindow, Plus } from '@wso2/oxygen-ui-icons-react';
import SearchField from '../components/SearchField';
import EmptyListing from '../components/EmptyListing';
import SampleCard from '../components/SampleCard';
import { useProjectByHandler } from '../hooks/useProjects';
import { useWebApps, useCreateWebApp } from '../hooks/useWebApps';
import { useSamples } from '../hooks/useSamples';
import { hasProject, useScope } from '../nav';
import { newWebAppUrl, webAppOverviewUrl } from '../paths';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { getStatusColor } from '../utils/statusColor';
import { toHandler } from '../utils/toHandler';
import type { WebApp, WebAppStatus } from '../types/webApp';
import type { Sample } from '../types/sample';

const STATUS_LABEL: Record<WebAppStatus, string> = {
  active: 'Active',
  deploying: 'Deploying',
  'not-deployed': 'Not Deployed',
  failed: 'Failed',
};

function StatusChip({ status }: { status: WebAppStatus }): JSX.Element {
  return <Chip label={STATUS_LABEL[status]} color={getStatusColor(status)} size="small" />;
}

export default function WebApps(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const projectHandler = hasProject(scope) ? scope.project : '';
  const [query, setQuery] = useState('');
  const [deployingSampleId, setDeployingSampleId] = useState<string | null>(null);

  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.org, projectHandler);
  const projectId = project?.id ?? '';
  const { data: webApps, isLoading: loadingWebApps, isError } = useWebApps(projectId);
  const { data: samples } = useSamples();
  const createWebApp = useCreateWebApp(projectId);

  if (loadingProject || (loadingWebApps && !!projectId)) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!project) {
    return (
      <PageContent>
        <EmptyListing icon={<AppWindow size={48} />} title="Project not found" description="This project doesn't exist or you don't have access to it." />
      </PageContent>
    );
  }

  if (isError) {
    return (
      <PageContent>
        <EmptyListing icon={<AppWindow size={48} />} title="Couldn't load web apps" description="Something went wrong loading this project's web apps. Please try again." />
      </PageContent>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = (webApps ?? []).filter((a: WebApp) => !q || a.displayName.toLowerCase().includes(q));

  const handleQuickDeploy = async (sample: Sample) => {
    setDeployingSampleId(sample.id);
    try {
      const webApp = await createWebApp.mutateAsync({
        sourceType: 'sample',
        sampleId: sample.id,
        displayName: sample.name,
        handler: toHandler(sample.name),
      });
      navigate(webAppOverviewUrl(scope.org, project.handler, webApp.handler));
    } finally {
      setDeployingSampleId(null);
    }
  };

  return (
    <PageContent>
      <Stack sx={{ mb: 4 }}>
        <Typography variant="h1">{project.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {webApps?.length ?? 0} web application{(webApps?.length ?? 0) === 1 ? '' : 's'} deployed
        </Typography>
      </Stack>

      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 3 }}>
        <SearchField value={query} onChange={setQuery} placeholder="Search" fullWidth />
        <Button variant="contained" startIcon={<Plus size={20} />} onClick={() => navigate(newWebAppUrl(scope.org, project.handler))} sx={{ whiteSpace: 'nowrap' }}>
          Create
        </Button>
      </Stack>

      {filtered.length === 0 ? (
        <EmptyListing
          icon={<AppWindow size={48} />}
          title="No web apps found"
          description={q ? 'Try adjusting your search' : 'Create your first web app to get started'}
          showAction={!q}
          actionLabel="Create Web App"
          onAction={() => navigate(newWebAppUrl(scope.org, project.handler))}
        />
      ) : (
        <ListingTable.Container disablePaper>
          <ListingTable variant="card" density="compact">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>URL</ListingTable.Cell>
                <ListingTable.Cell>Framework</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell>Last Updated</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {filtered.map((a: WebApp) => (
                <ListingTable.Row key={a.id} variant="card" hover clickable onClick={() => navigate(webAppOverviewUrl(scope.org, project.handler, a.handler))}>
                  <ListingTable.Cell>
                    <Stack gap={0.25}>
                      <Typography variant="body2" fontWeight={600}>
                        {a.displayName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.handler}
                      </Typography>
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    {a.url ? (
                      <Link href={`https://${a.url}`} target="_blank" rel="noreferrer" underline="hover" onClick={(e) => e.stopPropagation()}>
                        {a.url}
                      </Link>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Typography variant="body2">{a.framework}</Typography>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <StatusChip status={a.status} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Typography variant="body2" color="text.secondary">
                      {formatRelativeTime(a.updatedAt)}
                    </Typography>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {samples && samples.length > 0 && (
        <Box sx={{ mt: 5 }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
            Create from a sample
          </Typography>
          <Grid container spacing={2}>
            {samples.map((sample) => (
              <Grid key={sample.id} size={{ xs: 12, sm: 6, md: 3 }}>
                <SampleCard sample={sample} onQuickDeploy={() => handleQuickDeploy(sample)} deploying={deployingSampleId === sample.id} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </PageContent>
  );
}
