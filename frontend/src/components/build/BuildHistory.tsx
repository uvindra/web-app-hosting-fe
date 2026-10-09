import type { JSX } from 'react';
import { Box, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@wso2/oxygen-ui';
import { Hammer } from '@wso2/oxygen-ui-icons-react';
import EmptyListing from '../EmptyListing';
import BuildStatusLabel from './BuildStatusLabel';
import type { BuildRun } from '../../types/build';
import { failedSecurityScan, formatBuildDuration } from '../../utils/buildFormat';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

interface BuildHistoryProps {
  builds: BuildRun[];
  selectedId?: string;
  onSelect: (build: BuildRun) => void;
}

export default function BuildHistory({ builds, selectedId, onSelect }: BuildHistoryProps): JSX.Element {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        Build History
      </Typography>
      {builds.length === 0 ? (
        <EmptyListing icon={<Hammer size={48} />} title="No builds yet" description="Trigger a build to see it here." />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Commit</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Branch</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Started</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {builds.map((b) => (
              <TableRow key={b.id} hover selected={b.id === selectedId} onClick={() => onSelect(b)} sx={{ cursor: 'pointer' }}>
                <TableCell sx={{ fontFamily: 'monospace' }}>{b.commitSha}</TableCell>
                <TableCell>{b.commitMessage}</TableCell>
                <TableCell>{b.branch}</TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" gap={1}>
                    <BuildStatusLabel status={b.status} />
                    {failedSecurityScan(b) && <Chip size="small" variant="outlined" color="error" label="Security scan" />}
                  </Stack>
                </TableCell>
                <TableCell>{formatBuildDuration(b)}</TableCell>
                <TableCell>{formatRelativeTime(b.triggeredAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
