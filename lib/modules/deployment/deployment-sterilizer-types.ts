import type { DeploymentDraft } from "./deployment-draft";

export type DeploymentSterilizerProvisioningSource = "setup_draft";

export type DeploymentSterilizerProvisioningStatus =
  | "planned"
  | "active"
  | "archived";

export interface DeploymentSterilizerShellRecord {
  id: string;
  clinicId: string | null;
  deploymentSterilizerKey: string | null;
  name: string;
  type: string | null;
  active: boolean;
  provisioningSource: DeploymentSterilizerProvisioningSource | string | null;
  provisioningStatus: DeploymentSterilizerProvisioningStatus;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateDeploymentSterilizerShellPayload {
  clinicId: string;
  deploymentSterilizerKey: string;
  name: string;
  type: string;
  active: boolean;
  provisioningSource: DeploymentSterilizerProvisioningSource;
  provisioningStatus: "planned";
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentSterilizerProvisionCommand {
  clinicId: string;
  draft: DeploymentDraft;
  createdAt: string;
}

export type DeploymentSterilizerProvisionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected";

export interface DeploymentSterilizerProvisionCounts {
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
}

export interface DeploymentSterilizerProvisionResult {
  ok: boolean;
  status: DeploymentSterilizerProvisionStatus;
  sterilizers: readonly DeploymentSterilizerShellRecord[];
  counts: DeploymentSterilizerProvisionCounts;
  message: string;
}
