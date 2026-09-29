import type { JSX } from 'react';
import { Box, Drawer, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import type { Deployment } from '../../types/deployment';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import DeploymentStatusChip from './DeploymentStatusChip';

const drawerSx = { '& .MuiDrawer-paper': { width: 480, p: 0, top: { xs: '56px', sm: '64px' }, height: 'auto', bottom: 0 } };

interface DeploymentHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  envName: string;
  deployments: Deployment[];
}

export default function DeploymentHistoryDrawer({ open, onClose, envName, deployments }: DeploymentHistoryDrawerProps): JSX.Element {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} variant="temporary" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack gap={0.25}>
          <Typography variant="h3">Deployment History</Typography>
          <Typography variant="caption" color="text.secondary">
            {envName}
          </Typography>
        </Stack>
        <Tooltip title="Close">
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <X size={18} />
          </IconButton>
        </Tooltip>
      </Stack>
      {deployments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
          No deployments yet.
        </Typography>
      ) : (
        <Box sx={{ overflow: 'auto' }}>
          {deployments.map((d) => (
            <Stack key={d.id} gap={0.5} sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {d.commitSha}
                </Typography>
                <DeploymentStatusChip status={d.status} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {d.commitMessage}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatRelativeTime(d.deployedAt)}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
    </Drawer>
  );
}
