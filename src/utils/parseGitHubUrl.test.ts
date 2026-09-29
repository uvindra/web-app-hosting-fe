import { describe, expect, it } from 'vitest';
import { parseGitHubUrl } from './parseGitHubUrl';

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
