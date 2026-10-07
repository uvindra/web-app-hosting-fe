import { useMemo, useState } from 'react';
import type { LogLevel } from '../types/logs';
import { CUSTOM_PRESET, DEFAULT_PRESET, resolveTimeWindow, toLocalInput } from '../utils/logs';

export interface LogsFiltersState {
  levelFilter: LogLevel[];
  setLevelFilter: (v: LogLevel[]) => void;
  timePreset: string;
  setTimePreset: (v: string) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  searchPhrase: string;
  setSearchPhrase: (v: string) => void;
  sortDir: 'asc' | 'desc';
  setSortDir: (v: 'asc' | 'desc') => void;
  autoFetch: boolean;
  setAutoFetch: (v: boolean) => void;
  startTime: string;
  endTime: string;
  /** Re-anchors relative presets to the current time, which refetches the logs. */
  refresh: () => void;
  clearFilters: () => void;
}

export function useLogsFilters(): LogsFiltersState {
  const [levelFilter, setLevelFilter] = useState<LogLevel[]>([]);
  const [timePreset, setTimePreset] = useState(DEFAULT_PRESET);
  const [customStart, setCustomStart] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(new Date()));
  const [searchPhrase, setSearchPhrase] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [autoFetch, setAutoFetch] = useState(false);
  const [anchor, setAnchor] = useState(() => Date.now());

  const { startTime, endTime } = useMemo(() => resolveTimeWindow({ preset: timePreset, customStart, customEnd, now: anchor }), [timePreset, customStart, customEnd, anchor]);

  const refresh = (): void => setAnchor(Date.now());
  const clearFilters = (): void => {
    setLevelFilter([]);
    setSearchPhrase('');
    setTimePreset(DEFAULT_PRESET);
    setAnchor(Date.now());
  };

  const changePreset = (preset: string): void => {
    setTimePreset(preset);
    if (preset === CUSTOM_PRESET) {
      setCustomEnd(toLocalInput(new Date()));
      setCustomStart(toLocalInput(new Date(Date.now() - 24 * 3600_000)));
    }
    setAnchor(Date.now());
  };

  return { levelFilter, setLevelFilter, timePreset, setTimePreset: changePreset, customStart, setCustomStart, customEnd, setCustomEnd, searchPhrase, setSearchPhrase, sortDir, setSortDir, autoFetch, setAutoFetch, startTime, endTime, refresh, clearFilters };
}
