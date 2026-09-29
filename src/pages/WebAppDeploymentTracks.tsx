import { useState, type JSX } from 'react';
import { useOutletContext } from 'react-router';
import { Alert, Box, Button, Chip, CircularProgress, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { GitBranch, Plus } from '@wso2/oxygen-ui-icons-react';
import type { ReadyWebAppContext } from '../components/webapp/WebAppPage';
import EmptyListing from '../components/EmptyListing';
import CreateTrackDialog from '../components/deploymentTracks/CreateTrackDialog';
import TrackDeleteButton from '../components/deploymentTracks/TrackDeleteButton';
import AutoDeploySwitch from '../components/deploymentTracks/AutoDeploySwitch';
import { useDeploymentTracks } from '../hooks/useDeploymentTracks';

export default function WebAppDeploymentTracks(): JSX.Element {
  const { webApp } = useOutletContext<ReadyWebAppContext>();
  const { data: tracks, isLoading, isError, refetch } = useDeploymentTracks(webApp.id);
  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !tracks) {
    return (
      <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
        Failed to load deployment tracks.
      </Alert>
    );
  }

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          A deployment track builds and deploys this web app from a Git branch.
        </Typography>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
          Create Deployment Track
        </Button>
      </Stack>

      {tracks.length === 0 ? (
        <EmptyListing icon={<GitBranch size={48} />} title="No deployment tracks" description="Create a deployment track to build and deploy this web app from a branch." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Track</ListingTable.Cell>
                <ListingTable.Cell>Branch</ListingTable.Cell>
                <ListingTable.Cell>Auto Deploy</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {tracks.map((t) => (
                <ListingTable.Row key={t.id}>
                  <ListingTable.Cell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      {t.name}
                      {t.isDefault && <Chip label="Default" size="small" variant="outlined" color="primary" />}
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <GitBranch size={14} />
                      {t.branch}
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <AutoDeploySwitch webAppId={webApp.id} track={t} onError={(message) => setAlert({ type: 'error', message })} />
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <TrackDeleteButton webAppId={webApp.id} track={t} onResult={setAlert} />
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {creating && (
        <CreateTrackDialog
          webAppId={webApp.id}
          onClose={() => setCreating(false)}
          onDone={(message) => {
            setCreating(false);
            setAlert({ type: 'success', message });
          }}
        />
      )}
    </>
  );
}
