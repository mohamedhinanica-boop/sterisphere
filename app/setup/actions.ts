"use server";

import { createClient } from "@supabase/supabase-js";
import {
  buildDeploymentAuditEvidenceEnvelope,
} from "@/lib/modules/deployment/deployment-audit-evidence";
import {
  hashDeploymentDraftInput,
  type DeploymentDraft,
} from "@/lib/modules/deployment/deployment-draft";
import { validateDeploymentDraft } from "@/lib/modules/deployment/deployment-draft-validation";
import { simulateDeployment } from "@/lib/modules/deployment/deployment-engine";
import {
  createClinicRootForServerDeploymentRun,
} from "@/lib/modules/deployment/deployment-clinic-server";
import {
  provisionClinicSettingsForServerDeployment,
} from "@/lib/modules/deployment/deployment-clinic-settings-server";
import {
  provisionProviderShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-provider-server";
import {
  createOrReuseServerDeploymentRun,
} from "@/lib/modules/deployment/deployment-run-server";
import {
  provisionSterilizerShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-sterilizer-server";
import {
  provisionWorkstationShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-workstation-server";
import {
  provisionHardwareShellsForServerDeployment,
} from "@/lib/modules/deployment/deployment-hardware-server";
import {
  provisionHardwareAssignmentsForServerDeployment,
} from "@/lib/modules/deployment/deployment-hardware-assignment-server";
import {
  validateAssignmentTargetsForServerDeployment,
} from "@/lib/modules/deployment/deployment-assignment-target-validation-server";
import {
  resolvePlannedAssignmentsForServerDeployment,
} from "@/lib/modules/deployment/deployment-planned-assignment-resolution-server";
import {
  assessActivationReadinessForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-readiness-server";
import {
  buildActivationPlanForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-plan-server";
import {
  prepareActivationExecutionForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-server";
import {
  persistActivationExecutionForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-persistence-server";
import {
  claimActivationExecutionForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-claim-server";
import {
  startActivationExecutionForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-start-server";
import type {
  DeploymentAssignmentTargetValidationIssue,
} from "@/lib/modules/deployment/deployment-assignment-target-validation-types";
import type {
  DeploymentActivationReadinessIssue,
} from "@/lib/modules/deployment/deployment-activation-readiness-types";
import type {
  DeploymentActivationPlanIssue,
  DeploymentActivationPlanItem,
} from "@/lib/modules/deployment/deployment-activation-plan-types";
import type {
  DeploymentActivationExecutionIssue,
  DeploymentActivationExecutionItem,
  DeploymentActivationExecutionRollbackBoundary,
} from "@/lib/modules/deployment/deployment-activation-execution-types";
import type {
  DeploymentActivationExecutionPersistenceIssue,
} from "@/lib/modules/deployment/deployment-activation-execution-persistence-types";
import type {
  DeploymentActivationExecutionClaimIssue,
} from "@/lib/modules/deployment/deployment-activation-execution-claim-types";
import type {
  DeploymentActivationExecutionStartIssue,
} from "@/lib/modules/deployment/deployment-activation-execution-start-types";
import type {
  DeploymentPlannedAssignmentResolutionIssue,
  DeploymentPlannedAssignmentResolvedRecord,
} from "@/lib/modules/deployment/deployment-planned-assignment-resolution-types";

export type PersistDeploymentRunActionStatus =
  | "created"
  | "reused"
  | "conflict"
  | "rejected"
  | "error";

export type ClinicRootActionStatus =
  | "created"
  | "linked"
  | "reused"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface ClinicRootActionResult {
  ok: boolean;
  status: ClinicRootActionStatus;
  clinicId: string | null;
  message: string;
}

export type ClinicSettingsActionStatus =
  | "created"
  | "reused"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface ClinicSettingsActionResult {
  ok: boolean;
  status: ClinicSettingsActionStatus;
  settingsId: string | null;
  clinicId: string | null;
  message: string;
}

export type ProviderShellsActionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface ProviderShellsActionResult {
  ok: boolean;
  status: ProviderShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type SterilizerShellsActionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "rejected"
  | "error"
  | "skipped";

export interface SterilizerShellsActionResult {
  ok: boolean;
  status: SterilizerShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type WorkstationShellsActionStatus = SterilizerShellsActionStatus;

export interface WorkstationShellsActionResult {
  ok: boolean;
  status: WorkstationShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type HardwareShellsActionStatus = SterilizerShellsActionStatus;

export interface HardwareShellsActionResult {
  ok: boolean;
  status: HardwareShellsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type AssignmentTargetValidationActionStatus =
  | "valid"
  | "invalid"
  | "error"
  | "skipped";

export interface AssignmentTargetValidationActionResult {
  ok: boolean;
  status: AssignmentTargetValidationActionStatus;
  clinicId: string | null;
  requested: number;
  valid: number;
  invalid: number;
  missingTargets: number;
  incompatibleTargets: number;
  issues: readonly DeploymentAssignmentTargetValidationIssue[];
  downstream: {
    requested: 0;
    created: 0;
    reused: 0;
    skipped: 0;
    conflicts: 0;
  };
  message: string;
}
export type HardwareAssignmentsActionStatus = SterilizerShellsActionStatus;

export interface HardwareAssignmentsActionResult {
  ok: boolean;
  status: HardwareAssignmentsActionStatus;
  clinicId: string | null;
  requested: number;
  created: number;
  reused: number;
  skipped: number;
  conflicts: number;
  message: string;
}

export type PlannedAssignmentResolutionActionStatus =
  | "resolved"
  | "unresolved"
  | "error"
  | "skipped";

export interface PlannedAssignmentResolutionActionResult {
  ok: boolean;
  status: PlannedAssignmentResolutionActionStatus;
  clinicId: string | null;
  requested: number;
  resolved: number;
  unresolved: number;
  missingHardware: number;
  missingTargets: number;
  incompatibleHardware: number;
  incompatibleTargets: number;
  records: readonly DeploymentPlannedAssignmentResolvedRecord[];
  issues: readonly DeploymentPlannedAssignmentResolutionIssue[];
  downstream: {
    requested: 0;
    created: 0;
    reused: 0;
    skipped: 0;
    conflicts: 0;
  };
  message: string;
}

export type DeploymentActivationReadinessActionStatus =
  | "ready"
  | "blocked"
  | "error"
  | "skipped";

export interface DeploymentActivationReadinessActionResult {
  ok: boolean;
  status: DeploymentActivationReadinessActionStatus;
  clinicId: string | null;
  deploymentRunId: string | null;
  checksRequested: number;
  checksPassed: number;
  checksFailed: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationReadinessIssue[];
  downstream: {
    requested: 0;
    created: 0;
    reused: 0;
    skipped: 0;
    conflicts: 0;
  };
  message: string;
}
export type DeploymentActivationPlanActionStatus =
  | "ready"
  | "blocked"
  | "error"
  | "skipped";

export interface DeploymentActivationPlanActionResult {
  ok: boolean;
  status: DeploymentActivationPlanActionStatus;
  clinicId: string | null;
  deploymentRunId: string | null;
  planKey: string | null;
  itemsRequested: number;
  itemsPlanned: number;
  itemsBlocked: number;
  reversibleItems: number;
  irreversibleItems: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationPlanIssue[];
  planItems: readonly DeploymentActivationPlanItem[];
  downstream: {
    requested: 0;
    created: 0;
    reused: 0;
    skipped: 0;
    conflicts: 0;
  };
  message: string;
}


export type DeploymentActivationExecutionActionStatus =
  | "ready"
  | "blocked"
  | "error"
  | "skipped";

export interface DeploymentActivationExecutionActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionActionStatus;
  executionKey: string | null;
  planKey: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  itemsRequested: number;
  itemsReady: number;
  itemsBlocked: number;
  itemsPending: number;
  reversibleItems: number;
  irreversibleItems: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionIssue[];
  executionItems: readonly DeploymentActivationExecutionItem[];
  rollbackBoundary: DeploymentActivationExecutionRollbackBoundary;
  downstream: {
    requested: 0;
    created: 0;
    reused: 0;
    skipped: 0;
    conflicts: 0;
  };
  message: string;
}
export type DeploymentActivationExecutionPersistenceActionStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "blocked"
  | "error"
  | "not_attempted";

export interface DeploymentActivationExecutionPersistenceActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionPersistenceActionStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  sessionCreated: 0 | 1;
  sessionReused: 0 | 1;
  itemsRequested: number;
  itemsCreated: number;
  itemsReused: number;
  itemsConflicted: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionPersistenceIssue[];
  downstream: {
    itemsClaimed: 0;
    itemsStarted: 0;
    itemsSucceeded: 0;
    itemsFailed: 0;
    itemsRolledBack: 0;
    sessionsCompleted: 0;
    sessionsFailed: 0;
    bindingsWritten: 0;
    entitiesActivated: 0;
    deploymentRunsFinalized: 0;
  };
  message: string;
}

export type DeploymentActivationExecutionClaimActionStatus =
  | "claimed"
  | "already_owned"
  | "reclaimed"
  | "blocked"
  | "conflict"
  | "error"
  | "not_attempted";

export interface DeploymentActivationExecutionClaimActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionClaimActionStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  claimantId: string | null;
  persistedOwnerId: string | null;
  leaseExpiresAt: string | null;
  claimMode: "fresh" | "same_owner" | "expired_reclaim" | null;
  ownershipResult:
    | "claimed"
    | "already_owned"
    | "reclaimed"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  sessionClaimed: 0 | 1;
  sessionReused: 0 | 1;
  sessionReclaimed: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionClaimIssue[];
  downstream: {
    sessionsClaimed: 0;
    sessionsStarted: 0;
    itemsClaimed: 0;
    itemsStarted: 0;
    itemsSucceeded: 0;
    itemsFailed: 0;
    itemsRolledBack: 0;
    entitiesActivated: 0;
    bindingsWritten: 0;
    deploymentRunsFinalized: 0;
  };
  message: string;
}
export type DeploymentActivationExecutionStartActionStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "error"
  | "not_attempted";

export interface DeploymentActivationExecutionStartActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionStartActionStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  claimantId: string | null;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  startResult:
    | "started"
    | "already_started"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  startedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionStartIssue[];
  downstream: {
    sessionsStarted: 0;
    itemsStarted: 0;
    itemsSucceeded: 0;
    itemsFailed: 0;
    itemsRolledBack: 0;
    entitiesActivated: 0;
    bindingsWritten: 0;
    deploymentRunsFinalized: 0;
    rollbacksExecuted: 0;
  };
  message: string;
}
export interface PersistDeploymentRunActionResult {
  ok: boolean;
  status: PersistDeploymentRunActionStatus;
  deploymentRunId: string | null;
  deploymentSessionId: string | null;
  idempotencyKey: string | null;
  payloadHash: string | null;
  clinicRoot: ClinicRootActionResult;
  clinicSettings: ClinicSettingsActionResult;
  providerShells: ProviderShellsActionResult;
  sterilizerShells: SterilizerShellsActionResult;
  workstationShells: WorkstationShellsActionResult;
  hardwareShells: HardwareShellsActionResult;
  assignmentTargetValidation: AssignmentTargetValidationActionResult;
  hardwareAssignments: HardwareAssignmentsActionResult;
  plannedAssignmentResolution: PlannedAssignmentResolutionActionResult;
  deploymentActivationReadiness: DeploymentActivationReadinessActionResult;
  deploymentActivationPlan: DeploymentActivationPlanActionResult;
  deploymentActivationExecution: DeploymentActivationExecutionActionResult;
  deploymentActivationExecutionPersistence: DeploymentActivationExecutionPersistenceActionResult;
  deploymentActivationExecutionClaim: DeploymentActivationExecutionClaimActionResult;
  deploymentActivationExecutionStart: DeploymentActivationExecutionStartActionResult;
  message: string;
}

const DEPLOYMENT_VERSION = "rc8-controlled-activation-plan";
const SCHEMA_VERSION = "deployment-run-clinic-root-settings-providers-sterilizers-workstations-hardware-assignment-validation-resolution-readiness-activation-plan";
const EVIDENCE_VERSION = "deployment-audit-evidence-rc8-slice1c";
const CLINIC_ROOT_NOT_ATTEMPTED: ClinicRootActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  message: "Clinic root persistence was not attempted.",
};
const CLINIC_SETTINGS_NOT_ATTEMPTED: ClinicSettingsActionResult = {
  ok: false,
  status: "skipped",
  settingsId: null,
  clinicId: null,
  message: "Clinic settings provisioning was not attempted.",
};
const PROVIDER_SHELLS_NOT_ATTEMPTED: ProviderShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Provider shell provisioning was not attempted.",
};
const STERILIZER_SHELLS_NOT_ATTEMPTED: SterilizerShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Sterilizer shell provisioning was not attempted.",
};
const WORKSTATION_SHELLS_NOT_ATTEMPTED: WorkstationShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Workstation shell provisioning was not attempted.",
};
const HARDWARE_SHELLS_NOT_ATTEMPTED: HardwareShellsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Hardware shell provisioning was not attempted.",
};
const ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED: AssignmentTargetValidationActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  valid: 0,
  invalid: 0,
  missingTargets: 0,
  incompatibleTargets: 0,
  issues: [],
  downstream: {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  },  message: "Assignment target validation was not attempted.",
};
const HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED: HardwareAssignmentsActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  created: 0,
  reused: 0,
  skipped: 0,
  conflicts: 0,
  message: "Hardware assignment provisioning was not attempted.",
};
const PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED: PlannedAssignmentResolutionActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  requested: 0,
  resolved: 0,
  unresolved: 0,
  missingHardware: 0,
  missingTargets: 0,
  incompatibleHardware: 0,
  incompatibleTargets: 0,
  records: [],
  issues: [],
  downstream: {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  },
  message: "Planned assignment resolution was not attempted.",
};

const DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED: DeploymentActivationReadinessActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  deploymentRunId: null,
  checksRequested: 0,
  checksPassed: 0,
  checksFailed: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  },
  message: "Deployment activation readiness was not attempted.",
};
const DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED: DeploymentActivationPlanActionResult = {
  ok: false,
  status: "skipped",
  clinicId: null,
  deploymentRunId: null,
  planKey: null,
  itemsRequested: 0,
  itemsPlanned: 0,
  itemsBlocked: 0,
  reversibleItems: 0,
  irreversibleItems: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  planItems: [],
  downstream: {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  },
  message: "Controlled activation planning was not attempted.",
};

const DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED: DeploymentActivationExecutionActionResult = {
  ok: false,
  status: "skipped",
  executionKey: null,
  planKey: null,
  clinicId: null,
  deploymentRunId: null,
  itemsRequested: 0,
  itemsReady: 0,
  itemsBlocked: 0,
  itemsPending: 0,
  reversibleItems: 0,
  irreversibleItems: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  executionItems: [],
  rollbackBoundary: {
    lastReversibleSequence: null,
    firstIrreversibleSequence: null,
    rollbackSupportedItemKeys: [],
    rollbackUnsupportedItemKeys: [],
    wouldCrossIrreversibleBoundary: false,
  },
  downstream: {
    requested: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    conflicts: 0,
  },
  message: "Activation execution preparation was not attempted.",
};
const DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED: DeploymentActivationExecutionPersistenceActionResult = {
  ok: false,
  status: "not_attempted",
  sessionId: null,
  executionKey: null,
  planKey: null,
  sessionCreated: 0,
  sessionReused: 0,
  itemsRequested: 0,
  itemsCreated: 0,
  itemsReused: 0,
  itemsConflicted: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    itemsClaimed: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    itemsRolledBack: 0,
    sessionsCompleted: 0,
    sessionsFailed: 0,
    bindingsWritten: 0,
    entitiesActivated: 0,
    deploymentRunsFinalized: 0,
  },
  message: "Activation execution persistence was not attempted.",
};

const DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED: DeploymentActivationExecutionClaimActionResult = {
  ok: false,
  status: "not_attempted",
  sessionId: null,
  executionKey: null,
  planKey: null,
  claimantId: null,
  persistedOwnerId: null,
  leaseExpiresAt: null,
  claimMode: null,
  ownershipResult: null,
  sessionClaimed: 0,
  sessionReused: 0,
  sessionReclaimed: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    sessionsClaimed: 0,
    sessionsStarted: 0,
    itemsClaimed: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    itemsRolledBack: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    deploymentRunsFinalized: 0,
  },
  message: "Activation execution claim was not attempted.",
};
const DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED: DeploymentActivationExecutionStartActionResult = {
  ok: false,
  status: "not_attempted",
  sessionId: null,
  executionKey: null,
  planKey: null,
  claimantId: null,
  startedAt: null,
  leaseExpiresAt: null,
  startResult: null,
  startedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    sessionsStarted: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    itemsRolledBack: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    deploymentRunsFinalized: 0,
    rollbacksExecuted: 0,
  },
  message: "Activation execution start was not attempted.",
};
export async function persistDeploymentRunAction(
  draft: DeploymentDraft,
  deploymentSessionId: string,
): Promise<PersistDeploymentRunActionResult> {
  const validation = validateDeploymentDraft(draft);
  const normalizedDeploymentSessionId = normalizeDeploymentSessionId(
    deploymentSessionId,
  );

  if (!validation.valid) {
    return {
      ok: false,
      status: "rejected",
      deploymentRunId: null,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey: null,
      payloadHash: null,
      clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
      clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
      providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
      sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
      workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
      hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
      assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
      hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
      plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
      deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
      deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
      message:
        "Deployment run was not persisted because the reviewed draft is incomplete.",
    };
  }

  if (!normalizedDeploymentSessionId) {
    return {
      ok: false,
      status: "rejected",
      deploymentRunId: null,
      deploymentSessionId: null,
      idempotencyKey: null,
      payloadHash: null,
      clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
      clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
      providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
      sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
      workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
      hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
      assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
      hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
      plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
      deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
      deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
      message:
        "Deployment run was not persisted because the setup session identity is missing.",
    };
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      status: "error",
      deploymentRunId: null,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey: null,
      payloadHash: null,
      clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
      clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
      providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
      sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
      workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
      hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
      assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
      hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
      plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
      deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
      deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
      message:
        "Deployment run persistence is not configured on the server.",
    };
  }

  const persistedAt = new Date().toISOString();
  const payloadHash = hashDeploymentDraftInput(draft);
  const deploymentKey = normalizedDeploymentSessionId;
  const idempotencyKey = `setup-deployment-session:${deploymentKey}`;
  const deploymentRunId = `deployment-run-${deploymentKey}`;
  const simulation = simulateDeployment(draft, {
    repositoryContext: {
      deploymentRunId,
      idempotencyKey,
      timestamp: persistedAt,
      deploymentVersion: DEPLOYMENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    },
  });
  const auditEvidence = normalizeAuditEvidence(
    buildDeploymentAuditEvidenceEnvelope({
      draft,
      execution: simulation,
      generatedAt: persistedAt,
      evidenceVersion: EVIDENCE_VERSION,
    }),
    {
      deploymentRunId,
      payloadHash,
    },
  );
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const result = await createOrReuseServerDeploymentRun(client, {
      deploymentRunId,
      clinicId: null,
      idempotencyKey,
      payloadHash,
      draft,
      auditEvidence,
      lifecycleSummary: simulation.lifecycleSummary ?? null,
      createdAt: persistedAt,
      deploymentVersion: DEPLOYMENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      evidenceVersion: EVIDENCE_VERSION,
      metadata: {
        source: "setup_wizard_complete",
        runtimeSlice: "rc8-slice1c",
        boundary: "deployment_run_clinic_root_settings_provider_sterilizer_workstation_hardware_shells_assignment_target_validation_assignments_resolution_readiness_and_activation_plan",
        clinicRootPersistence: "enabled",
        clinicSettingsProvisioning: "enabled",
        providerShellProvisioning: "enabled",
        sterilizerShellProvisioning: "enabled",
        workstationShellProvisioning: "enabled",
        hardwareShellProvisioning: "enabled",
        assignmentTargetValidation: "enabled",
        hardwareAssignmentProvisioning: "enabled",
        plannedAssignmentResolution: "enabled",
        deploymentActivationReadiness: "enabled",
        controlledActivationPlan: "enabled",
        clinicConfigurationSimulated: true,
        deploymentSessionId: normalizedDeploymentSessionId,
        clinicCode: draft.clinicProfile.clinicCode || null,
      },
    });

    if (result.status === "conflict") {
      return {
        ok: false,
        status: "conflict",
        deploymentRunId: result.deploymentRun?.deploymentRunId ?? null,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "This deployment session already has a run for a different reviewed draft. No clinic data was created.",
      };
    }

    if (!result.ok || !result.deploymentRun) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun?.deploymentRunId ?? null,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: CLINIC_ROOT_NOT_ATTEMPTED,
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message: result.message,
      };
    }

    const clinicRoot = await createClinicRootForServerDeploymentRun(client, {
      deploymentRunId: result.deploymentRun.deploymentRunId,
      draft,
      createdAt: persistedAt,
      deploymentVersion: DEPLOYMENT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });

    if (!clinicRoot.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: false,
          status: clinicRoot.status,
          clinicId: clinicRoot.clinic?.id ?? null,
          message:
            clinicRoot.status === "conflict"
              ? "Clinic root was not linked because this clinic code is already assigned to another deployment session."
              : clinicRoot.message,
        },
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run persisted, but clinic root persistence failed safely. The deployment_run remains durable evidence; no downstream records were created.",
      };
    }

    const clinicId = clinicRoot.clinic?.id ?? null;

    if (!clinicId) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId: null,
          message: "Clinic root persisted but no clinic id was returned.",
        },
        clinicSettings: CLINIC_SETTINGS_NOT_ATTEMPTED,
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run and clinic root persisted, but clinic settings provisioning failed safely. No downstream records were created.",
      };
    }

    const clinicSettings =
      await provisionClinicSettingsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!clinicSettings.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: false,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message: clinicSettings.message,
        },
        providerShells: PROVIDER_SHELLS_NOT_ATTEMPTED,
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run and clinic root persisted, but clinic settings provisioning failed safely. No rollback was performed.",
      };
    }

    const providerShells =
      await provisionProviderShellsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!providerShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: false,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message: providerShells.message,
        },
        sterilizerShells: STERILIZER_SHELLS_NOT_ATTEMPTED,
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, and clinic settings are durable, but provider shell provisioning failed safely. No downstream records were created.",
      };
    }

    const sterilizerShells =
      await provisionSterilizerShellsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!sterilizerShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: false,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message: sterilizerShells.message,
        },
        workstationShells: WORKSTATION_SHELLS_NOT_ATTEMPTED,
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, clinic settings, and provider shells are durable, but sterilizer shell provisioning failed safely. No downstream records were created.",
      };
    }

    const workstationShells =
      await provisionWorkstationShellsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!workstationShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: true,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message:
            sterilizerShells.status === "reused"
              ? "Sterilizer planned shells already exist for this clinic; reuse them."
              : "Sterilizer planned shells provisioned for this draft clinic.",
        },
        workstationShells: {
          ok: false,
          status: workstationShells.status,
          clinicId,
          requested: workstationShells.counts.requested,
          created: workstationShells.counts.created,
          reused: workstationShells.counts.reused,
          skipped: workstationShells.counts.skipped,
          conflicts: workstationShells.counts.conflicts,
          message: workstationShells.message,
        },
        hardwareShells: HARDWARE_SHELLS_NOT_ATTEMPTED,
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, clinic settings, provider shells, and sterilizer shells are durable, but workstation shell provisioning failed safely. No downstream records were created.",
      };
    }
    const hardwareShells = await provisionHardwareShellsForServerDeployment(
      client,
      {
        clinicId,
        draft,
        createdAt: persistedAt,
      },
    );

    if (!hardwareShells.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: true,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message:
            sterilizerShells.status === "reused"
              ? "Sterilizer planned shells already exist for this clinic; reuse them."
              : "Sterilizer planned shells provisioned for this draft clinic.",
        },
        workstationShells: {
          ok: true,
          status: workstationShells.status,
          clinicId,
          requested: workstationShells.counts.requested,
          created: workstationShells.counts.created,
          reused: workstationShells.counts.reused,
          skipped: workstationShells.counts.skipped,
          conflicts: workstationShells.counts.conflicts,
          message:
            workstationShells.status === "reused"
              ? "Workstation planned shells already exist for this clinic; reuse them."
              : "Workstation planned shells provisioned for this draft clinic.",
        },
        hardwareShells: {
          ok: false,
          status: hardwareShells.status,
          clinicId,
          requested: hardwareShells.counts.requested,
          created: hardwareShells.counts.created,
          reused: hardwareShells.counts.reused,
          skipped: hardwareShells.counts.skipped,
          conflicts: hardwareShells.counts.conflicts,
          message: hardwareShells.message,
        },
        assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, clinic settings, provider shells, sterilizer shells, and workstation shells are durable, but hardware shell provisioning failed safely. No downstream records were created.",
      };
    }

    const assignmentTargetValidation =
      await validateAssignmentTargetsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!assignmentTargetValidation.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: true,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message:
            sterilizerShells.status === "reused"
              ? "Sterilizer planned shells already exist for this clinic; reuse them."
              : "Sterilizer planned shells provisioned for this draft clinic.",
        },
        workstationShells: {
          ok: true,
          status: workstationShells.status,
          clinicId,
          requested: workstationShells.counts.requested,
          created: workstationShells.counts.created,
          reused: workstationShells.counts.reused,
          skipped: workstationShells.counts.skipped,
          conflicts: workstationShells.counts.conflicts,
          message:
            workstationShells.status === "reused"
              ? "Workstation planned shells already exist for this clinic; reuse them."
              : "Workstation planned shells provisioned for this draft clinic.",
        },
        hardwareShells: {
          ok: true,
          status: hardwareShells.status,
          clinicId,
          requested: hardwareShells.counts.requested,
          created: hardwareShells.counts.created,
          reused: hardwareShells.counts.reused,
          skipped: hardwareShells.counts.skipped,
          conflicts: hardwareShells.counts.conflicts,
          message:
            hardwareShells.status === "reused"
              ? "Hardware planned shells already exist for this clinic; reuse them."
              : "Hardware planned shells provisioned for this draft clinic.",
        },
        assignmentTargetValidation: mapAssignmentTargetValidationActionResult(
          assignmentTargetValidation,
        ),
        hardwareAssignments: HARDWARE_ASSIGNMENTS_NOT_ATTEMPTED,
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          assignmentTargetValidation.status === "error"
            ? "Deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, and hardware shells are durable, but assignment target validation failed safely. Hardware assignments were not persisted."
            : "Deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, and hardware shells are durable, but assignment target validation found invalid logical targets. Hardware assignments were not persisted.",
      };
    }
    const hardwareAssignments =
      await provisionHardwareAssignmentsForServerDeployment(client, {
        clinicId,
        draft,
        createdAt: persistedAt,
      });

    if (!hardwareAssignments.ok) {
      return {
        ok: false,
        status: result.status,
        deploymentRunId: result.deploymentRun.deploymentRunId,
        deploymentSessionId: normalizedDeploymentSessionId,
        idempotencyKey,
        payloadHash,
        clinicRoot: {
          ok: true,
          status: clinicRoot.status,
          clinicId,
          message:
            clinicRoot.status === "reused"
              ? "Draft clinic root reused and linked to this deployment run."
              : "Draft clinic root persisted and linked to this deployment run.",
        },
        clinicSettings: {
          ok: true,
          status: clinicSettings.status,
          settingsId: clinicSettings.settings?.id ?? null,
          clinicId,
          message:
            clinicSettings.status === "reused"
              ? "Clinic settings already exist for this clinic; reuse them."
              : "Clinic settings provisioned for this draft clinic.",
        },
        providerShells: {
          ok: true,
          status: providerShells.status,
          clinicId,
          requested: providerShells.counts.requested,
          created: providerShells.counts.created,
          reused: providerShells.counts.reused,
          skipped: providerShells.counts.skipped,
          conflicts: providerShells.counts.conflicts,
          message:
            providerShells.status === "reused"
              ? "Provider placeholder shells already exist for this clinic; reuse them."
              : "Provider placeholder shells provisioned for this draft clinic.",
        },
        sterilizerShells: {
          ok: true,
          status: sterilizerShells.status,
          clinicId,
          requested: sterilizerShells.counts.requested,
          created: sterilizerShells.counts.created,
          reused: sterilizerShells.counts.reused,
          skipped: sterilizerShells.counts.skipped,
          conflicts: sterilizerShells.counts.conflicts,
          message:
            sterilizerShells.status === "reused"
              ? "Sterilizer planned shells already exist for this clinic; reuse them."
              : "Sterilizer planned shells provisioned for this draft clinic.",
        },
        workstationShells: {
          ok: true,
          status: workstationShells.status,
          clinicId,
          requested: workstationShells.counts.requested,
          created: workstationShells.counts.created,
          reused: workstationShells.counts.reused,
          skipped: workstationShells.counts.skipped,
          conflicts: workstationShells.counts.conflicts,
          message:
            workstationShells.status === "reused"
              ? "Workstation planned shells already exist for this clinic; reuse them."
              : "Workstation planned shells provisioned for this draft clinic.",
        },
        hardwareShells: {
          ok: true,
          status: hardwareShells.status,
          clinicId,
          requested: hardwareShells.counts.requested,
          created: hardwareShells.counts.created,
          reused: hardwareShells.counts.reused,
          skipped: hardwareShells.counts.skipped,
          conflicts: hardwareShells.counts.conflicts,
          message:
            hardwareShells.status === "reused"
              ? "Hardware planned shells already exist for this clinic; reuse them."
              : "Hardware planned shells provisioned for this draft clinic.",
        },
        assignmentTargetValidation: mapAssignmentTargetValidationActionResult(
          assignmentTargetValidation,
        ),
        hardwareAssignments: {
          ok: false,
          status: hardwareAssignments.status,
          clinicId,
          requested: hardwareAssignments.counts.requested,
          created: hardwareAssignments.counts.created,
          reused: hardwareAssignments.counts.reused,
          skipped: hardwareAssignments.counts.skipped,
          conflicts: hardwareAssignments.counts.conflicts,
          message: hardwareAssignments.message,
        },
        plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
        deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
        deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
        message:
          "Deployment run, clinic root, clinic settings, provider shells, sterilizer shells, workstation shells, and hardware shells are durable, but hardware assignment provisioning failed safely. No downstream records were created.",
      };
    }

    const plannedAssignmentResolution =
      await resolvePlannedAssignmentsForServerDeployment(client, {
        clinicId,
      });
    const deploymentActivationReadiness = plannedAssignmentResolution.ok
      ? await assessActivationReadinessForServerDeployment(client, {
          clinicId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          draft,
          assignmentTargetValidation,
          plannedAssignmentResolution,
          createdAt: persistedAt,
        })
      : null;
    const deploymentActivationPlan = deploymentActivationReadiness
      ? await buildActivationPlanForServerDeployment(client, {
          clinicId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          draft,
          deploymentActivationReadiness,
          plannedAssignmentResolution,
          createdAt: persistedAt,
        })
      : null;

    const deploymentActivationExecution = deploymentActivationPlan?.ok
      ? await prepareActivationExecutionForServerDeployment(client, {
          clinicId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          deploymentActivationPlan,
        })
      : null;
    const deploymentActivationExecutionPersistence = deploymentActivationExecution?.ok
      ? await persistActivationExecutionForServerDeployment(client, {
          clinicId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          payloadHash,
          deploymentActivationExecution,
          createdAt: persistedAt,
        })
      : null;
    const deploymentActivationExecutionClaim = deploymentActivationExecutionPersistence?.ok
      ? await claimActivationExecutionForServerDeployment(client, {
          clinicId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          deploymentActivationExecutionPersistence,
          claimRequestedAt: persistedAt,
        })
      : null;
    const deploymentActivationExecutionStart = deploymentActivationExecutionClaim?.ok
      ? await startActivationExecutionForServerDeployment(client, {
          clinicId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          deploymentActivationExecutionClaim,
          startRequestedAt: persistedAt,
        })
      : null;
    return {
      ok:
        plannedAssignmentResolution.ok &&
        Boolean(deploymentActivationReadiness?.ok) &&
        Boolean(deploymentActivationPlan?.ok) &&
        Boolean(deploymentActivationExecution?.ok) &&
        Boolean(deploymentActivationExecutionPersistence?.ok) &&
        Boolean(deploymentActivationExecutionStart?.ok),
      status: result.status,
      deploymentRunId: result.deploymentRun.deploymentRunId,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey,
      payloadHash,
      clinicRoot: {
        ok: true,
        status: clinicRoot.status,
        clinicId,
        message:
          clinicRoot.status === "reused"
            ? "Draft clinic root reused and linked to this deployment run."
            : "Draft clinic root persisted and linked to this deployment run.",
      },
      clinicSettings: {
        ok: true,
        status: clinicSettings.status,
        settingsId: clinicSettings.settings?.id ?? null,
        clinicId,
        message:
          clinicSettings.status === "reused"
            ? "Clinic settings already exist for this clinic; reuse them."
            : "Clinic settings provisioned for this draft clinic.",
      },
      providerShells: {
        ok: true,
        status: providerShells.status,
        clinicId,
        requested: providerShells.counts.requested,
        created: providerShells.counts.created,
        reused: providerShells.counts.reused,
        skipped: providerShells.counts.skipped,
        conflicts: providerShells.counts.conflicts,
        message:
          providerShells.status === "reused"
            ? "Provider placeholder shells already exist for this clinic; reuse them."
            : "Provider placeholder shells provisioned for this draft clinic.",
      },
      sterilizerShells: {
        ok: true,
        status: sterilizerShells.status,
        clinicId,
        requested: sterilizerShells.counts.requested,
        created: sterilizerShells.counts.created,
        reused: sterilizerShells.counts.reused,
        skipped: sterilizerShells.counts.skipped,
        conflicts: sterilizerShells.counts.conflicts,
        message:
          sterilizerShells.status === "reused"
            ? "Sterilizer planned shells already exist for this clinic; reuse them."
            : "Sterilizer planned shells provisioned for this draft clinic.",
      },
      workstationShells: {
        ok: true,
        status: workstationShells.status,
        clinicId,
        requested: workstationShells.counts.requested,
        created: workstationShells.counts.created,
        reused: workstationShells.counts.reused,
        skipped: workstationShells.counts.skipped,
        conflicts: workstationShells.counts.conflicts,
        message:
          workstationShells.status === "reused"
            ? "Workstation planned shells already exist for this clinic; reuse them."
            : "Workstation planned shells provisioned for this draft clinic.",
      },
      hardwareShells: {
        ok: true,
        status: hardwareShells.status,
        clinicId,
        requested: hardwareShells.counts.requested,
        created: hardwareShells.counts.created,
        reused: hardwareShells.counts.reused,
        skipped: hardwareShells.counts.skipped,
        conflicts: hardwareShells.counts.conflicts,
        message:
          hardwareShells.status === "reused"
            ? "Hardware planned shells already exist for this clinic; reuse them."
            : "Hardware planned shells provisioned for this draft clinic.",
      },
      assignmentTargetValidation: mapAssignmentTargetValidationActionResult(
        assignmentTargetValidation,
      ),
      hardwareAssignments: {
        ok: true,
        status: hardwareAssignments.status,
        clinicId,
        requested: hardwareAssignments.counts.requested,
        created: hardwareAssignments.counts.created,
        reused: hardwareAssignments.counts.reused,
        skipped: hardwareAssignments.counts.skipped,
        conflicts: hardwareAssignments.counts.conflicts,
        message:
          hardwareAssignments.status === "reused"
            ? "Hardware planned assignments already exist for this clinic; reuse them."
            : "Hardware planned assignments provisioned for this draft clinic.",
      },
      plannedAssignmentResolution: mapPlannedAssignmentResolutionActionResult(
        plannedAssignmentResolution,
      ),
      deploymentActivationReadiness: deploymentActivationReadiness
        ? mapDeploymentActivationReadinessActionResult(
            deploymentActivationReadiness,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            message:
              "Deployment activation readiness was skipped because planned assignment resolution is incomplete.",
          },
      deploymentActivationPlan: deploymentActivationPlan
        ? mapDeploymentActivationPlanActionResult(deploymentActivationPlan)
        : {
            ...DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            message:
              "Controlled activation planning was skipped because deployment activation readiness did not complete.",
          },
      deploymentActivationExecution: deploymentActivationExecution
        ? mapDeploymentActivationExecutionActionResult(deploymentActivationExecution)
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            planKey: deploymentActivationPlan?.planKey ?? null,
            message:
              "Activation execution preparation was skipped because the controlled activation plan did not complete ready.",
          },
      deploymentActivationExecutionPersistence: deploymentActivationExecutionPersistence
        ? mapDeploymentActivationExecutionPersistenceActionResult(
            deploymentActivationExecutionPersistence,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
            executionKey: deploymentActivationExecution?.executionKey ?? null,
            planKey: deploymentActivationExecution?.planKey ?? deploymentActivationPlan?.planKey ?? null,
            itemsRequested: deploymentActivationExecution?.itemsRequested ?? 0,
            message:
              "Activation execution persistence was skipped because execution preparation did not complete ready.",
          },
      deploymentActivationExecutionClaim: deploymentActivationExecutionClaim
        ? mapDeploymentActivationExecutionClaimActionResult(
            deploymentActivationExecutionClaim,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
            sessionId: deploymentActivationExecutionPersistence?.sessionId ?? null,
            executionKey: deploymentActivationExecutionPersistence?.executionKey ?? deploymentActivationExecution?.executionKey ?? null,
            planKey: deploymentActivationExecutionPersistence?.planKey ?? deploymentActivationExecution?.planKey ?? deploymentActivationPlan?.planKey ?? null,
            message:
              "Activation execution claim was skipped because prepared execution persistence did not complete.",
          },
      deploymentActivationExecutionStart: deploymentActivationExecutionStart
        ? mapDeploymentActivationExecutionStartActionResult(
            deploymentActivationExecutionStart,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
            sessionId: deploymentActivationExecutionClaim?.sessionId ?? deploymentActivationExecutionPersistence?.sessionId ?? null,
            executionKey: deploymentActivationExecutionClaim?.executionKey ?? deploymentActivationExecutionPersistence?.executionKey ?? deploymentActivationExecution?.executionKey ?? null,
            planKey: deploymentActivationExecutionClaim?.planKey ?? deploymentActivationExecutionPersistence?.planKey ?? deploymentActivationExecution?.planKey ?? deploymentActivationPlan?.planKey ?? null,
            claimantId: deploymentActivationExecutionClaim?.claimantId ?? null,
            leaseExpiresAt: deploymentActivationExecutionClaim?.leaseExpiresAt ?? null,
            message:
              "Activation execution start was skipped because ownership claim did not complete successfully.",
          },
      message: deploymentActivationExecutionStart?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, and atomic execution-session start are complete. The execution session may be running, but no activation item, binding, rollback, or finalization occurred."
        : deploymentActivationExecutionClaim?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, and activation execution ownership claim are complete, but execution-session start is blocked. No activation item began."
        : deploymentActivationExecutionPersistence?.ok
          ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, and prepared execution persistence are complete, but activation execution ownership claim is blocked. No activation or item execution began."
          : deploymentActivationExecution?.ok
          ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, and activation execution preparation are complete, but prepared execution persistence is blocked. No plan item executed."
          : deploymentActivationPlan?.ok
          ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, and controlled activation plan are complete, but activation execution preparation is blocked. No plan item executed."
        : deploymentActivationReadiness?.ok
          ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, and deployment activation readiness are complete, but controlled activation planning is blocked. Nothing was activated or persisted downstream."
          : plannedAssignmentResolution.ok
            ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, and planned assignment resolution are durable, but activation readiness is blocked. Controlled activation planning was skipped and retry remains available."
            : "Deployment run, draft clinic root, clinic settings, provider placeholder shells, sterilizer planned shells, workstation planned shells, hardware planned shells, and hardware planned assignments are durable, but planned assignment resolution is incomplete. Logical assignments remain persisted; activation preparation is blocked until the references resolve cleanly.",
    };
  } catch {
    return {
      ok: false,
      status: "error",
      deploymentRunId,
      deploymentSessionId: normalizedDeploymentSessionId,
      idempotencyKey,
      payloadHash,
      clinicRoot: {
        ok: false,
        status: "error",
        clinicId: null,
        message:
          "Clinic root may be unlinked or unavailable. The deployment_run remains durable evidence and no downstream records were created.",
      },
      clinicSettings: {
        ok: false,
        status: "error",
        settingsId: null,
        clinicId: null,
        message:
          "Clinic settings may be unlinked or unavailable. No rollback was performed.",
      },
      providerShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Provider shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      sterilizerShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Sterilizer shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      workstationShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Workstation shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      hardwareShells: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Hardware shell provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      assignmentTargetValidation: ASSIGNMENT_TARGET_VALIDATION_NOT_ATTEMPTED,
      hardwareAssignments: {
        ok: false,
        status: "error",
        clinicId: null,
        requested: 0,
        created: 0,
        reused: 0,
        skipped: 0,
        conflicts: 0,
        message:
          "Hardware assignment provisioning may be incomplete or unavailable. No downstream records were created.",
      },
      plannedAssignmentResolution: PLANNED_ASSIGNMENT_RESOLUTION_NOT_ATTEMPTED,
      deploymentActivationReadiness: DEPLOYMENT_ACTIVATION_READINESS_NOT_ATTEMPTED,
      deploymentActivationPlan: DEPLOYMENT_ACTIVATION_PLAN_NOT_ATTEMPTED,
        deploymentActivationExecution: DEPLOYMENT_ACTIVATION_EXECUTION_NOT_ATTEMPTED,
        deploymentActivationExecutionPersistence: DEPLOYMENT_ACTIVATION_EXECUTION_PERSISTENCE_NOT_ATTEMPTED,
        deploymentActivationExecutionClaim: DEPLOYMENT_ACTIVATION_EXECUTION_CLAIM_NOT_ATTEMPTED,
      deploymentActivationExecutionStart: DEPLOYMENT_ACTIVATION_EXECUTION_START_NOT_ATTEMPTED,
      message:
        "Deployment runtime persistence failed safely. No downstream records were created.",
    };
  }
}

