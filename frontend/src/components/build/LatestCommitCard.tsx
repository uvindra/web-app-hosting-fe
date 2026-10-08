import type { JSX } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { GitBranch, Play } from '@wso2/oxygen-ui-icons-react';
import type { LatestCommit } from '../../types/build';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

interface LatestCommitCardProps {
  /** The branch head; undefined while loading or when it couldn't be loaded. */
  commit: LatestCommit | undefined;
  loading: boolean;
  /** Why the latest commit couldn't be loaded (the card still lets you build the branch head). */
  error: unknown;
  onRetry: () => void;
  building: boolean;
  onBuild: () => void;
}

function CommitDetails({ commit, loading, error, onRetry }: Pick<LatestCommitCardProps, 'commit' | 'loading' | 'error' | 'onRetry'>): JSX.Element {
  if (loading) {
    return <CircularProgress size={20} aria-label="Loading latest commit" />;
  }
  if (!commit) {
    const reason = error instanceof Error && error.message ? ` ${error.message}` : '';
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }>
        Couldn&apos;t load the latest commit.{reason} You can still build the branch head.
      </Alert>
    );
  }
  return (
    <>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
        <Chip size="small" variant="outlined" icon={<GitBranch size={14} />} label={commit.branch} />
        <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {commit.repoUrl}
        </Typography>
      </Stack>
      <Typography variant="body1">{commit.message}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        <Box component="span" sx={{ fontFamily: 'monospace' }}>
          {commit.sha}
        </Box>
        {' · '}
        {commit.author}
        {' · '}
        {formatRelativeTime(commit.committedAt)}
      </Typography>
    </>
  );
}

/** The track's branch head + "Build Latest". Degrades on its own when the commit can't be read (e.g. GitHub rate limit). */
export default function LatestCommitCard({ commit, loading, error, onRetry, building, onBuild }: LatestCommitCardProps): JSX.Element {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
            Latest Commit
          </Typography>
          <CommitDetails commit={commit} loading={loading} error={error} onRetry={onRetry} />
        </Box>
        <Button variant="contained" disabled={building || loading} startIcon={building ? <CircularProgress size={16} color="inherit" /> : <Play size={16} />} onClick={onBuild}>
          Build Latest
        </Button>
      </Stack>
    </Box>
  );
}
