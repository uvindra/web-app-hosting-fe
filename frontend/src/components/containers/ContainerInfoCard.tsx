import { useState, type JSX } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { Pencil } from '@wso2/oxygen-ui-icons-react';
import ContainerEditForm from './ContainerEditForm';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import type { WebAppContainer } from '../../types/containers';
import type { EnvironmentId } from '../../types/webApp';
import type { TrackRef } from '../../types/track';

interface ContainerInfoCardProps {
  container: WebAppContainer;
  track: TrackRef;
  environment: EnvironmentId;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const cardSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3, mb: 2 } as const;

function Detail({ label, children }: { label: string; children: string | JSX.Element }): JSX.Element {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {children}
      </Typography>
    </Box>
  );
}

export default function ContainerInfoCard({ container: c, track, environment, onSaved, onError }: ContainerInfoCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ContainerEditForm
        container={c}
        track={track}
        environment={environment}
        onClose={() => setEditing(false)}
        onSaved={(m) => {
          setEditing(false);
          onSaved(m);
        }}
        onError={onError}
      />
    );
  }

  return (
    <Box sx={cardSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Typography variant="h6">{c.name}</Typography>
          <Chip size="small" variant="outlined" color="success" label="Main Container" />
        </Stack>
        <Button variant="outlined" size="small" startIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
          Edit
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Last updated {formatRelativeTime(c.updatedAt)}
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={{ xs: 2, md: 6 }} flexWrap="wrap">
        <Detail label="Image">
          <Box component="span" sx={{ fontFamily: 'monospace' }}>
            {c.image}
          </Box>
        </Detail>
        <Detail label="Image pull policy">{c.imagePullPolicy === 'Always' ? 'Always' : 'If Not Present'}</Detail>
        <Detail label="Ports">{c.ports.map((p) => `${p.protocol}: ${p.port}`).join(', ')}</Detail>
        <Detail label="CPU (request / limit)">{`${c.cpuRequest}m / ${c.cpuLimit}m`}</Detail>
        <Detail label="Memory (request / limit)">{`${c.memoryRequest} Mi / ${c.memoryLimit} Mi`}</Detail>
      </Stack>
      {(c.command.length > 0 || c.args.length > 0) && (
        <Stack gap={1.5} sx={{ mt: 3 }}>
          {c.command.length > 0 && <CodeLine label="Command" value={c.command} />}
          {c.args.length > 0 && <CodeLine label="Arguments" value={c.args} />}
        </Stack>
      )}
    </Box>
  );
}

function CodeLine({ label, value }: { label: string; value: string[] }): JSX.Element {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box component="pre" sx={{ m: 0, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.8125rem', fontFamily: 'monospace', color: 'text.secondary', overflowX: 'auto' }}>
        {JSON.stringify(value)}
      </Box>
    </Box>
  );
}
