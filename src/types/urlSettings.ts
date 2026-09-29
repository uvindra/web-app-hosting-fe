import type { EnvironmentId } from './webApp';

export type DomainVerificationStatus = 'pending' | 'verified' | 'failed';

export interface EnvironmentDefaultUrl {
  environment: EnvironmentId;
  url: string;
}

export interface CustomDomainMapping {
  id: string;
  environment: EnvironmentId;
  domain: string;
  status: DomainVerificationStatus;
  /** DNS CNAME target the domain must point to. */
  cnameTarget: string;
  createdAt: string;
}

export interface CustomDomainInput {
  environment: EnvironmentId;
  domain: string;
}
