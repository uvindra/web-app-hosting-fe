export interface DeploymentTrack {
  id: string;
  name: string;
  branch: string;
  /** The default (main) track cannot be deleted. */
  isDefault: boolean;
  autoDeploy: boolean;
  /** True when the track currently has an active deployment. */
  deployed: boolean;
  createdAt: string;
}

export interface CreateDeploymentTrackInput {
  name: string;
  branch: string;
}

export interface TrackDeletableResult {
  canDelete: boolean;
  message?: string;
}
