import { webAppHostingClient } from './httpClient';

export interface GitHubInstallation {
  installationId: number;
  githubAccount?: string;
}

export interface GitHubRepository {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
}

/** Exchanges the GitHub App OAuth `code` for the org's installations (git-app-service via the BFF). 409 = authorized but not installed. */
export async function bindGitHubInstallations(code: string): Promise<GitHubInstallation[]> {
  const res = await webAppHostingClient.post<{ items: GitHubInstallation[] }>('/git/github/installations', { code });
  return res.items ?? [];
}

export async function fetchGitHubInstallations(): Promise<GitHubInstallation[]> {
  const res = await webAppHostingClient.get<{ items: GitHubInstallation[] }>('/git/github/installations');
  return res.items ?? [];
}

export async function fetchGitHubRepos(installationId: number): Promise<GitHubRepository[]> {
  const res = await webAppHostingClient.get<{ items: GitHubRepository[] }>(`/git/github/repos?${new URLSearchParams({ installationId: String(installationId) })}`);
  return res.items ?? [];
}

/** Branches of a repository: a public GitHub URL, or an installation's owner/repo. */
export async function fetchBranches(query: { repoUrl?: string; installationId?: number; owner?: string; repo?: string }): Promise<string[]> {
  const params = new URLSearchParams();
  if (query.repoUrl) params.set('repoUrl', query.repoUrl);
  if (query.installationId) params.set('installationId', String(query.installationId));
  if (query.owner) params.set('owner', query.owner);
  if (query.repo) params.set('repo', query.repo);
  return webAppHostingClient.get<string[]>(`/git/branches?${params}`);
}
