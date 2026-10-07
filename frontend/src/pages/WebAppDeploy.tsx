import { Fragment } from 'react';
import type { JSX } from 'react';
import { Alert, Box, CircularProgress, Stack } from '@wso2/oxygen-ui';
import WebAppPage from '../components/webapp/WebAppPage';
import BuildArea from '../components/deploy/BuildArea';
import DeployEnvironmentCard from '../components/deploy/DeployEnvironmentCard';
import PromoteConnector from '../components/deploy/PromoteConnector';
import { currentDeployment, historyFor } from '../components/deploy/deploymentUtils';
import { useBuilds } from '../hooks/useBuilds';
import { useDeployBuild, useDeployments, usePromote, useRedeploy, useStopDeployment } from '../hooks/useDeployments';
import type { Build } from '../types/webApp';
import type { Environment } from '../types/environment';
import type { TrackRef } from '../types/track';

/** Pipeline view: latest build, then one card per pipeline environment (in promotion order) with promote between them. */
function DeployPipeline({ track, environments }: { track: TrackRef; environments: Environment[] }): JSX.Element {
  const { data: builds, isLoading: loadingBuilds } = useBuilds(track);
  const { data: deployments, isLoading: loadingDeployments, isError } = useDeployments(track);
  const deploy = useDeployBuild(track);
  const promote = usePromote(track);
  const redeploy = useRedeploy(track);
  const stop = useStopDeployment(track);

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

  if (environments.length === 0) {
    return <Alert severity="warning">This project's deployment pipeline has no environments.</Alert>;
  }

  const latestBuild = builds?.[0];
  const firstEnv = environments[0];
  const busy = deploy.isPending || promote.isPending || redeploy.isPending || stop.isPending;
  const failure = [deploy, promote, redeploy, stop].find((m) => m.isError)?.error;

  const handleDeploy = (build: Build) => deploy.mutate({ environment: firstEnv.id, build: { id: build.id, commitSha: build.commitSha, commitMessage: build.commitMessage } });

  return (
    <Stack>
      <BuildArea loading={loadingBuilds} latestBuild={latestBuild} deploying={deploy.isPending} targetEnvName={firstEnv.name} onDeploy={handleDeploy} />
      {environments.map((env, index) => {
        const environment = env.id;
        const nextEnv = environments[index + 1];
        return (
          <Fragment key={environment}>
            <PromoteConnector />
            <DeployEnvironmentCard
              environment={environment}
              environmentName={env.name}
              current={currentDeployment(deployments, environment)}
              history={historyFor(deployments, environment)}
              promoteTargetName={nextEnv?.name}
              canDeployBuild={index === 0 && latestBuild?.status === 'success'}
              busy={busy}
              error={failure instanceof Error ? failure.message : undefined}
              onDeployBuild={() => latestBuild && handleDeploy(latestBuild)}
              onRedeploy={() => redeploy.mutate(environment)}
              onStop={() => stop.mutate(environment)}
              onPromote={() => nextEnv && promote.mutate({ sourceEnvironment: environment, targetEnvironment: nextEnv.id })}
            />
          </Fragment>
        );
      })}
    </Stack>
  );
}

export default function WebAppDeploy(): JSX.Element {
  return (
    <WebAppPage title="Deploy" description="Deploy builds to the first environment and promote them along the project's pipeline.">
      {({ track, environments }) => <DeployPipeline track={track} environments={environments} />}
    </WebAppPage>
  );
}
