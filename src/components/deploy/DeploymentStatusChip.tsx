import type { JSX } from 'react';
import { Chip } from '@wso2/oxygen-ui';
import type { DeploymentStatus } from '../../types/deployment';
import { DEPLOYMENT_STATUS_COLOR, DEPLOYMENT_STATUS_LABEL } from './deploymentUtils';

export default function DeploymentStatusChip({ status }: { status: DeploymentStatus }): JSX.Element {
  return <Chip label={DEPLOYMENT_STATUS_LABEL[status]} color={DEPLOYMENT_STATUS_COLOR[status]} size="small" />;
}
