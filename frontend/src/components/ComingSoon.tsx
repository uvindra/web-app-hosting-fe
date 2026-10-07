import type { JSX, ReactNode } from 'react';
import { Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { Clock } from '@wso2/oxygen-ui-icons-react';

interface ComingSoonProps {
  title: string;
  description: ReactNode;
}

/** Placeholder for features without a backend yet (P1/P2) — shown instead of mock data. */
export default function ComingSoon({ title, description }: ComingSoonProps): JSX.Element {
  return (
    <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 4, textAlign: 'center' }}>
      <Stack alignItems="center" gap={1.5}>
        <Clock size={36} />
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="h6">{title}</Typography>
          <Chip label="Coming soon" size="small" color="info" />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
          {description}
        </Typography>
      </Stack>
    </Box>
  );
}
