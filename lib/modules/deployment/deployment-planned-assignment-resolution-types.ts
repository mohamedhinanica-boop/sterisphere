import type {
  DeploymentHardwareAssignmentTargetType,
} from "./deployment-hardware-assignment-types";

export type DeploymentPlannedAssignmentResolutionTargetType =
  | DeploymentHardwareAssignmentTargetType
  | string;

export type DeploymentPlannedAssignmentResolutionStatus =
  | "resolved"
  | "unresolved";

export type DeploymentPlannedAssignmentResolutionIssueCode =
  | "malformed_hardware_key"
  | "hardware_missing"
  | "hardware_cross_clinic_or_legacy"
  | "hardware_incompatible"
  | "hardware_operationally_bound"
  | "missing_target_key"
  | "unexpected_target_key"
  | "unsupported_target_type"
  | "malformed_target_key"
  | "target_missing"
  | "target_cross_clinic_or_legacy"
  | "target_incompatible";

export interface DeploymentPlannedAssignmentResolutionAssignment {
  clinicId: string;
  deploymentHardwareKey: string;
  assignmentKey: string | null;
  targetType: DeploymentPlannedAssignmentResolutionTargetType;
  targetDeploymentKey: string | null;
}

export interface DeploymentPlannedAssignmentResolutionHardwareShell {
  id: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  status: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
  agentId: string | null;
  defaultWorkstationId: string | null;
  currentWorkstationId: string | null;
}

export interface DeploymentPlannedAssignmentResolutionWorkstationShell {
  id: string;
  clinicId: string | null;
  deploymentWorkstationKey: string | null;
  status: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}

export interface DeploymentPlannedAssignmentResolutionSterilizerShell {
  id: string;
  clinicId: string | null;
  deploymentSterilizerKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}

export interface DeploymentPlannedAssignmentResolutionIssue {
  deploymentHardwareKey: string;
  assignmentKey: string | null;
  targetType: DeploymentPlannedAssignmentResolutionTargetType;
  targetDeploymentKey: string | null;
  code: DeploymentPlannedAssignmentResolutionIssueCode;
  message: string;
}

export interface DeploymentPlannedAssignmentResolvedRecord {
  clinicId: string;
  deploymentHardwareKey: string;
  hardwareId: string | null;
  assignmentKey: string | null;
  targetType: DeploymentPlannedAssignmentResolutionTargetType;
  targetDeploymentKey: string | null;
  targetId: string | null;
  resolutionStatus: DeploymentPlannedAssignmentResolutionStatus;
  issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
}

export interface DeploymentPlannedAssignmentResolutionCounts {
  requested: number;
  resolved: number;
  unresolved: number;
  missingHardware: number;
  missingTargets: number;
  incompatibleHardware: number;
  incompatibleTargets: number;
}

export interface DeploymentPlannedAssignmentResolutionDownstreamCounts {
  requested: 0;
  created: 0;
  reused: 0;
  skipped: 0;
  conflicts: 0;
}

export interface DeploymentPlannedAssignmentResolutionResult {
  ok: boolean;
  status: DeploymentPlannedAssignmentResolutionStatus;
  records: readonly DeploymentPlannedAssignmentResolvedRecord[];
  counts: DeploymentPlannedAssignmentResolutionCounts;
  downstream: DeploymentPlannedAssignmentResolutionDownstreamCounts;
  issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
  message: string;
}
