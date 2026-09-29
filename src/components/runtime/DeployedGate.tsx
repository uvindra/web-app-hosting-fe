import type { JSX, ReactNode } from 'react';
import { Alert, Box, CircularProgress } from '@wso2/oxygen-ui';
import { Rocket } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../EmptyListing';
import { useEnvironments } from '../../hooks/useBuilds';
import { ENVIRONMENT_LABEL } from '../../constants/environments';
import type { EnvironmentId } from '../../types/webApp';

interface DeployedGateProps {
  webAppId: string;
  environment: EnvironmentId;
  children: ReactNode;
}

/** Renders children only when the web app is deployed to the environment; otherwise a loading/error/empty state. */
export default function DeployedGate({ webAppId, environment, children }: DeployedGateProps): JSX.Element {
  const { data, isLoading, isError } = useEnvironments(webAppId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (isError || !data) {
    return <Alert severity="error">Failed to load environments.</Alert>;
  }
  const deployed = data.find((e) => e.environment === environment)?.deployed === true;
  if (!deployed) {
    return <EmptyListing icon={<Rocket size={48} />} title={`Not deployed to ${ENVIRONMENT_LABEL[environment]}`} description="Deploy this web app to the environment to see its data here." />;
  }
  return <>{children}</>;
}
