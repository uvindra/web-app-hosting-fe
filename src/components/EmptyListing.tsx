import { Box, Button, Typography } from '@wso2/oxygen-ui';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';

interface EmptyListingProps {
  icon: ReactNode;
  title: string;
  description: string;
  showAction?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyListing({ icon, title, description, showAction, actionLabel = 'Create', onAction }: EmptyListingProps) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Box sx={{ opacity: 0.3, mb: 2 }}>{icon}</Box>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      {showAction && (
        <Button variant="contained" startIcon={<Plus size={20} />} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
