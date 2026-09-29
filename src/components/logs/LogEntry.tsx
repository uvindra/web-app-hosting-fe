import type { JSX } from 'react';
import { Chip, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronRight, Copy } from '@wso2/oxygen-ui-icons-react';
import type { LogRow } from '../../types/logs';
import { copyLog, formatValue, levelColor, statusCodeColor } from '../../utils/logs';
import { LOG_TEXT_SX, logChipSx } from './LogEntry.styles';

const DETAIL_FIELDS: { key: keyof LogRow; label: string }[] = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'level', label: 'Log Level' },
  { key: 'source', label: 'Source' },
  { key: 'method', label: 'Method' },
  { key: 'path', label: 'Path' },
  { key: 'statusCode', label: 'Status Code' },
  { key: 'durationMs', label: 'Duration (ms)' },
  { key: 'logLine', label: 'Log Entry' },
  { key: 'podName', label: 'Pod' },
  { key: 'containerName', label: 'Container' },
];

interface LogEntryProps {
  log: LogRow;
  expanded: boolean;
  onToggle: () => void;
  envName: string;
}

export default function LogEntry({ log, expanded, onToggle, envName }: LogEntryProps): JSX.Element {
  return (
    <>
      <Stack direction="row" alignItems="center" onClick={onToggle} sx={{ ...LOG_TEXT_SX, px: 0.5, py: 0.25, cursor: 'pointer', borderRadius: 1, minHeight: 32, '&:hover': { bgcolor: 'action.hover' }, '&:hover .log-actions': { visibility: 'visible' } }}>
        <IconButton size="small" aria-label={expanded ? 'Collapse log entry' : 'Expand log entry'} sx={{ p: 0, mr: 0.5 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Typography component="span" sx={{ ...LOG_TEXT_SX, color: 'primary.main', whiteSpace: 'nowrap', mr: 1 }}>
          {new Date(log.timestamp).toLocaleString()}
        </Typography>
        <Tooltip title="Environment">
          <Chip label={envName} size="small" variant="outlined" sx={logChipSx} />
        </Tooltip>
        <Chip label={log.level} size="small" color={levelColor(log.level)} variant="outlined" sx={logChipSx} />
        {log.statusCode !== undefined && <Chip label={log.statusCode} size="small" color={statusCodeColor(log.statusCode)} variant="outlined" sx={logChipSx} />}
        <Typography component="span" sx={{ ...LOG_TEXT_SX, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {log.logLine}
        </Typography>
        <Stack direction="row" className="log-actions" sx={{ visibility: 'hidden', ml: 1, flexShrink: 0 }}>
          <Tooltip title="Copy">
            <IconButton
              size="small"
              aria-label="Copy log entry"
              onClick={(e) => {
                e.stopPropagation();
                copyLog(log);
              }}>
              <Copy size={14} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {expanded && (
        <Stack sx={{ ...LOG_TEXT_SX, pl: 5, pb: 1, bgcolor: 'background.default', borderRadius: 1, mx: 0.5, mb: 0.5 }}>
          {DETAIL_FIELDS.map(({ key, label }) => {
            const val = formatValue(log[key]);
            if (!val) return null;
            return (
              <Stack key={key} direction="row" sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 0.5, gap: 2 }}>
                <Typography component="span" sx={{ ...LOG_TEXT_SX, fontWeight: 600, minWidth: 140, flexShrink: 0 }}>
                  {label}
                </Typography>
                <Typography component="span" sx={{ ...LOG_TEXT_SX, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {key === 'timestamp' ? new Date(val).toLocaleString() : val}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      )}
    </>
  );
}
