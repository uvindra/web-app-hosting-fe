import type { JSX } from 'react';
import { Alert, Button } from '@wso2/oxygen-ui';
import { upgradeUrl } from '../hooks/usePlan';

interface PlanUpgradeHintProps {
  message: string;
  onClose?: () => void;
}

/** Explains a paid-plan feature, with an "Upgrade" link to the billing console when one is configured. */
export default function PlanUpgradeHint({ message, onClose }: PlanUpgradeHintProps): JSX.Element {
  const url = upgradeUrl();
  return (
    <Alert
      severity="info"
      onClose={onClose}
      action={
        url !== undefined ? (
          <Button color="inherit" size="small" href={url} target="_blank" rel="noopener noreferrer">
            Upgrade
          </Button>
        ) : undefined
      }>
      {message}
    </Alert>
  );
}
