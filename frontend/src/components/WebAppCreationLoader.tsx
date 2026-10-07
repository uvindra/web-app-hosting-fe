import { useEffect, useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { CREATION_STEPS, CREATION_STEP_INTERVAL, type CreationStep } from '../constants/webAppCreation';

interface WebAppCreationLoaderProps {
  isPending: boolean;
  isSuccess: boolean;
  error?: string | null;
  onBack?: () => void;
}

/** "Setting up your Web Application…" progress screen (wireframe page 7). */
export default function WebAppCreationLoader({ isPending, isSuccess, error, onBack }: WebAppCreationLoaderProps): JSX.Element {
  const [creationStep, setCreationStep] = useState<CreationStep>(CREATION_STEPS[0]);

  useEffect(() => {
    if (!isPending) return;
    setCreationStep(CREATION_STEPS[0]);
    const timers = CREATION_STEPS.slice(1).map((step, i) => setTimeout(() => setCreationStep(step), (i + 1) * CREATION_STEP_INTERVAL));
    return () => timers.forEach(clearTimeout);
  }, [isPending]);

  useEffect(() => {
    if (isSuccess) setCreationStep({ progress: 100, text: 'Web application created!' });
  }, [isSuccess]);

  if (error) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 3, py: 8 }}>
        <Alert severity="error" sx={{ maxWidth: 480, width: '100%' }}>
          {error}
        </Alert>
        {onBack && (
          <Button variant="outlined" onClick={onBack}>
            Go Back
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 3, py: 8 }}>
      <Typography variant="h2">Setting up your Web Application…</Typography>

      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress variant="determinate" value={creationStep.progress} size={80} thickness={4} style={{ color: 'var(--oxygen-palette-primary-main)' }} />
        <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" component="div" color="text.secondary">
            {creationStep.progress}%
          </Typography>
        </Box>
      </Box>

      <Typography color="text.secondary" variant="body2">
        {creationStep.text}
      </Typography>
    </Box>
  );
}
