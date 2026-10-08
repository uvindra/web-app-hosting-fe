import { describe, expect, it } from 'vitest';
import { normalizeGitHubRepoUrl, parseGitHubUrl } from './parseGitHubUrl';

describe('parseGitHubUrl', () => {
  it('parses a plain repo URL', () => {
    expect(parseGitHubUrl('https://github.com/wso2/choreo-samples')).toEqual({ organization: 'wso2', repository: 'choreo-samples' });
  });

  it('parses a URL with a trailing .git', () => {
    expect(parseGitHubUrl('https://github.com/wso2/choreo-samples.git')).toEqual({ organization: 'wso2', repository: 'choreo-samples' });
  });

  it('parses a URL with a trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/wso2/choreo-samples/')).toEqual({ organization: 'wso2', repository: 'choreo-samples' });
  });

  it('returns null for a non-GitHub URL', () => {
    expect(parseGitHubUrl('https://gitlab.com/wso2/choreo-samples')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parseGitHubUrl('not a url')).toBeNull();
  });
});

describe('normalizeGitHubRepoUrl', () => {
  it('returns the canonical URL of a complete repository URL', () => {
    expect(normalizeGitHubRepoUrl(' https://github.com/wso2/choreo-samples.git/ ')).toBe('https://github.com/wso2/choreo-samples');
    expect(normalizeGitHubRepoUrl('https://www.github.com/acme/site')).toBe('https://github.com/acme/site');
  });

  it('returns null while the URL is incomplete', () => {
    for (const partial of ['h', 'https://', 'https://github.com', 'https://github.com/', 'https://github.com/wso2', 'https://github.com/wso2/']) {
      expect(normalizeGitHubRepoUrl(partial)).toBeNull();
    }
  });

  it('returns null for non-GitHub, non-https or deeper URLs', () => {
    expect(normalizeGitHubRepoUrl('https://gitlab.com/a/b')).toBeNull();
    expect(normalizeGitHubRepoUrl('http://github.com/a/b')).toBeNull();
    expect(normalizeGitHubRepoUrl('https://github.com/a/b/tree/main')).toBeNull();
    expect(normalizeGitHubRepoUrl('https://github.com/-a/b')).toBeNull();
  });
});
