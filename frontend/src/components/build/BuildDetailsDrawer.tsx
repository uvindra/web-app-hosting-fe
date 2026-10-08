import type { JSX } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Divider, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, X } from '@wso2/oxygen-ui-icons-react';
import BuildStatusLabel from './BuildStatusLabel';
import type { BuildRun, BuildStepStatus } from '../../types/build';
import { formatBuildDuration } from '../../utils/buildFormat';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import type { PaletteColor } from '../../utils/statusColor';

const STEP_COLOR: Record<BuildStepStatus, PaletteColor> = { success: 'success', failed: 'error', 'in-progress': 'warning', pending: 'default' };
const STEP_LABEL: Record<BuildStepStatus, string> = { success: 'Success', failed: 'Failed', 'in-progress': 'Running', pending: 'Pending' };

interface BuildDetailsDrawerProps {
  build: BuildRun | undefined;
  onClose: () => void;
}

/** Right drawer with build metadata and per-step logs. */
export default function BuildDetailsDrawer({ build, onClose }: BuildDetailsDrawerProps): JSX.Element {
  return (
    <Drawer anchor="right" open={build !== undefined} onClose={onClose}>
      {build && (
        <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 3 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h5" component="h2">
              Build Details
            </Typography>
            <IconButton aria-label="Close" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </Stack>
          <Stack gap={1} sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <BuildStatusLabel status={build.status} />
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {build.commitSha}
              </Typography>
              <Chip size="small" variant="outlined" label={build.branch} />
            </Stack>
            <Typography variant="body1">{build.commitMessage}</Typography>
            <Typography variant="body2" color="text.secondary">
              {build.author} · started {formatRelativeTime(build.triggeredAt)}
              {formatBuildDuration(build) && ` · took ${formatBuildDuration(build)}`}
            </Typography>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Steps
          </Typography>
          {build.steps.map((step) => (
            <Accordion key={step.name} disableGutters defaultExpanded={step.status === 'failed' || step.status === 'in-progress'}>
              <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', pr: 1 }}>
                  <Typography variant="body2">{step.name}</Typography>
                  <Chip size="small" label={STEP_LABEL[step.status]} color={STEP_COLOR[step.status]} />
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Box component="pre" sx={{ m: 0, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {step.logs.length > 0 ? step.logs.join('\n') : 'No logs yet.'}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}
    </Drawer>
  );
}
