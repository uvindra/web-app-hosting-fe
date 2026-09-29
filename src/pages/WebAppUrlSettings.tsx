import { useState, type JSX } from 'react';
import { useOutletContext } from 'react-router';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleCheck, Globe, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import type { ReadyWebAppContext } from '../components/webapp/WebAppPage';
import EmptyListing from '../components/EmptyListing';
import DefaultUrlRow from '../components/urlSettings/DefaultUrlRow';
import DomainDialog from '../components/urlSettings/DomainDialog';
import { ENVIRONMENT_LABEL } from '../constants/environments';
import { useCreateCustomDomain, useCustomDomains, useDefaultUrls, useDeleteCustomDomain, useUpdateCustomDomain, useVerifyCustomDomain } from '../hooks/useUrlSettings';
import type { PaletteColor } from '../utils/statusColor';
import type { CustomDomainMapping, DomainVerificationStatus } from '../types/urlSettings';

const VERIFICATION_COLOR: Record<DomainVerificationStatus, PaletteColor> = { pending: 'warning', verified: 'success', failed: 'error' };
const VERIFICATION_LABEL: Record<DomainVerificationStatus, string> = { pending: 'Pending', verified: 'Verified', failed: 'Failed' };

type Dialogs = { kind: 'add' } | { kind: 'edit'; mapping: CustomDomainMapping } | { kind: 'delete'; mapping: CustomDomainMapping } | null;

export default function WebAppUrlSettings(): JSX.Element {
  const { webApp } = useOutletContext<ReadyWebAppContext>();
  const defaults = useDefaultUrls(webApp);
  const domains = useCustomDomains(webApp.id);
  const create = useCreateCustomDomain(webApp);
  const update = useUpdateCustomDomain(webApp.id);
  const del = useDeleteCustomDomain(webApp.id);
  const verify = useVerifyCustomDomain(webApp.id);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (defaults.isLoading || domains.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (defaults.isError || domains.isError || !defaults.data || !domains.data) {
    return (
      <Alert
        severity="error"
        action={
          <Button
            onClick={() => {
              defaults.refetch();
              domains.refetch();
            }}
          >
            Retry
          </Button>
        }
      >
        Failed to load URL settings.
      </Alert>
    );
  }

  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };
  const done = (message: string) => {
    closeDialog();
    setAlert({ type: 'success', message });
  };
  const failed = (e: unknown, fallback: string) => setDialogError(e instanceof Error ? e.message : fallback);

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2">
          Default URLs
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Each environment is served from its own URL.
        </Typography>
        {defaults.data.map((d) => (
          <DefaultUrlRow key={d.environment} label={ENVIRONMENT_LABEL[d.environment]} url={d.url} />
        ))}
      </Box>

      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Typography variant="h6" component="h2">
          Custom Domains
        </Typography>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setDialog({ kind: 'add' })}>
          Add Custom Domain
        </Button>
      </Stack>

      {domains.data.length === 0 ? (
        <EmptyListing icon={<Globe size={48} />} title="No custom domains" description="Serve this web app from your own domain." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Domain</ListingTable.Cell>
                <ListingTable.Cell>Environment</ListingTable.Cell>
                <ListingTable.Cell>CNAME Target</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {domains.data.map((m) => (
                <ListingTable.Row key={m.id}>
                  <ListingTable.Cell>{m.domain}</ListingTable.Cell>
                  <ListingTable.Cell>{ENVIRONMENT_LABEL[m.environment]}</ListingTable.Cell>
                  <ListingTable.Cell>{m.cnameTarget}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Chip label={VERIFICATION_LABEL[m.status]} size="small" variant="outlined" color={VERIFICATION_COLOR[m.status]} />
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    {m.status !== 'verified' && (
                      <Tooltip title="Verify DNS">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Verify ${m.domain}`}
                            disabled={verify.isPending}
                            onClick={() =>
                              verify.mutate(m.id, {
                                onError: (e) => setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Verification failed.' }),
                              })
                            }
                          >
                            {verify.isPending && verify.variables === m.id ? <CircularProgress size={16} /> : <CircleCheck size={16} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit">
                      <IconButton size="small" aria-label={`Edit ${m.domain}`} onClick={() => setDialog({ kind: 'edit', mapping: m })}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" aria-label={`Delete ${m.domain}`} onClick={() => setDialog({ kind: 'delete', mapping: m })}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {dialog?.kind === 'add' && (
        <DomainDialog
          isPending={create.isPending}
          error={dialogError}
          onClose={closeDialog}
          onSubmit={(input) => create.mutate(input, { onSuccess: () => done('Custom domain added. Point a CNAME record at the target to verify it.'), onError: (e) => failed(e, 'Failed to add the domain.') })}
        />
      )}

      {dialog?.kind === 'edit' && (
        <DomainDialog
          existing={dialog.mapping}
          isPending={update.isPending}
          error={dialogError}
          onClose={closeDialog}
          onSubmit={(input) => update.mutate({ id: dialog.mapping.id, input }, { onSuccess: () => done('Custom domain updated.'), onError: (e) => failed(e, 'Failed to update the domain.') })}
        />
      )}

      {dialog?.kind === 'delete' && (
        <Dialog open onClose={closeDialog} maxWidth="xs" fullWidth>
          <DialogTitle>Delete custom domain?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              <strong>{dialog.mapping.domain}</strong> will stop serving this web app. The default URL keeps working.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={del.isPending}
              startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
              onClick={() =>
                del.mutate(dialog.mapping.id, {
                  onSuccess: () => done('Custom domain deleted.'),
                  onError: (e) => {
                    closeDialog();
                    setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed.' });
                  },
                })
              }
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
