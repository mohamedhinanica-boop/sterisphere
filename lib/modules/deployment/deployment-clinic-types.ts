import type { DeploymentDraft } from "./deployment-draft";
import type { DeploymentRunMetadata, DeploymentRunRecord } from "./deployment-run-types";

export type DeploymentClinicStatus =
  | "draft"
  | "deploying"
  | "deployed"
  | "failed"
  | "archived";

export interface DeploymentClinicRecord {
  id: string;
  name: string;
  legalName: string | null;
  clinicCode: string;
  country: string;
  provinceState: string;
  timezone: string;
  primaryLanguage: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  deploymentStatus: DeploymentClinicStatus;
  deployedAt: string | null;
  deploymentVersion: string | null;
  schemaVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeploymentClinicPayload {
  name: string;
  legalName: string | null;
  clinicCode: string;
  country: string;
  provinceState: string;
  timezone: string;
  primaryLanguage: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  deploymentStatus: "draft";
  deploymentVersion?: string;
  schemaVersion?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentClinicCreateCommand {
  deploymentRunId: string;
  draft: DeploymentDraft;
  createdAt: string;
  deploymentVersion?: string;
  schemaVersion?: string;
}

export type DeploymentClinicCreateResultStatus =
  | "created"
  | "reused"
  | "conflict"
  | "rejected";

export interface DeploymentClinicCreateResult {
  ok: boolean;
  status: DeploymentClinicCreateResultStatus;
  clinic: DeploymentClinicRecord | null;
  deploymentRun: DeploymentRunRecord | null;
  message: string;
}

export interface DeploymentClinicLinkCommand {
  deploymentRunId: string;
  clinicId: string;
  updatedAt: string;
  metadata?: DeploymentRunMetadata;
}

export type DeploymentClinicLinkResultStatus =
  | "linked"
  | "reused"
  | "conflict"
  | "rejected";

export interface DeploymentClinicLinkResult {
  ok: boolean;
  status: DeploymentClinicLinkResultStatus;
  clinic: DeploymentClinicRecord | null;
  deploymentRun: DeploymentRunRecord | null;
  message: string;
}

export type DeploymentClinicRootResultStatus =
  | DeploymentClinicCreateResultStatus
  | DeploymentClinicLinkResultStatus;

export interface DeploymentClinicRootResult {
  ok: boolean;
  status: DeploymentClinicRootResultStatus;
  clinic: DeploymentClinicRecord | null;
  deploymentRun: DeploymentRunRecord | null;
  createResult: DeploymentClinicCreateResult;
  linkResult: DeploymentClinicLinkResult | null;
  message: string;
}
