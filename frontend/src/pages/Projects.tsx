import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { Clock, Folder, Plus } from '@wso2/oxygen-ui-icons-react';
import SearchField from '../components/SearchField';
import EmptyListing from '../components/EmptyListing';
import { useProjects } from '../hooks/useProjects';
import { useScope } from '../nav';
import { newProjectUrl, projectHomeUrl } from '../paths';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { getStatusColor } from '../utils/statusColor';
import type { Project } from '../types/project';

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }): JSX.Element {
  return (
    <Card variant="outlined" sx={{ cursor: 'pointer', height: '100%' }} onClick={onClick}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2.5 }}>
        <Avatar variant="rounded" sx={{ bgcolor: 'action.hover', color: 'text.secondary', width: 48, height: 48, borderRadius: 1 }}>
          {project.name[0].toUpperCase()}
        </Avatar>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
          {project.name}
        </Typography>
      </CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, pb: 2 }}>
        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
          <Clock size={14} />
          {formatRelativeTime(project.updatedAt)}
        </Typography>
        {project.status === 'deploying' ? <Chip label="deploying" color={getStatusColor('deploying')} size="small" /> : <Chip label={`${project.activeWebAppCount} active`} color={project.activeWebAppCount > 0 ? 'success' : 'default'} size="small" variant="outlined" />}
      </Stack>
    </Card>
  );
}

export default function Projects(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const [query, setQuery] = useState('');
  const { data: projects, isLoading, isError } = useProjects(scope.org);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (isError) {
    return (
      <PageContent>
        <EmptyListing icon={<Folder size={48} />} title="Couldn't load projects" description="Something went wrong loading your projects. Please try again." />
      </PageContent>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = (projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>All Projects</PageTitle.Header>
      </PageTitle>

      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 3 }}>
        <SearchField value={query} onChange={setQuery} placeholder="Search projects" fullWidth />
        <Button variant="contained" startIcon={<Plus size={20} />} onClick={() => navigate(newProjectUrl(scope.org))} sx={{ whiteSpace: 'nowrap' }}>
          Create
        </Button>
      </Stack>

      {filtered.length === 0 ? (
        <EmptyListing
          icon={<Folder size={48} />}
          title="No projects found"
          description={q ? 'Try adjusting your search' : 'Create your first project to get started'}
          showAction={!q}
          actionLabel="Create Project"
          onAction={() => navigate(newProjectUrl(scope.org))}
        />
      ) : (
        <Grid container spacing={2}>
          {filtered.map((p) => (
            <Grid key={p.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <ProjectCard project={p} onClick={() => navigate(projectHomeUrl(scope.org, p.handler))} />
            </Grid>
          ))}
        </Grid>
      )}
    </PageContent>
  );
}
