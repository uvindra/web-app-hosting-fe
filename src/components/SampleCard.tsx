import type { JSX } from 'react';
import { Button, Card, CardContent, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { ExternalLink } from '@wso2/oxygen-ui-icons-react';
import type { Sample } from '../types/sample';

interface SampleCardProps {
  sample: Sample;
  onQuickDeploy: () => void;
  deploying: boolean;
}

/** A sample-app card with "Quick Deploy" (creates a web app straight from the sample) and "Source" (opens the repo) actions. */
export default function SampleCard({ sample, onQuickDeploy, deploying }: SampleCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1 }}>
        <Chip label={sample.framework} size="small" sx={{ mb: 1.5 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {sample.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {sample.description}
        </Typography>
      </CardContent>
      <Stack direction="row" gap={1} sx={{ px: 2, pb: 2 }}>
        <Button size="small" variant="contained" onClick={onQuickDeploy} disabled={deploying} startIcon={deploying ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {deploying ? 'Deploying…' : 'Quick Deploy'}
        </Button>
        <Button size="small" variant="text" endIcon={<ExternalLink size={14} />} component="a" href={sample.repoUrl} target="_blank" rel="noopener noreferrer">
          Source
        </Button>
      </Stack>
    </Card>
  );
}
