export class HttpError extends Error {
  status: number;
  /** BFF error code, e.g. `QUOTA_EXCEEDED`, `NOT_FOUND`, `NOT_SUPPORTED`. */
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/** The plan's quota is reached (PAS entitlement gate → BFF 402 `QUOTA_EXCEEDED`). */
export function isQuotaExceeded(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 402 || err.code === 'QUOTA_EXCEEDED');
}
