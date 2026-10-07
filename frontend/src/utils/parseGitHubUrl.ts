export interface ParsedGitHubUrl {
  organization: string;
  repository: string;
}

const GITHUB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

/** Parses a public GitHub repo URL (e.g. "https://github.com/org/repo") into org/repo. Returns null if it doesn't match. */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  const match = GITHUB_URL_RE.exec(url.trim());
  if (!match) return null;
  const [, organization, repository] = match;
  return { organization, repository };
}
