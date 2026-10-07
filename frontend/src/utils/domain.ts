const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Returns an error message for an invalid custom domain, or null when valid. */
export function validateDomain(input: string): string | null {
  const domain = input.trim().toLowerCase();
  if (!domain) return 'Domain is required.';
  if (domain.includes('://') || domain.includes('/')) return 'Enter a bare domain without protocol or path (e.g. app.example.com).';
  if (domain.length > 253) return 'Domain is too long.';
  const labels = domain.split('.');
  if (labels.length < 2) return 'Enter a fully qualified domain (e.g. app.example.com).';
  if (!labels.every((l) => LABEL.test(l))) return 'Domain contains invalid characters or labels.';
  if (/^\d+$/.test(labels[labels.length - 1])) return 'Top-level domain cannot be numeric.';
  return null;
}
