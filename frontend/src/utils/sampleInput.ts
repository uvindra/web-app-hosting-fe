import type { CreateWebAppGitInput } from '../types/webApp';
import type { Sample } from '../types/sample';
import { toHandler } from './toHandler';

/**
 * Turns a sample (e.g. `https://github.com/wso2/choreo-samples/tree/main/react-single-page-app`)
 * into a public-Git create input: the repository root URL plus the sample's directory.
 */
export function sampleToInput(sample: Sample): CreateWebAppGitInput {
  const match = /^(https?:\/\/github\.com\/[^/]+\/[^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(\/.*)?)?\/?$/.exec(sample.repoUrl);
  const repository = match ? match[1] : sample.repoUrl;
  const branch = (match && match[2]) || sample.branch || 'main';
  const directory = sample.componentDirectory || (match && match[3]) || '/';
  return {
    sourceType: 'public-git',
    repository,
    branch,
    componentDirectory: directory,
    displayName: sample.name,
    handler: toHandler(sample.name),
    buildPreset: sample.buildPreset,
    buildCommand: sample.buildCommand,
    buildPath: sample.buildPath,
    port: sample.port,
  };
}
