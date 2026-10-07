import { useState, type JSX } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@wso2/oxygen-ui';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import { useCreateDeploymentTrack, useRepoBranches } from '../../hooks/useDeploymentTracks';

interface CreateTrackDialogProps {
  webAppId: string;
  /** Branches that already have a track; they are left out of the picker. */
  trackedBranches: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}

function BranchPicker({ webAppId, trackedBranches, value, onChange }: { webAppId: string; trackedBranches: string[]; value: string; onChange: (branch: string) => void }): JSX.Element {
  const { data: branches, isLoading, isError, refetch } = useRepoBranches(webAppId);

  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  if (isError || !branches) {
    return (
      <Alert severity="error" action={<Button onClick={() => void refetch()}>Retry</Button>}>
        Failed to load the repository's branches.
      </Alert>
    );
  }

  const available = branches.filter((b) => !trackedBranches.includes(b));
  if (available.length === 0) {
    return <Alert severity="info">Every branch in the repository already has a deployment track. Push a new branch to create another track.</Alert>;
  }

  return (
    <TextField select label="Branch" value={value} onChange={(e) => onChange(e.target.value)} fullWidth required helperText="The Git branch this track builds and deploys from.">
      {available.map((b) => (
        <MenuItem key={b} value={b}>
          {b}
        </MenuItem>
      ))}
    </TextField>
  );
}

export default function CreateTrackDialog({ webAppId, trackedBranches, onClose, onDone }: CreateTrackDialogProps): JSX.Element {
  const create = useCreateDeploymentTrack(webAppId);
  const [branch, setBranch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    setError(null);
    create.mutate({ branch }, { onSuccess: () => onDone(`Deployment track created for branch "${branch}".`), onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create the deployment track.') });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create Deployment Track</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack gap={2} sx={{ mt: 1 }}>
          <BranchPicker webAppId={webAppId} trackedBranches={trackedBranches} value={branch} onChange={setBranch} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleCreate} disabled={branch === '' || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : <Plus size={16} />}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
