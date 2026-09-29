import { Box, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

interface PlaceholderProps {
  title: string;
}

/** Stand-in for a page not yet built — replaced page by page as the wireframes are implemented. */
export default function Placeholder({ title }: PlaceholderProps): JSX.Element {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h5" component="h1">
        {title} — TODO
      </Typography>
    </Box>
  );
}
