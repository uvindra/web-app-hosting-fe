import { useState, type JSX, type ReactNode } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from '@wso2/oxygen-ui';
import ErrorAlert from './ErrorAlert';

interface ConfirmDeleteDialogProps {
  title: string;
  description: ReactNode;
  /** The name the user must type to enable the delete button. */
  confirmText: string;
  pending: boolean;
  /** The failed delete's error (e.g. a BFF 409 message), shown above the actions. */
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}

/** Type-to-confirm dialog for irreversible deletes. Render it only while open, so the typed text resets. */
export default function ConfirmDeleteDialog({ title, description, confirmText, pending, error, onConfirm, onClose }: ConfirmDeleteDialogProps): JSX.Element {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === confirmText;

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{description}</DialogContentText>
        <DialogContentText sx={{ mt: 2 }}>
          Type <strong>{confirmText}</strong> to confirm.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          size="small"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={pending}
          sx={{ mt: 1 }}
          slotProps={{ htmlInput: { 'aria-label': `Type ${confirmText} to confirm` } }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches && !pending) onConfirm();
          }}
        />
        {error !== null && error !== undefined && (
          <Box sx={{ mt: 2 }}>
            <ErrorAlert error={error} fallback="Delete failed." />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" color="error" onClick={onConfirm} disabled={!matches || pending} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
