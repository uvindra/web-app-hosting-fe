/** What the BFF runs against — drives which features the console shows. */
export interface PlatformMeta {
  target: 'wso2cloud' | 'openchoreo';
  /** GitHub App (private repositories) is available. */
  gitHubApp: boolean;
  /** A billing service exists (quota / upgrade UI). */
  billingEnabled: boolean;
  orgHandle: string;
  namespace: string;
}
