import type {
  DeploymentHardwareAssignmentTargetType,
} from "./deployment-hardware-assignment-types";

export type DeploymentAssignmentTargetValidationTargetType =
  | DeploymentHardwareAssignmentTargetType
  | string;

export type DeploymentAssignmentTargetValidationStatus =
  | "valid"
  | "invalid";

export type DeploymentAssignmentTargetValidationIssueCode =
  | "missing_target_key"
  | "unexpected_target_key"
  | "unsupported_target_type"
  | "malformed_target_key"
  | "target_missing"
  | "target_cross_clinic_or_legacy"
  | "target_incompatible";

export interface DeploymentAssignmentTargetValidationAssignment {
  clinicId: string;
  deploymentHardwareKey: string;
  deploymentHardwareAssignmentKey: string | null;
  targetType: DeploymentAssignmentTargetValidationTargetType;
  targetDeploymentKey: string | null;
  assignmentStatus: string | null;
  assignmentSource: string | null;
  active: boolean;
}

export interface DeploymentAssignmentTargetValidationWorkstationTarget {
  id: string;
  clinicId: string | null;
  deploymentWorkstationKey: string | null;
  status: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}

export interface DeploymentAssignmentTargetValidationSterilizerTarget {
  id: string;
  clinicId: string | null;
  deploymentSterilizerKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}

export interface DeploymentAssignmentTargetValidationIssue {
  deploymentHardwareKey: string;
  targetType: DeploymentAssignmentTargetValidationTargetType;
  targetDeploymentKey: string | null;
  code: DeploymentAssignmentTargetValidationIssueCode;
  message: string;
}

export interface DeploymentAssignmentTargetValidationCounts {
  requested: number;
  valid: number;
  invalid: number;
  missingTargets: number;
  incompatibleTargets: number;
}

export interface DeploymentAssignmentTargetValidationDownstreamCounts {
  created: 0;
  reused: 0;
  skipped: 0;
  conflicts: 0;
}

export interface DeploymentAssignmentTargetValidationResult {
  ok: boolean;
  status: DeploymentAssignmentTargetValidationStatus;
  counts: DeploymentAssignmentTargetValidationCounts;
  downstream: DeploymentAssignmentTargetValidationDownstreamCounts;
  issues: readonly DeploymentAssignmentTargetValidationIssue[];
  message: string;
}
