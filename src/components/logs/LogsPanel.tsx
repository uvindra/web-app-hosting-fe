import { Fragment, useState, type JSX, type ReactNode } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { AlertTriangle, RefreshCw, ScrollText } from '@wso2/oxygen-ui-icons-react';

interface LogsPanelProps<T> {
  isLoading: boolean;
  error: unknown;
  items: T[];
  /** Stable key per row, also used to track which rows are expanded. */
  getKey: (item: T) => string;
  renderRow: (item: T, expanded: boolean, toggle: () => void) => ReactNode;
  onRefetch: () => void;
  onClearFilters: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
}

/** The log list: loading, error and empty states, per-row expansion, and "Load more" pagination. */
export default function LogsPanel<T>({ isLoading, error, items, getKey, renderRow, onRefetch, onClearFilters, hasNextPage, isFetchingNextPage, onFetchNextPage }: LogsPanelProps<T>): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return (
      <Stack alignItems="center" gap={1.5} sx={{ py: 8 }}>
        <AlertTriangle size={48} style={{ opacity: 0.35 }} />
        <Typography variant="h3" textAlign="center">
          Couldn&apos;t load logs
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 420 }}>
          The logging service is temporarily unavailable. Please try again in a moment.
        </Typography>
        <Button variant="outlined" size="small" startIcon={<RefreshCw size={14} />} onClick={onRefetch} sx={{ mt: 0.5 }}>
          Retry
        </Button>
      </Stack>
    );
  }

  if (items.length === 0) {
    return (
      <Stack alignItems="center" gap={2} sx={{ py: 8 }}>
        <ScrollText size={48} style={{ opacity: 0.3 }} />
        <Typography variant="h3" textAlign="center">
          No logs found
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ maxWidth: 420 }}>
          No log entries matched your filters for the selected time range. Try widening the time range, clearing filters, or refreshing.
        </Typography>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" size="small" startIcon={<RefreshCw size={14} />} onClick={onRefetch}>
            Refresh
          </Button>
          <Button variant="text" size="small" onClick={onClearFilters}>
            Clear filters
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack sx={{ bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'auto', maxHeight: 'calc(100vh - 300px)', p: 2 }}>
      {items.map((item) => {
        const key = getKey(item);
        return <Fragment key={key}>{renderRow(item, expanded.has(key), () => toggle(key))}</Fragment>;
      })}
      <Stack alignItems="center" sx={{ pt: 1.5 }}>
        {hasNextPage ? (
          <Button variant="outlined" size="small" onClick={onFetchNextPage} disabled={isFetchingNextPage} startIcon={isFetchingNextPage ? <CircularProgress size={14} /> : undefined}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : (
          <Typography variant="body2" color="text.secondary">
            End of logs
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
