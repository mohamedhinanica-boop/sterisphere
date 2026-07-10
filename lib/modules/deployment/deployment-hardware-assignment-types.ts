import type { DeploymentDraft } from "./deployment-draft";
import type {
  DeploymentHardwareCapability,
  DeploymentHardwareType,
} from "./deployment-hardware-types";

export type DeploymentHardwareAssignmentTargetType =
  | "workstation"
  | "sterilizer"
  | "unassigned";

export type DeploymentHardwareAssignmentStatus =
  | "planned"
  | "active"
  | "archived";

export type DeploymentHardwareAssignmentSource = "setup_draft";

export interface DeploymentHardwareAssignmentMetadata {
  hardwareType?: DeploymentHardwareType;
  capabilities?: readonly DeploymentHardwareCapability[];
  [key: string]: unknown;
}

export interface DeploymentHardwareAssignmentRecord {
  id: string;
  clinicId: string | null;
  deploymentHardwareAssignmentKey: string | null;
  deploymentHardwareKey: string | null;
  targetType: DeploymentHardwareAssignmentTargetType;
  targetDeploymentKey: string | null;
  assignmentStatus: DeploymentHardwareAssignmentStatus;
  assignmentSource: DeploymentHardwareAssignmentSource | string | null;
  active: boolean;
  displayOrder: number | null;
  reason: string | null;
  metadata: DeploymentHardwareAssignmentMetadata | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateDeploymentHardwareAssignmentPayload {
  clinicId: string;
  deploymentHardwareAssignmentKey: string;
  deploymentHardwareKey: string;
  targetType: DeploymentHardwareAssignmentTargetType;
  targetDeploymentKey: string | null;
  assignmentStatus: "planned";
  assignmentSource: DeploymentHardwareAssignmentSource;
  active: false;
  displayOrder: number;
  reason: string | null;
  metadata: DeploymentHardwareAssignmentMetadata;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeploymentHardwareAssignmentProvisionCommand {
  clinicId: string;
  draft: DeploymentDraft;
  createdAt: string;
}

export type DeploymentHardwareAssignmentProvisionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected";

export interface DeploymentHardwareAssignmentProvisionCounts {
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
}

export interface DeploymentHardwareAssignmentProvisionResult {
  ok: boolean;
  status: DeploymentHardwareAssignmentProvisionStatus;
  assignments: readonly DeploymentHardwareAssignmentRecord[];
  counts: DeploymentHardwareAssignmentProvisionCounts;
  message: string;
}