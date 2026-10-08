import { useState, type JSX } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import ScaleMethodCard from './ScaleMethodCard';
import HpaConfig from './HpaConfig';
import RangeInput from './RangeInput';
import { MAX_REPLICAS, SCALING_METHODS } from './scalingConstants';
import { scalingCaps, scalingPlanError } from './scalingForm';
import PlanUpgradeHint from '../PlanUpgradeHint';
import { ScalingMethod, type ScalingConfig } from '../../types/scaling';
import type { PlanLimits } from '../../types/plan';

interface ScalingEditorProps {
  saved: ScalingConfig;
  isSaving: boolean;
  onSave: (config: ScalingConfig) => void;
  /** The org's plan limits; undefined while unknown (nothing is disabled — the BFF still enforces them). */
  limits?: PlanLimits;
}

/** Draft-and-save editor for one environment's scaling config. Remount (via `key`) to reset the draft. */
export default function ScalingEditor({ saved, isSaving, onSave, limits }: ScalingEditorProps): JSX.Element {
  const [draft, setDraft] = useState<ScalingConfig>(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const hpaAllowed = limits?.autoscaling !== false;
  const replicaCap = Math.min(MAX_REPLICAS, limits?.maxReplicas ?? MAX_REPLICAS);
  const gated = !hpaAllowed || replicaCap < MAX_REPLICAS;
  // Saved paid settings (e.g. after a downgrade) can be kept or reduced, not raised.
  const caps = scalingCaps(saved, limits);
  const planError = dirty ? scalingPlanError(draft, saved, limits) : undefined;

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
          <ScaleMethodCard
            key={m.value}
            title={m.title}
            description={m.description}
            badge={m.paidOnly && !hpaAllowed ? 'Paid plans' : undefined}
            disabled={m.paidOnly && !caps.hpaAllowed}
            selected={draft.method === m.value}
            onSelect={() => setDraft({ ...draft, method: m.value })}
          />
        ))}
      </Stack>

      {draft.method === ScalingMethod.HPA && <HpaConfig value={draft.hpa} onChange={(hpa) => setDraft({ ...draft, hpa })} minReplicasCap={caps.hpaMinReplicas} maxReplicasCap={caps.hpaMaxReplicas} />}
      {draft.method === ScalingMethod.None && <RangeInput label="Replicas" value={draft.fixedReplicas} onChange={(fixedReplicas) => setDraft({ ...draft, fixedReplicas })} min={1} max={caps.fixedReplicas} />}
      {gated && (
        <Box sx={{ mt: 2 }}>
          <PlanUpgradeHint message={`Your plan runs ${replicaCap === 1 ? 'one replica' : `up to ${replicaCap} replicas`} per environment${hpaAllowed ? '' : ' without autoscaling'}. Upgrade to a paid plan for HPA and up to ${MAX_REPLICAS} replicas.`} />
        </Box>
      )}

      {planError !== undefined && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {planError}
        </Alert>
      )}

      <Stack direction="row" gap={1.5} sx={{ mt: 3 }}>
        <Button variant="contained" disabled={!dirty || isSaving || planError !== undefined} onClick={() => onSave(draft)} startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : undefined}>
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
