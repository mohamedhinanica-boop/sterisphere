import type {
  DeploymentActivationReadinessResult,
  DeploymentActivationReadinessSnapshot,
} from "./deployment-activation-readiness-types";
import type {
  DeploymentPlannedAssignmentResolvedRecord,
} from "./deployment-planned-assignment-resolution-types";

export type DeploymentActivationPlanStatus = "ready" | "blocked" | "error";

export type DeploymentActivationPlanAction =
  | "activate"
  | "link"
  | "bind"
  | "finalize"
  | "no_op";

export type DeploymentActivationPlanItemStatus = "planned";

export type DeploymentActivationPlanIssueSeverity =
  | "blocker"
  | "warning";

export type DeploymentActivationPlanEntityType =
  | "deployment_run"
  | "clinic"
  | "clinic_settings"
  | "provider_shell"
  | "sterilizer_shell"
  | "workstation_shell"
  | "hardware_shell"
  | "hardware_assignment"
  | "hardware_binding"
  | "activation_plan";

export type DeploymentActivationPlanIssueCode =
  | "readiness_not_ready"
  | "readiness_evidence_missing"
  | "deployment_run_missing"
  | "deployment_run_incompatible"
  | "clinic_ownership_mismatch"
  | "entity_missing"
  | "state_drift_detected"
  | "unexpected_active_record"
  | "provisioning_state_incompatible"
  | "assignment_target_changed"
  | "resolved_identity_missing"
  | "hardware_already_bound"
  | "duplicate_activation_identity"
  | "rollback_not_supported";

export interface DeploymentActivationPlanIssue {
  code: DeploymentActivationPlanIssueCode;
  entityType: DeploymentActivationPlanEntityType;
  entityId: string | null;
  deploymentKey: string | null;
  severity: DeploymentActivationPlanIssueSeverity;
  message: string;
}

export interface DeploymentActivationPlanItem {
  planItemKey: string;
  sequence: number;
  entityType: DeploymentActivationPlanEntityType;
  entityId: string | null;
  deploymentKey: string | null;
  clinicId: string;
  action: DeploymentActivationPlanAction;
  currentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  dependencyKeys: readonly string[];
  reversible: boolean;
  rollbackAction: string | null;
  status: DeploymentActivationPlanItemStatus;
  blockers: readonly DeploymentActivationPlanIssue[];
  warnings: readonly DeploymentActivationPlanIssue[];
  metadata?: Record<string, unknown>;
}

export interface DeploymentActivationPlanExpectedEntities {
  providerKeys: readonly string[];
  sterilizerKeys: readonly string[];
  workstationKeys: readonly string[];
  hardwareKeys: readonly string[];
}

export interface DeploymentActivationPlanCommand {
  clinicId: string;
  deploymentRunId: string;
  readiness: DeploymentActivationReadinessResult | null;
  resolvedAssignments: readonly DeploymentPlannedAssignmentResolvedRecord[];
  expected: DeploymentActivationPlanExpectedEntities;
}

export interface DeploymentActivationPlanSnapshot
  extends DeploymentActivationReadinessSnapshot {
  existingActivationPlanKey?: string | null;
}

export interface DeploymentActivationPlanDownstreamCounts {
  requested: 0;
  created: 0;
  reused: 0;
  skipped: 0;
  conflicts: 0;
}

export interface DeploymentActivationPlanResult {
  ok: boolean;
  status: DeploymentActivationPlanStatus;
  planKey: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  itemsRequested: number;
  itemsPlanned: number;
  itemsBlocked: number;
  reversibleItems: number;
  irreversibleItems: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationPlanIssue[];
  planItems: readonly DeploymentActivationPlanItem[];
  downstream: DeploymentActivationPlanDownstreamCounts;
  message: string;
}
