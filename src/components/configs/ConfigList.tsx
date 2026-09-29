import { useState, type JSX } from 'react';
import { Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, Stack, Tooltip } from '@wso2/oxygen-ui';
import { KeyRound, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../EmptyListing';
import ConfigEditor from './ConfigEditor';
import { useConfigs, useDeleteConfig } from '../../hooks/useConfigs';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import type { ConfigItem } from '../../types/configs';
import type { EnvironmentId } from '../../types/webApp';

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; item: ConfigItem };
type Notice = { type: 'success' | 'error'; message: string } | null;

export default function ConfigList({ webAppId, environment }: { webAppId: string; environment: EnvironmentId }): JSX.Element {
  const { data, isLoading, isError } = useConfigs(webAppId, environment);
  const del = useDeleteConfig(webAppId, environment);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [deleting, setDeleting] = useState<ConfigItem | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress />
      </Stack>
    );
  }
  if (isError || !data) {
    return <Alert severity="error">Failed to load configs and secrets.</Alert>;
  }

  if (view.kind !== 'list') {
    return (
      <ConfigEditor
        webAppId={webAppId}
        environment={environment}
        existing={view.kind === 'edit' ? view.item : undefined}
        onBack={() => setView({ kind: 'list' })}
        onSaved={(message) => {
          setView({ kind: 'list' });
          setNotice({ type: 'success', message });
        }}
      />
    );
  }

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    del.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setNotice({ type: 'success', message: `'${name}' removed.` });
      },
      onError: (e) => {
        setDeleting(null);
        setNotice({ type: 'error', message: e instanceof Error ? e.message : 'Failed to remove.' });
      },
    });
  };

  return (
    <>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setView({ kind: 'create' })}>
          Create
        </Button>
      </Stack>
      {notice && (
        <Alert severity={notice.type} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.message}
        </Alert>
      )}
      {data.length === 0 ? (
        <EmptyListing icon={<KeyRound size={48} />} title="No configs or secrets" description="Inject environment variables such as API_BASE_URL into this web app." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Keys</ListingTable.Cell>
                <ListingTable.Cell>Updated</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {data.map((item) => (
                <ListingTable.Row key={item.id}>
                  <ListingTable.Cell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      {item.name}
                      {item.kind === 'secret' && <Chip label="Secret" size="small" variant="outlined" color="warning" />}
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell sx={{ fontFamily: 'monospace' }}>{item.entries.map((e) => e.key).join(', ')}</ListingTable.Cell>
                  <ListingTable.Cell>{formatRelativeTime(item.updatedAt)}</ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" aria-label={`Edit ${item.name}`} onClick={() => setView({ kind: 'edit', item })}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton size="small" color="error" aria-label={`Remove ${item.name}`} onClick={() => setDeleting(item)}>
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
      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Remove &lsquo;{deleting.name}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>This removes the {deleting.kind} from the environment. This cannot be undone.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={confirmDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Remove
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
