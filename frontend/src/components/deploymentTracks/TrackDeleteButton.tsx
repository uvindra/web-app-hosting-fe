import { useState, type JSX } from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Tooltip } from '@wso2/oxygen-ui';
import { Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useCheckDeploymentTrackDeletable, useDeleteDeploymentTrack } from '../../hooks/useDeploymentTracks';
import type { DeploymentTrack } from '../../types/deploymentTracks';

interface TrackDeleteButtonProps {
  webAppId: string;
  track: DeploymentTrack;
  onResult: (result: { type: 'success' | 'error'; message: string }) => void;
}

/** Per-row delete control: runs the deletability pre-flight check, then confirms and deletes. The default track is never deletable. */
export default function TrackDeleteButton({ webAppId, track, onResult }: TrackDeleteButtonProps): JSX.Element {
  const check = useCheckDeploymentTrackDeletable(webAppId);
  const del = useDeleteDeploymentTrack(webAppId);
  const [confirming, setConfirming] = useState(false);

  const requestDelete = () =>
    check.mutate(track.id, {
      onSuccess: (res) => (res.canDelete ? setConfirming(true) : onResult({ type: 'error', message: res.message ?? 'This track cannot be deleted.' })),
      onError: (e) => onResult({ type: 'error', message: e instanceof Error ? e.message : 'Could not check whether the track can be deleted.' }),
    });

  const confirmDelete = () =>
    del.mutate(track.id, {
      onSuccess: () => {
        setConfirming(false);
        onResult({ type: 'success', message: `Deployment track for branch "${track.branch}" deleted.` });
      },
      onError: (e) => {
        setConfirming(false);
        onResult({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed.' });
      },
    });

  return (
    <>
      <Tooltip title={track.isDefault ? 'The default track cannot be deleted' : 'Delete'}>
        <span>
          <IconButton size="small" color="error" aria-label={`Delete ${track.branch}`} disabled={track.isDefault || check.isPending} onClick={requestDelete}>
            {check.isPending ? <CircularProgress size={16} color="inherit" /> : <Trash2 size={16} />}
          </IconButton>
        </span>
      </Tooltip>
      {confirming && (
        <Dialog open onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete deployment track?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This permanently deletes the deployment track for branch <strong>{track.branch}</strong>.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirming(false)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={confirmDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
