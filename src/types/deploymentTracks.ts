/** A deployment track builds and deploys a web app from one branch of its Git repository; the branch is its identity. */
export interface DeploymentTrack {
  id: string;
  branch: string;
  /** The default (main) track cannot be deleted. */
  isDefault: boolean;
  autoDeploy: boolean;
  /** True when the track currently has an active deployment. */
  deployed: boolean;
  createdAt: string;
}

export interface CreateDeploymentTrackInput {
  /** An existing branch of the web app's repository that has no track yet. */
  branch: string;
}

export interface TrackDeletableResult {
  canDelete: boolean;
  message?: string;
}
