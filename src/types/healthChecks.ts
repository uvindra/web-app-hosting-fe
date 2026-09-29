/**
 * Web app health checks (Kubernetes liveness / readiness probes), configured per environment.
 * A web app serves from a single container, so an environment holds at most one liveness and
 * one readiness probe.
 */

export const PROBE_KIND = {
  LIVENESS: 'Liveness',
  READINESS: 'Readiness',
} as const;
export type ProbeKind = (typeof PROBE_KIND)[keyof typeof PROBE_KIND];

export const PROBE_TYPE = {
  HTTP_GET: 'httpGet',
  TCP: 'tcp',
  EXEC: 'exec',
} as const;
export type ProbeType = (typeof PROBE_TYPE)[keyof typeof PROBE_TYPE];

export interface HttpHeader {
  name: string;
  value: string;
}

export interface Probe {
  type: ProbeType;
  failureThreshold: number;
  successThreshold: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
  httpGet?: { path: string; port: number; httpHeaders: HttpHeader[] };
  tcpSocket?: { port: number };
  exec?: { command: string[] };
}

/** An unset probe is `undefined`. */
export interface HealthCheck {
  livenessProbe?: Probe;
  readinessProbe?: Probe;
}
