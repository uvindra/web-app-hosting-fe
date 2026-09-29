import type { JSX } from 'react';
import { Box } from '@wso2/oxygen-ui';
import { ArrowDown } from '@wso2/oxygen-ui-icons-react';

/** Vertical arrow linking pipeline stages. */
export default function PromoteConnector(): JSX.Element {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 1, color: 'text.secondary' }}>
      <ArrowDown size={20} />
    </Box>
  );
}
