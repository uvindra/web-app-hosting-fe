import type { JSX } from 'react';
import { Alert, Button } from '@wso2/oxygen-ui';
import { isPlanRequired, isQuotaExceeded } from '../types/http';
import PlanUpgradeHint from './PlanUpgradeHint';

interface ErrorAlertProps {
  error: unknown;
  /** Shown when the error has no message. */
  fallback: string;
  onClose?: () => void;
}

/**
 * Error alert that recognises the plan quota (BFF 402 `QUOTA_EXCEEDED`, D7): each deployment track
 * counts as one unit and the free plan allows 3 — and paid-only features (BFF 403 `PLAN_REQUIRED`).
 * Links to the billing console when configured.
 */
export default function ErrorAlert({ error, fallback, onClose }: ErrorAlertProps): JSX.Element {
  if (isQuotaExceeded(error)) {
    const billingUrl = window.API_CONFIG?.billingConsoleUrl;
    return (
      <Alert
        severity="warning"
        role="alert"
        onClose={onClose}
        action={
          billingUrl ? (
            <Button color="inherit" size="small" href={billingUrl} target="_blank" rel="noopener noreferrer">
              Upgrade
            </Button>
          ) : undefined
        }>
        Quota reached — upgrade your plan to create more web apps or deployment tracks. Each deployment track counts towards your plan's limit.
      </Alert>
    );
  }
  if (isPlanRequired(error)) {
    return <PlanUpgradeHint message={error instanceof Error ? error.message : fallback} onClose={onClose} />;
  }
  return (
    <Alert severity="error" role="alert" onClose={onClose}>
      {error instanceof Error && error.message ? error.message : fallback}
    </Alert>
  );
}
