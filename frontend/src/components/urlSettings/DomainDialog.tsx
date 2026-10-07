import { useState, type JSX } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@wso2/oxygen-ui';
import EnvironmentSelect from '../webapp/EnvironmentSelect';
import { validateDomain } from '../../utils/domain';
import type { EnvironmentId } from '../../types/webApp';
import type { CustomDomainInput, CustomDomainMapping } from '../../types/urlSettings';

interface DomainDialogProps {
  /** When set, the dialog edits this mapping; otherwise it adds a new one. */
  existing?: CustomDomainMapping;
  isPending: boolean;
  error: string | null;
  onSubmit: (input: CustomDomainInput) => void;
  onClose: () => void;
}

export default function DomainDialog({ existing, isPending, error, onSubmit, onClose }: DomainDialogProps): JSX.Element {
  const [environment, setEnvironment] = useState<EnvironmentId>(existing ? existing.environment : 'production');
  const [domain, setDomain] = useState(existing ? existing.domain : '');
  const [touched, setTouched] = useState(false);

  const domainError = validateDomain(domain);
  const showError = touched && domainError !== null;

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{existing ? 'Edit Custom Domain' : 'Add Custom Domain'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack gap={2} sx={{ mt: 1 }}>
          {existing ? null : <EnvironmentSelect value={environment} onChange={setEnvironment} />}
          <TextField
            label="Domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={() => setTouched(true)}
            fullWidth
            required
            placeholder="app.example.com"
            error={showError}
            helperText={showError ? domainError : existing ? 'Changing the domain requires re-verification.' : 'You will need to point a CNAME record at your default URL to verify ownership.'}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            setTouched(true);
            if (domainError === null) onSubmit({ environment, domain: domain.trim() });
          }}
          disabled={isPending}
          startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {existing ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
