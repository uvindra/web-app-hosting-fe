import type { JSX } from 'react';
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import ProbeDisplay from './ProbeDisplay';
import { PROBE_KIND, type Probe, type ProbeKind } from '../../types/healthChecks';

interface ProbeCardProps {
  kind: ProbeKind;
  probe: Probe | undefined;
  busy: boolean;
  onConfigure: () => void;
  onDelete: () => void;
  /** Shown while the probe is unset (e.g. the platform's default readiness check). */
  unsetNote?: string;
}

const HELP: Record<ProbeKind, string> = {
  Liveness: 'Detects a web server that is stuck or crashed and restarts the container.',
  Readiness: 'Keeps traffic away from a replica until it is ready to serve requests.',
};

/** One probe of the environment: its configuration when set, or a prompt to configure it. */
export default function ProbeCard({ kind, probe, busy, onConfigure, onDelete, unsetNote }: ProbeCardProps): JSX.Element {
  const title = `${kind} Probe`;
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: probe ? 2 : 0 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {HELP[kind]}
          </Typography>
        </Box>
        {probe ? (
          <Stack direction="row" gap={0.5}>
            <Tooltip title="Edit">
              <span>
                <IconButton size="small" color="primary" aria-label={`Edit ${title}`} disabled={busy} onClick={onConfigure}>
                  <Pencil size={16} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete">
              <span>
                <IconButton size="small" color="error" aria-label={`Delete ${title}`} disabled={busy} onClick={onDelete}>
                  <Trash2 size={16} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ) : (
          <Button variant="contained" size="small" startIcon={<Plus size={14} />} disabled={busy} onClick={onConfigure}>
            Configure
          </Button>
        )}
      </Stack>
      {probe && <ProbeDisplay probe={probe} showSuccess={kind === PROBE_KIND.READINESS} />}
      {!probe && unsetNote && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {unsetNote}
        </Typography>
      )}
    </Box>
  );
}
