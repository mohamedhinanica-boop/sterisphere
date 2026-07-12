export type DeploymentActivationReadinessStatus = "ready" | "blocked" | "error";

export type DeploymentActivationReadinessIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationReadinessIssueCode =
  | "deployment_run_missing"
  | "deployment_run_incompatible"
  | "clinic_missing"
  | "clinic_settings_missing"
  | "provider_shell_missing"
  | "sterilizer_shell_missing"
  | "workstation_shell_missing"
  | "hardware_shell_missing"
  | "hardware_shell_bound"
  | "assignment_missing"
  | "assignment_duplicate"
  | "assignment_target_invalid"
  | "assignment_resolution_incomplete"
  | "unexpected_active_record"
  | "provisioning_source_incompatible"
  | "provisioning_status_incompatible";

export type DeploymentActivationReadinessEntityType =
  | "deployment_run"
  | "clinic"
  | "clinic_settings"
  | "provider_shell"
  | "sterilizer_shell"
  | "workstation_shell"
  | "hardware_shell"
  | "hardware_assignment"
  | "assignment_target_validation"
  | "planned_assignment_resolution";

export interface DeploymentActivationReadinessIssue {
  code: DeploymentActivationReadinessIssueCode;
  entityType: DeploymentActivationReadinessEntityType;
  deploymentKey: string | null;
  severity: DeploymentActivationReadinessIssueSeverity;
  message: string;
}

export interface DeploymentActivationReadinessDeploymentRun {
  deploymentRunId: string;
  clinicId: string | null;
  lifecycleState: string | null;
  deploymentStatus: string | null;
}

export interface DeploymentActivationReadinessClinicRoot {
  id: string;
}

export interface DeploymentActivationReadinessClinicSettings {
  id: string;
  clinicId: string | null;
}

export interface DeploymentActivationReadinessProviderShell {
  id: string;
  clinicId: string | null;
  deploymentProviderKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}

export interface DeploymentActivationReadinessSterilizerShell {
  id: string;
  clinicId: string | null;
  deploymentSterilizerKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}

export interface DeploymentActivationReadinessWorkstationShell {
  id: string;
  clinicId: string | null;
  deploymentWorkstationKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
}

export interface DeploymentActivationReadinessHardwareShell {
  id: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean;
  agentId: string | null;
  defaultWorkstationId: string | null;
  currentWorkstationId: string | null;
  status: string | null;
}

export type DeploymentActivationReadinessAssignmentTargetType =
  | "workstation"
  | "sterilizer"
  | "unassigned"
  | string;

export interface DeploymentActivationReadinessHardwareAssignment {
  id: string;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  assignmentKey: string | null;
  targetType: DeploymentActivationReadinessAssignmentTargetType;
  targetDeploymentKey: string | null;
  assignmentSource: string | null;
  assignmentStatus: string | null;
  active: boolean;
}

export interface DeploymentActivationReadinessAssignmentTargetValidationEvidence {
  requested: number;
  valid: number;
  invalid: number;
  missingTargets: number;
  incompatibleTargets: number;
}

export interface DeploymentActivationReadinessPlannedAssignmentResolutionEvidence {
  requested: number;
  resolved: number;
  unresolved: number;
  missingHardware: number;
  missingTargets: number;
  incompatibleHardware: number;
  incompatibleTargets: number;
}

export interface DeploymentActivationReadinessSnapshot {
  deploymentRun: DeploymentActivationReadinessDeploymentRun | null;
  clinic: DeploymentActivationReadinessClinicRoot | null;
  clinicSettings: DeploymentActivationReadinessClinicSettings | null;
  providerShells: readonly DeploymentActivationReadinessProviderShell[];
  sterilizerShells: readonly DeploymentActivationReadinessSterilizerShell[];
  workstationShells: readonly DeploymentActivationReadinessWorkstationShell[];
  hardwareShells: readonly DeploymentActivationReadinessHardwareShell[];
  hardwareAssignments: readonly DeploymentActivationReadinessHardwareAssignment[];
  assignmentTargetValidation: DeploymentActivationReadinessAssignmentTargetValidationEvidence | null;
  plannedAssignmentResolution: DeploymentActivationReadinessPlannedAssignmentResolutionEvidence | null;
  warnings?: readonly DeploymentActivationReadinessIssue[];
}

export interface DeploymentActivationReadinessExpectedPlan {
  providerKeys: readonly string[];
  sterilizerKeys: readonly string[];
  workstationKeys: readonly string[];
  hardwareKeys: readonly string[];
}

export interface DeploymentActivationReadinessAssessmentCommand {
  clinicId: string;
  deploymentRunId: string;
  expected: DeploymentActivationReadinessExpectedPlan;
}

export interface DeploymentActivationReadinessDownstreamCounts {
  requested: 0;
  created: 0;
  reused: 0;
  skipped: 0;
  conflicts: 0;
}

export interface DeploymentActivationReadinessResult {
  ok: boolean;
  status: DeploymentActivationReadinessStatus;
  checksRequested: number;
  checksPassed: number;
  checksFailed: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationReadinessIssue[];
  downstream: DeploymentActivationReadinessDownstreamCounts;
  message: string;
}
