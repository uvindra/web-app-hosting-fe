import { Fragment } from 'react';
import type { JSX } from 'react';
import { Alert, Box, CircularProgress, Stack } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import BuildArea from '../components/deploy/BuildArea';
import DeployEnvironmentCard from '../components/deploy/DeployEnvironmentCard';
import PromoteConnector from '../components/deploy/PromoteConnector';
import { currentDeployment, historyFor } from '../components/deploy/deploymentUtils';
import { ENVIRONMENT_IDS, ENVIRONMENT_LABEL } from '../constants/environments';
import { useBuilds } from '../hooks/useBuilds';
import { useDeployBuild, useDeployments, usePromote, useRedeploy, useStopDeployment } from '../hooks/useDeployments';
import type { Build } from '../types/webApp';

/** Pipeline view: latest build, then one card per environment (Development -> Production) with promote between them. */
function DeployPipeline({ webAppId }: { webAppId: string }): JSX.Element {
  const { data: builds, isLoading: loadingBuilds } = useBuilds(webAppId);
  const { data: deployments, isLoading: loadingDeployments, isError } = useDeployments(webAppId);
  const deploy = useDeployBuild(webAppId);
  const promote = usePromote(webAppId);
  const redeploy = useRedeploy(webAppId);
  const stop = useStopDeployment(webAppId);

  if (loadingDeployments) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !deployments) {
    return <Alert severity="error">Failed to load deployments.</Alert>;
  }

  const latestBuild = builds?.[0];
  const firstEnv = ENVIRONMENT_IDS[0];
  const busy = deploy.isPending || promote.isPending || redeploy.isPending || stop.isPending;
  const failure = [deploy, promote, redeploy, stop].find((m) => m.isError)?.error;

  const handleDeploy = (build: Build) => deploy.mutate({ environment: firstEnv, build: { id: build.id, commitSha: build.commitSha, commitMessage: build.commitMessage } });

  return (
    <Stack>
      <BuildArea loading={loadingBuilds} latestBuild={latestBuild} deploying={deploy.isPending} targetEnvName={ENVIRONMENT_LABEL[firstEnv]} onDeploy={handleDeploy} />
      {ENVIRONMENT_IDS.map((environment, index) => {
        const nextEnv = ENVIRONMENT_IDS[index + 1];
        return (
          <Fragment key={environment}>
            <PromoteConnector />
            <DeployEnvironmentCard
              environment={environment}
              current={currentDeployment(deployments, environment)}
              history={historyFor(deployments, environment)}
              promoteTargetName={nextEnv ? ENVIRONMENT_LABEL[nextEnv] : undefined}
              canDeployBuild={index === 0 && latestBuild?.status === 'success'}
              busy={busy}
              error={failure instanceof Error ? failure.message : undefined}
              onDeployBuild={() => latestBuild && handleDeploy(latestBuild)}
              onRedeploy={() => redeploy.mutate(environment)}
              onStop={() => stop.mutate(environment)}
              onPromote={() => nextEnv && promote.mutate({ sourceEnvironment: environment, targetEnvironment: nextEnv })}
            />
          </Fragment>
        );
      })}
    </Stack>
  );
}

export default function WebAppDeploy(): JSX.Element {
  return (
    <WebAppPage title="Deploy" description="Deploy builds to Development and promote them to Production.">
      {({ webApp }) => <DeployPipeline webAppId={webApp.id} />}
    </WebAppPage>
  );
}
