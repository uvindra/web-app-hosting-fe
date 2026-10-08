import { PROBE_TYPE, type HttpHeader, type Probe, type ProbeType } from '../../types/healthChecks';

// Slider presets: the slider snaps to these stops.
export const THRESHOLD_MARKS = [1, 3, 5, 7, 10];
export const TIMING_MARKS = [5, 10, 15, 30, 60, 120, 180, 240, 300];
export const TIMEOUT_MARKS = [1, 5, 10, 15, 30, 60];

export const FAILURE = { min: 1, max: 10, marks: THRESHOLD_MARKS };
export const SUCCESS = { min: 1, max: 10, marks: THRESHOLD_MARKS };
export const INITIAL_DELAY = { min: TIMING_MARKS[0], max: 300, marks: TIMING_MARKS };
export const FREQUENCY = { min: TIMING_MARKS[2], max: 300, marks: TIMING_MARKS };
export const TIMEOUT = { min: TIMEOUT_MARKS[0], max: 60, marks: TIMEOUT_MARKS };

/** Web apps are served by a single container listening on 8080 by default. */
export const DEFAULT_PORT = 8080;

export const REQUIRED_ERROR = 'This field is required';

export function validatePort(val: string): string | undefined {
  const v = val.trim();
  if (!v) return REQUIRED_ERROR;
  if (!/^[0-9]+$/.test(v) || v.length > 5 || Number(v) < 1 || Number(v) > 65535) return 'Invalid port number';
  return undefined;
}

export function validatePath(val: string): string | undefined {
  if (!val) return REQUIRED_ERROR;
  if (!val.startsWith('/')) return 'Path must start with /';
  return undefined;
}

export function probeTypeLabel(type: ProbeType): string {
  switch (type) {
    case PROBE_TYPE.HTTP_GET:
      return 'HTTP GET Request';
    case PROBE_TYPE.TCP:
      return 'TCP Socket';
    case PROBE_TYPE.EXEC:
      return 'Execute a Command';
  }
}

export interface ProbeFormState {
  type: ProbeType;
  /** Shared by the HTTP GET and TCP probes. */
  port: string;
  path: string;
  httpHeaders: HttpHeader[];
  command: string[];
  failureThreshold: number;
  successThreshold: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
}

/** A new probe's form; `port` defaults to the web app's port. */
export function defaultProbeForm(port: number = DEFAULT_PORT): ProbeFormState {
  return {
    type: PROBE_TYPE.HTTP_GET,
    port: String(port),
    path: '/',
    httpHeaders: [],
    command: [],
    failureThreshold: 3,
    successThreshold: 1,
    initialDelaySeconds: 10,
    periodSeconds: 30,
    timeoutSeconds: 10,
  };
}

export function probeToForm(p: Probe): ProbeFormState {
  const d = defaultProbeForm();
  const port = p.httpGet?.port ?? p.tcpSocket?.port;
  return {
    type: p.type,
    port: port !== undefined ? String(port) : d.port,
    path: p.httpGet?.path ?? d.path,
    httpHeaders: p.httpGet?.httpHeaders ?? [],
    command: p.exec?.command ?? [],
    failureThreshold: p.failureThreshold,
    successThreshold: p.successThreshold,
    initialDelaySeconds: p.initialDelaySeconds,
    periodSeconds: p.periodSeconds,
    timeoutSeconds: p.timeoutSeconds,
  };
}

/** Build the probe from form state, keeping only the sub-object relevant to the selected type. */
export function formToProbe(form: ProbeFormState): Probe {
  const base = {
    type: form.type,
    failureThreshold: form.failureThreshold,
    successThreshold: form.successThreshold,
    initialDelaySeconds: form.initialDelaySeconds,
    periodSeconds: form.periodSeconds,
    timeoutSeconds: form.timeoutSeconds,
  };
  switch (form.type) {
    case PROBE_TYPE.HTTP_GET:
      return { ...base, httpGet: { path: form.path, port: Number(form.port), httpHeaders: form.httpHeaders } };
    case PROBE_TYPE.TCP:
      return { ...base, tcpSocket: { port: Number(form.port) } };
    case PROBE_TYPE.EXEC:
      return { ...base, exec: { command: form.command.filter((c) => c.trim() !== '') } };
  }
}

export function isProbeFormValid(form: ProbeFormState): boolean {
  switch (form.type) {
    case PROBE_TYPE.HTTP_GET:
      return !validatePort(form.port) && !validatePath(form.path) && form.httpHeaders.every((h) => h.name.trim() !== '' && h.value.trim() !== '');
    case PROBE_TYPE.TCP:
      return !validatePort(form.port);
    case PROBE_TYPE.EXEC:
      return form.command.some((c) => c.trim() !== '');
  }
}
