import type { JSX, ReactNode } from 'react';
import { Box, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';

interface PodDrawerShellProps {
  title: string;
  podName: string;
  onClose: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}

export default function PodDrawerShell({ title, podName, onClose, headerActions, children }: PodDrawerShellProps): JSX.Element {
  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 640 } } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6">{title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {podName}
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={1}>
          {headerActions}
          <IconButton size="small" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Stack>
      </Stack>
      <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>{children}</Box>
    </Drawer>
  );
}
