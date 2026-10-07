import { useState, type JSX } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import ScaleMethodCard from './ScaleMethodCard';
import HpaConfig from './HpaConfig';
import RangeInput from './RangeInput';
import { MAX_REPLICAS, SCALING_METHODS } from './scalingConstants';
import { ScalingMethod, type ScalingConfig } from '../../types/scaling';

interface ScalingEditorProps {
  saved: ScalingConfig;
  isSaving: boolean;
  onSave: (config: ScalingConfig) => void;
}

/** Draft-and-save editor for one environment's scaling config. Remount (via `key`) to reset the draft. */
export default function ScalingEditor({ saved, isSaving, onSave }: ScalingEditorProps): JSX.Element {
  const [draft, setDraft] = useState<ScalingConfig>(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        Scaling method
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose how replicas are added and removed for this environment.
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mb: 3 }}>
        {SCALING_METHODS.map((m) => (
          <ScaleMethodCard key={m.value} title={m.title} description={m.description} badge={m.badge} selected={draft.method === m.value} onSelect={() => setDraft({ ...draft, method: m.value })} />
        ))}
      </Stack>

      {draft.method === ScalingMethod.HPA && <HpaConfig value={draft.hpa} onChange={(hpa) => setDraft({ ...draft, hpa })} />}
      {draft.method === ScalingMethod.None && <RangeInput label="Replicas" value={draft.fixedReplicas} onChange={(fixedReplicas) => setDraft({ ...draft, fixedReplicas })} min={1} max={MAX_REPLICAS} />}

      <Stack direction="row" gap={1.5} sx={{ mt: 3 }}>
        <Button variant="contained" disabled={!dirty || isSaving} onClick={() => onSave(draft)} startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        {dirty && !isSaving && (
          <Button variant="text" onClick={() => setDraft(saved)}>
            Discard changes
          </Button>
        )}
      </Stack>
    </Box>
  );
}
