import type { DeploymentDraft } from "./deployment-draft";

export type DeploymentProviderShellCategory =
  | "dentist"
  | "hygienist"
  | "assistant"
  | "receptionist"
  | "treatment-coordinator"
  | "sterilization-technician"
  | "office-manager";

export type DeploymentProviderProvisioningSource = "setup_draft";

export type DeploymentProviderProvisioningStatus =
  | "placeholder"
  | "active"
  | "archived";

export interface DeploymentProviderShellRecord {
  id: string;
  clinicId: string | null;
  deploymentProviderKey: string | null;
  provisioningSource: DeploymentProviderProvisioningSource | string | null;
  provisioningStatus: DeploymentProviderProvisioningStatus;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  displayName: string | null;
  fullName: string;
  role: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateDeploymentProviderShellPayload {
  clinicId: string;
  deploymentProviderKey: string;
  provisioningSource: DeploymentProviderProvisioningSource;
  provisioningStatus: "placeholder";
  firstName: null;
  lastName: null;
  title: string;
  displayName: string;
  fullName: string;
  role: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentProviderProvisionCommand {
  clinicId: string;
  draft: DeploymentDraft;
  createdAt: string;
}

export type DeploymentProviderProvisionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected";

export interface DeploymentProviderProvisionCounts {
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
}

export interface DeploymentProviderProvisionResult {
  ok: boolean;
  status: DeploymentProviderProvisionStatus;
  providers: readonly DeploymentProviderShellRecord[];
  counts: DeploymentProviderProvisionCounts;
  message: string;
}

