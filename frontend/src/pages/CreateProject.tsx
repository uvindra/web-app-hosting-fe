import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Button, CircularProgress, Grid, PageContent, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useCreateProject } from '../hooks/useProjects';
import { useScope } from '../nav';
import { orgHomeUrl, projectHomeUrl } from '../paths';

function toHandler(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const HANDLER_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default function CreateProject(): JSX.Element {
  const navigate = useNavigate();
  const scope = useScope();
  const createProject = useCreateProject();

  const [name, setName] = useState('');
  const [handler, setHandler] = useState('');
  const [handlerEdited, setHandlerEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const effectiveHandler = handlerEdited ? handler : toHandler(name);
  const nameError = !name.trim() ? null : name.trim().length > 100 ? 'Name is too long' : null;
  const handlerError = !effectiveHandler ? null : !HANDLER_RE.test(effectiveHandler) ? 'Use lowercase letters, numbers and hyphens only' : null;
  const canSubmit = !!name.trim() && !nameError && !!effectiveHandler && !handlerError && !createProject.isPending;

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const project = await createProject.mutateAsync({
        orgHandle: scope.org,
        name: name.trim(),
        handler: effectiveHandler,
        description: description.trim() || undefined,
      });
      navigate(projectHomeUrl(scope.org, project.handler));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
    }
  };

  return (
    <PageContent sx={{ pt: 5, maxWidth: 900 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(orgHomeUrl(scope.org))} sx={{ mb: 2 }}>
        Back to Home
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create a Project
      </Typography>

      {submitError && (
        <Alert severity="error" role="alert" sx={{ mb: 3 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 5 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            label="Display Name"
            required
            placeholder="Enter Project Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            error={!!nameError}
            helperText={nameError ?? 'Name of the project'}
          />
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
          <TextField label="Description (Optional)" placeholder="Enter description here" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
        </Grid>
      </Grid>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(orgHomeUrl(scope.org))} disabled={createProject.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit} startIcon={createProject.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {createProject.isPending ? 'Creating…' : 'Create Project'}
        </Button>
      </Stack>
    </PageContent>
  );
}
