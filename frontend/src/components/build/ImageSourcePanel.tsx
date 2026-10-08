import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Rocket } from '@wso2/oxygen-ui-icons-react';
import { useDeployImageTag, useImageSource } from '../../hooks/useImageSource';
import type { TrackRef } from '../../types/track';

const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;

interface ImageSourcePanelProps {
  track: TrackRef;
  /** Name of the environment a new tag is deployed to (the pipeline's first). */
  targetEnvName: string;
}

/** Image-sourced web apps (no builds): the running image and a "deploy new tag" action. */
export default function ImageSourcePanel({ track, targetEnvName }: ImageSourcePanelProps): JSX.Element {
  const source = useImageSource(track);
  const deploy = useDeployImageTag(track);
  const [tag, setTag] = useState('');

  if (source.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (source.isError || !source.data) {
    return <Alert severity="error">Failed to load the web app&apos;s image.</Alert>;
  }

  const { image, tag: current, port } = source.data;
  const nextTag = tag.trim();
  const tagError = nextTag && !TAG_RE.test(nextTag) ? 'Invalid tag' : null;

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
        Container Image
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This web app runs a public container image instead of building from source.
      </Typography>
      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
          {image}:{current}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          · port {port}
        </Typography>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'flex-start' }}>
        <TextField label="New tag" size="small" placeholder={current} value={tag} onChange={(e) => setTag(e.target.value)} error={!!tagError} helperText={tagError ?? `Deployed to ${targetEnvName}; promote it from the Deploy page.`} />
        <Button
          variant="contained"
          startIcon={deploy.isPending ? <CircularProgress size={14} color="inherit" /> : <Rocket size={14} />}
          disabled={!nextTag || !!tagError || deploy.isPending}
          onClick={() => deploy.mutate(nextTag, { onSuccess: () => setTag('') })}>
          {deploy.isPending ? 'Deploying…' : 'Deploy tag'}
        </Button>
      </Stack>
      {deploy.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {deploy.error instanceof Error ? deploy.error.message : 'Failed to deploy the tag.'}
        </Alert>
      )}
      {deploy.isSuccess && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Deploying {deploy.data.image ?? 'the new tag'} to {targetEnvName}.
        </Alert>
      )}
    </Box>
  );
}