function mapAssignmentTargetValidationActionResult(
  result: Awaited<ReturnType<typeof validateAssignmentTargetsForServerDeployment>>,
): AssignmentTargetValidationActionResult {
  return {
    ok: result.ok,
    status: result.status,
    clinicId: result.clinicId,
    requested: result.requested,
    valid: result.valid,
    invalid: result.invalid,
    missingTargets: result.missingTargets,
    incompatibleTargets: result.incompatibleTargets,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}
function mapPlannedAssignmentResolutionActionResult(
  result: Awaited<ReturnType<typeof resolvePlannedAssignmentsForServerDeployment>>,
): PlannedAssignmentResolutionActionResult {
  return {
    ok: result.ok,
    status: result.status,
    clinicId: result.clinicId,
    requested: result.requested,
    resolved: result.resolved,
    unresolved: result.unresolved,
    missingHardware: result.missingHardware,
    missingTargets: result.missingTargets,
    incompatibleHardware: result.incompatibleHardware,
    incompatibleTargets: result.incompatibleTargets,
    records: result.records,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}
function mapDeploymentActivationReadinessActionResult(
  result: Awaited<ReturnType<typeof assessActivationReadinessForServerDeployment>>,
): DeploymentActivationReadinessActionResult {
  return {
    ok: result.ok,
    status: result.status,
    clinicId: result.clinicId,
    deploymentRunId: result.deploymentRunId,
    checksRequested: result.checksRequested,
    checksPassed: result.checksPassed,
    checksFailed: result.checksFailed,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}

function mapDeploymentActivationPlanActionResult(
  result: Awaited<ReturnType<typeof buildActivationPlanForServerDeployment>>,
): DeploymentActivationPlanActionResult {
  return {
    ok: result.ok,
    status: result.status,
    clinicId: result.clinicId,
    deploymentRunId: result.deploymentRunId,
    planKey: result.planKey,
    itemsRequested: result.itemsRequested,
    itemsPlanned: result.itemsPlanned,
    itemsBlocked: result.itemsBlocked,
    reversibleItems: result.reversibleItems,
    irreversibleItems: result.irreversibleItems,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    planItems: result.planItems,
    downstream: result.downstream,
    message: result.message,
  };
}
function mapDeploymentActivationExecutionActionResult(
  result: Awaited<ReturnType<typeof prepareActivationExecutionForServerDeployment>>,
): DeploymentActivationExecutionActionResult {
  return {
    ok: result.ok,
    status: result.status,
    executionKey: result.executionKey,
    planKey: result.planKey,
    clinicId: result.clinicId,
    deploymentRunId: result.deploymentRunId,
    itemsRequested: result.itemsRequested,
    itemsReady: result.itemsReady,
    itemsBlocked: result.itemsBlocked,
    itemsPending: result.itemsPending,
    reversibleItems: result.reversibleItems,
    irreversibleItems: result.irreversibleItems,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    executionItems: result.executionItems,
    rollbackBoundary: result.rollbackBoundary,
    downstream: result.downstream,
    message: result.message,
  };
}

function mapDeploymentActivationExecutionPersistenceActionResult(
  result: Awaited<ReturnType<typeof persistActivationExecutionForServerDeployment>>,
): DeploymentActivationExecutionPersistenceActionResult {
  return {
    ok: result.ok,
    status: result.status,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    planKey: result.planKey,
    sessionCreated: result.sessionCreated,
    sessionReused: result.sessionReused,
    itemsRequested: result.itemsRequested,
    itemsCreated: result.itemsCreated,
    itemsReused: result.itemsReused,
    itemsConflicted: result.itemsConflicted,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}

function mapDeploymentActivationExecutionClaimActionResult(
  result: Awaited<ReturnType<typeof claimActivationExecutionForServerDeployment>>,
): DeploymentActivationExecutionClaimActionResult {
  return {
    ok: result.ok,
    status: result.status,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    planKey: result.planKey,
    claimantId: result.claimantId,
    persistedOwnerId: result.persistedOwnerId,
    leaseExpiresAt: result.leaseExpiresAt,
    claimMode: result.claimMode,
    ownershipResult: result.ownershipResult,
    sessionClaimed: result.sessionClaimed,
    sessionReused: result.sessionReused,
    sessionReclaimed: result.sessionReclaimed,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}

function mapDeploymentActivationExecutionStartActionResult(
  result: Awaited<ReturnType<typeof startActivationExecutionForServerDeployment>>,
): DeploymentActivationExecutionStartActionResult {
  return {
    ok: result.ok,
    status: result.status,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    planKey: result.planKey,
    claimantId: result.claimantId,
    startedAt: result.startedAt,
    leaseExpiresAt: result.leaseExpiresAt,
    startResult: result.startResult,
    startedCount: result.startedCount,
    reusedCount: result.reusedCount,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}
function normalizeDeploymentSessionId(
  deploymentSessionId: string | null | undefined,
): string {
  return (deploymentSessionId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAuditEvidence(
  evidence: ReturnType<typeof buildDeploymentAuditEvidenceEnvelope>,
  input: {
    deploymentRunId: string;
    payloadHash: string;
  },
): ReturnType<typeof buildDeploymentAuditEvidenceEnvelope> {
  return {
    ...evidence,
    subject: {
      ...evidence.subject,
      clinicId: null,
      deploymentRunId: input.deploymentRunId,
      payloadHash: input.payloadHash,
    },
    integrity: {
      ...evidence.integrity,
      payloadHash: input.payloadHash,
    },
  };
}