/** Slugifies a display name into a URL-safe handler/identifier (lowercase, hyphen-separated). */
export function toHandler(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}
