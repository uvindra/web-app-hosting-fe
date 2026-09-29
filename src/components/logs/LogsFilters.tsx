import type { JSX } from 'react';
import { Button, Checkbox, FormControlLabel, IconButton, ListItemText, MenuItem, Select, Stack, TextField, Tooltip } from '@wso2/oxygen-ui';
import { Download, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import SearchField from '../SearchField';
import type { LogsFiltersState } from '../../hooks/useLogsFilters';
import type { LogLevel, LogRow } from '../../types/logs';
import { CUSTOM_PRESET, LOG_LEVELS, TIME_PRESETS, downloadLogs } from '../../utils/logs';

interface LogsFiltersProps {
  filters: LogsFiltersState;
  /** Currently loaded logs, for the download button. */
  logs: LogRow[];
  onRefresh: () => void;
}

export default function LogsFilters({ filters, logs, onRefresh }: LogsFiltersProps): JSX.Element {
  const { levelFilter, setLevelFilter, timePreset, setTimePreset, customStart, setCustomStart, customEnd, setCustomEnd, sortDir, setSortDir, searchPhrase, setSearchPhrase, autoFetch, setAutoFetch } = filters;

  return (
    <>
      <Stack direction="row" gap={1.5} sx={{ mb: 1.5 }} flexWrap="wrap" alignItems="center">
        <Select
          multiple
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as LogLevel[])}
          displayEmpty
          renderValue={(selected) => (selected.length === 0 ? 'All Levels' : selected.join(', '))}
          size="small"
          sx={{ minWidth: 130 }}
          inputProps={{ 'aria-label': 'Log level' }}>
          {LOG_LEVELS.map((l) => (
            <MenuItem key={l} value={l}>
              <Checkbox checked={levelFilter.includes(l)} size="small" sx={{ p: 0, mr: 1 }} />
              <ListItemText primary={l} />
            </MenuItem>
          ))}
        </Select>

        <Select value={timePreset} onChange={(e) => setTimePreset(e.target.value)} size="small" sx={{ minWidth: 160 }} inputProps={{ 'aria-label': 'Time range' }}>
          {TIME_PRESETS.map((p) => (
            <MenuItem key={p.label} value={p.label}>
              {p.label}
            </MenuItem>
          ))}
          <MenuItem value={CUSTOM_PRESET}>Custom</MenuItem>
        </Select>

        <Select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')} size="small" sx={{ minWidth: 130 }} inputProps={{ 'aria-label': 'Sort direction' }}>
          <MenuItem value="desc">Newest first</MenuItem>
          <MenuItem value="asc">Oldest first</MenuItem>
        </Select>

        <SearchField value={searchPhrase} onChange={setSearchPhrase} placeholder="Search logs..." sx={{ minWidth: 200, flex: 1 }} />

        <FormControlLabel control={<Checkbox checked={autoFetch} onChange={(_, c) => setAutoFetch(c)} size="small" />} label="Auto Fetch" sx={{ mr: 0, whiteSpace: 'nowrap' }} slotProps={{ typography: { variant: 'body2' } }} />

        <Tooltip title="Download loaded logs">
          <span>
            <IconButton size="small" aria-label="Download logs" onClick={() => downloadLogs(logs)} disabled={logs.length === 0}>
              <Download size={18} />
            </IconButton>
          </span>
        </Tooltip>

        <Button variant="outlined" size="small" onClick={onRefresh} startIcon={<RefreshCw size={14} />}>
          Refresh
        </Button>
      </Stack>

      {timePreset === CUSTOM_PRESET && (
        <Stack direction="row" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
          <TextField type="datetime-local" size="small" label="Start" value={customStart} onChange={(e) => setCustomStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="datetime-local" size="small" label="End" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
      )}
    </>
  );
}
