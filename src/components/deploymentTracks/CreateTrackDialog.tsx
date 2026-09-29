import { useState, type JSX } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@wso2/oxygen-ui';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import { useCreateDeploymentTrack } from '../../hooks/useDeploymentTracks';

interface CreateTrackDialogProps {
  webAppId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

export default function CreateTrackDialog({ webAppId, onClose, onDone }: CreateTrackDialogProps): JSX.Element {
  const create = useCreateDeploymentTrack(webAppId);
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const branchInvalid = /\s/.test(branch);
  const valid = name.trim() !== '' && branch.trim() !== '' && !branchInvalid;

  const handleCreate = () => {
    setError(null);
    create.mutate(
      { name: name.trim(), branch: branch.trim() },
      { onSuccess: () => onDone('Deployment track created.'), onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create the deployment track.') },
    );
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
          <TextField label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} fullWidth required placeholder="main" error={branchInvalid} helperText={branchInvalid ? 'Branch names cannot contain spaces.' : 'The Git branch this track builds from.'} />
          <TextField label="Track Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required placeholder="staging" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleCreate} disabled={!valid || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : <Plus size={16} />}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
