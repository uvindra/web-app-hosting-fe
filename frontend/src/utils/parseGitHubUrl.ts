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

// Owner: GitHub user/org names (alphanumerics and single hyphens). Repo: alphanumerics, `-`, `_`, `.`.
const COMPLETE_REPO_URL_RE = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

/**
 * The canonical `https://github.com/<owner>/<repo>` form of a complete public repository URL, or null
 * while the URL is still incomplete (e.g. mid-typing `https://github.com/wso2`), so callers only look
 * up branches for something that can be a real repository.
 */
export function normalizeGitHubRepoUrl(url: string): string | null {
  const match = COMPLETE_REPO_URL_RE.exec(url.trim());
  if (!match) return null;
  const [, owner, repo] = match;
  if (repo === '.' || repo === '..') return null;
  return `https://github.com/${owner}/${repo}`;
}
