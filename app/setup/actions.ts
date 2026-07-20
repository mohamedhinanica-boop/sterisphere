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
  getServerDeploymentActivationExecutionClaimOwnershipToken,
} from "@/lib/modules/deployment/deployment-activation-execution-claim-server";
import {
  createServerClinicDeploymentExecutionStepDependencies,
  executeServerProviderSequence,
  executeServerSterilizerSequence,
  executeServerWorkstationSequence,
  executeDeploymentExecutionStepForServer,
} from "@/lib/modules/deployment/deployment-execution-step-orchestrator-server";
import {
  startActivationExecutionForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-start-server";
import {
  startActivationExecutionItemForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-item-start-server";
import {
  activateClinicForServerDeployment,
} from "@/lib/modules/deployment/deployment-clinic-activation-server";
import {
  completeActivationExecutionItemForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-item-completion-server";
import {
  progressActivationExecutionDependencyForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-dependency-progression-server";
import {
  startNextActivationExecutionItemForServerDeployment,
} from "@/lib/modules/deployment/deployment-activation-execution-next-item-start-server";
import {
  activateProviderShellForServerDeployment,
} from "@/lib/modules/deployment/deployment-provider-shell-activation-server";
import {
  completeProviderShellExecutionItemForServerDeployment,
} from "@/lib/modules/deployment/deployment-provider-shell-execution-item-completion-server";
import type { DeploymentExecutionStepOrchestratorResult } from "@/lib/modules/deployment/deployment-execution-step-orchestrator-types";
import type { ServerDeploymentSterilizerShellActivationResult } from "@/lib/modules/deployment/deployment-sterilizer-shell-activation-server";
import type { ServerDeploymentSterilizerShellExecutionItemCompletionResult } from "@/lib/modules/deployment/deployment-sterilizer-shell-execution-item-completion-server";
import type { ServerDeploymentWorkstationShellActivationResult } from "@/lib/modules/deployment/deployment-workstation-shell-activation-server";
import type { ServerDeploymentWorkstationShellExecutionItemCompletionResult } from "@/lib/modules/deployment/deployment-workstation-shell-execution-item-completion-server";
import type { ServerDeploymentActivationExecutionDependencyProgressionResult } from "@/lib/modules/deployment/deployment-activation-execution-dependency-progression-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "@/lib/modules/deployment/deployment-activation-execution-next-item-start-server";
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
  DeploymentActivationExecutionItemStartIssue,
} from "@/lib/modules/deployment/deployment-activation-execution-item-start-types";
import type {
  DeploymentClinicActivationIssue,
} from "@/lib/modules/deployment/deployment-clinic-activation-types";
import type {
  DeploymentActivationExecutionItemCompletionIssue,
} from "@/lib/modules/deployment/deployment-activation-execution-item-completion-types";
import type {
  DeploymentActivationExecutionDependencyProgressionIssue,
} from "@/lib/modules/deployment/deployment-activation-execution-dependency-progression-types";
import type {
  DeploymentActivationExecutionNextItemStartIssue,
} from "@/lib/modules/deployment/deployment-activation-execution-next-item-start-types";
import type {
  DeploymentProviderShellActivationIssue,
} from "@/lib/modules/deployment/deployment-provider-shell-activation-types";
import type {
  DeploymentProviderShellExecutionAtomicItemCompletionDiagnostics,
  DeploymentProviderShellExecutionItemCompletionIssue,
} from "@/lib/modules/deployment/deployment-provider-shell-execution-item-completion-types";
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
export type DeploymentActivationExecutionItemStartActionStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface DeploymentActivationExecutionItemStartActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionItemStartActionStatus;
  claimantId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityKey: string | null;
  entityId: string | null;
  action: string | null;
  itemExecutionStatus: string | null;
  attemptCount: number;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  dependencyCount: number;
  reversible: boolean | null;
  itemStartResult:
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
  issues: readonly DeploymentActivationExecutionItemStartIssue[];
  downstream: {
    itemsStarted: 0;
    itemsSucceeded: 0;
    entitiesActivated: 0;
    bindingsWritten: 0;
    deploymentFinalized: 0;
  };
  message: string;
}
export type DeploymentClinicActivationActionStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface DeploymentClinicActivationActionResult {
  ok: boolean;
  status: DeploymentClinicActivationActionStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  currentClinicState: Record<string, unknown> | null;
  targetClinicState: Record<string, unknown> | null;
  deployedAt: string | null;
  activationResult:
    | "activated"
    | "already_activated"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  activatedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentClinicActivationIssue[];
  downstream: {
    itemsSucceeded: 0;
    dependenciesUnlocked: 0;
    providersActivated: 0;
    sterilizersActivated: 0;
    workstationsActivated: 0;
    hardwareActivated: 0;
    bindingsWritten: 0;
    deploymentFinalized: 0;
  };
  message: string;
}

export type DeploymentActivationExecutionItemCompletionActionStatus =
  | "completed"
  | "already_completed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface DeploymentActivationExecutionItemCompletionActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionItemCompletionActionStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  action: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attemptCount: number;
  executionStatusBefore: string | null;
  executionStatusAfter: string | null;
  completionResult:
    | "completed"
    | "already_completed"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  issueCode: string | null;
  completedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionItemCompletionIssue[];
  downstream: {
    itemsCompleted: 0;
    dependenciesUnlocked: 0;
    providersActivated: 0;
    sterilizersActivated: 0;
    workstationsActivated: 0;
    hardwareActivated: 0;
    bindingsWritten: 0;
    deploymentFinalized: 0;
  };
  message: string;
}


export type DeploymentActivationExecutionDependencyProgressionActionStatus =
  | "progressed"
  | "already_progressed"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface DeploymentActivationExecutionDependencyProgressionActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionDependencyProgressionActionStatus;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  completedItemId: string | null;
  completedExecutionItemKey: string | null;
  completedPlanItemKey: string | null;
  completedSequence: number | null;
  completedStartedAt: string | null;
  completedCompletedAt: string | null;
  completedAttemptCount: number;
  nextItemId: string | null;
  nextExecutionItemKey: string | null;
  nextPlanItemKey: string | null;
  nextSequence: number | null;
  nextEntityType: string | null;
  nextEntityId: string | null;
  nextAction: string | null;
  nextAttemptCount: number;
  statusBefore: string | null;
  statusAfter: string | null;
  progressionResult:
    | "progressed"
    | "already_progressed"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  issueCode: string | null;
  progressedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionDependencyProgressionIssue[];
  downstream: {
    itemsReadied: 0;
    itemsStarted: 0;
    itemsSucceeded: 0;
    entitiesActivated: 0;
    bindingsWritten: 0;
    sessionsCompleted: 0;
    deploymentsFinalized: 0;
    rollbacksExecuted: 0;
  };
  message: string;
}

export type DeploymentActivationExecutionNextItemStartActionStatus =
  | "started"
  | "already_started"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error"
  | "not_attempted";

export interface DeploymentActivationExecutionNextItemStartActionResult {
  ok: boolean;
  status: DeploymentActivationExecutionNextItemStartActionStatus;
  message: string;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  action: string | null;
  attemptCount: number;
  startedAt: string | null;
  leaseExpiresAt: string | null;
  result:
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
  issues: readonly DeploymentActivationExecutionNextItemStartIssue[];
  downstream: {
    itemsStarted: 0;
    itemsSucceeded: 0;
    entitiesActivated: 0;
    bindingsWritten: 0;
    itemsCompleted: 0;
    dependenciesProgressed: 0;
    finalized: 0;
  };
}

export type DeploymentProviderShellActivationActionStatus =
  | "activated"
  | "already_activated"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentProviderShellActivationActionResult {
  ok: boolean;
  status: DeploymentProviderShellActivationActionStatus;
  message: string;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  providerId: string | null;
  deploymentProviderKey: string | null;
  provisioningSourceBefore: string | null;
  provisioningSourceAfter: string | null;
  provisioningStatusBefore: string | null;
  provisioningStatusAfter: string | null;
  activeBefore: boolean | null;
  activeAfter: boolean | null;
  activatedAt: string | null;
  result:
    | "activated"
    | "already_activated"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  activatedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentProviderShellActivationIssue[];
  downstream: {
    providersActivated: 0;
    itemsCompleted: 0;
    dependenciesProgressed: 0;
    bindingsWritten: 0;
    sessionsCompleted: 0;
    rollbacksExecuted: 0;
    deploymentFinalized: 0;
  };
}
export type DeploymentProviderShellExecutionItemCompletionActionStatus =
  | "completed"
  | "already_completed"
  | "not_attempted"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentProviderShellExecutionItemCompletionActionResult {
  ok: boolean;
  status: DeploymentProviderShellExecutionItemCompletionActionStatus;
  message: string;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunId: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  deploymentProviderKey: string | null;
  action: string | null;
  itemStatusBefore: string | null;
  itemStatusAfter: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  providerId: string | null;
  providerStatus: string | null;
  providerActive: boolean | null;
  completionResult:
    | "completed"
    | "already_completed"
    | "blocked"
    | "conflict"
    | "not_found"
    | "error"
    | null;
  issueCode: string | null;
  completedCount: 0 | 1;
  reusedCount: 0 | 1;
  conflicts: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentProviderShellExecutionItemCompletionIssue[];
  diagnostics: DeploymentProviderShellExecutionAtomicItemCompletionDiagnostics | null;
  downstream: {
    itemsCompleted: 0;
    dependenciesProgressed: 0;
    nextItemsStarted: 0;
    providersActivated: 0;
    sterilizersActivated: 0;
    workstationsActivated: 0;
    hardwareActivated: 0;
    bindingsWritten: 0;
    sessionsCompleted: 0;
    rollbacksExecuted: 0;
    deploymentFinalized: 0;
  };
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
  deploymentActivationExecutionItemStart: DeploymentActivationExecutionItemStartActionResult;
  deploymentClinicActivation: DeploymentClinicActivationActionResult;
  deploymentClinicExecutionStep?: DeploymentExecutionStepOrchestratorResult;
  deploymentProviderExecutionStep?: DeploymentExecutionStepOrchestratorResult;
  deploymentSterilizerExecutionStep?: DeploymentExecutionStepOrchestratorResult;
  deploymentActivationExecutionItemCompletion?: DeploymentActivationExecutionItemCompletionActionResult;
  deploymentActivationExecutionDependencyProgression?: DeploymentActivationExecutionDependencyProgressionActionResult;
  deploymentActivationExecutionNextItemStart?: DeploymentActivationExecutionNextItemStartActionResult;
  deploymentProviderShellActivation?: DeploymentProviderShellActivationActionResult;
  deploymentProviderShellExecutionItemCompletion?: DeploymentProviderShellExecutionItemCompletionActionResult;
  deploymentProviderShellExecutionDependencyProgression?: DeploymentActivationExecutionDependencyProgressionActionResult;
  deploymentProviderShellExecutionNextItemStart?: DeploymentActivationExecutionNextItemStartActionResult;
  deploymentSterilizerShellActivation?: ServerDeploymentSterilizerShellActivationResult;
  deploymentSterilizerShellExecutionItemCompletion?: ServerDeploymentSterilizerShellExecutionItemCompletionResult;
  deploymentSterilizerShellExecutionDependencyProgression?: ServerDeploymentActivationExecutionDependencyProgressionResult;
  deploymentSterilizerShellExecutionNextItemStart?: ServerDeploymentActivationExecutionNextItemStartResult;
  deploymentWorkstationExecutionStep?: DeploymentExecutionStepOrchestratorResult;
  deploymentWorkstationShellActivation?: ServerDeploymentWorkstationShellActivationResult;
  deploymentWorkstationShellExecutionItemCompletion?: ServerDeploymentWorkstationShellExecutionItemCompletionResult;
  deploymentWorkstationShellExecutionDependencyProgression?: ServerDeploymentActivationExecutionDependencyProgressionResult;
  deploymentWorkstationShellExecutionNextItemStart?: ServerDeploymentActivationExecutionNextItemStartResult;
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


const DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED: DeploymentActivationExecutionItemStartActionResult = {
  ok: false,
  status: "not_attempted",
  claimantId: null,
  sessionId: null,
  executionKey: null,
  itemId: null,
  executionItemKey: null,
  planItemKey: null,
  sequence: null,
  entityType: null,
  entityKey: null,
  entityId: null,
  action: null,
  itemExecutionStatus: null,
  attemptCount: 0,
  startedAt: null,
  leaseExpiresAt: null,
  dependencyCount: 0,
  reversible: null,
  itemStartResult: null,
  startedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  },
  message: "Activation execution item start was not attempted.",
};
const DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED: DeploymentClinicActivationActionResult = {
  ok: false,
  status: "not_attempted",
  claimantId: null,
  clinicId: null,
  deploymentRunId: null,
  sessionId: null,
  executionKey: null,
  itemId: null,
  executionItemKey: null,
  planItemKey: null,
  currentClinicState: null,
  targetClinicState: null,
  deployedAt: null,
  activationResult: null,
  activatedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    itemsSucceeded: 0,
    dependenciesUnlocked: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  },
  message: "Clinic activation was not attempted.",
};

const DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED: DeploymentActivationExecutionItemCompletionActionResult = {
  ok: false,
  status: "not_attempted",
  claimantId: null,
  clinicId: null,
  deploymentRunId: null,
  sessionId: null,
  executionKey: null,
  itemId: null,
  executionItemKey: null,
  planItemKey: null,
  sequence: null,
  entityType: null,
  action: null,
  startedAt: null,
  completedAt: null,
  attemptCount: 0,
  executionStatusBefore: null,
  executionStatusAfter: null,
  completionResult: null,
  issueCode: null,
  completedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    itemsCompleted: 0,
    dependenciesUnlocked: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    deploymentFinalized: 0,
  },
  message: "Activation execution item completion was not attempted.",
};


const DEPLOYMENT_ACTIVATION_EXECUTION_DEPENDENCY_PROGRESSION_NOT_ATTEMPTED: DeploymentActivationExecutionDependencyProgressionActionResult = {
  ok: false,
  status: "not_attempted",
  claimantId: null,
  clinicId: null,
  deploymentRunId: null,
  sessionId: null,
  executionKey: null,
  completedItemId: null,
  completedExecutionItemKey: null,
  completedPlanItemKey: null,
  completedSequence: null,
  completedStartedAt: null,
  completedCompletedAt: null,
  completedAttemptCount: 0,
  nextItemId: null,
  nextExecutionItemKey: null,
  nextPlanItemKey: null,
  nextSequence: null,
  nextEntityType: null,
  nextEntityId: null,
  nextAction: null,
  nextAttemptCount: 0,
  statusBefore: null,
  statusAfter: null,
  progressionResult: null,
  issueCode: null,
  progressedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    itemsReadied: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    deploymentsFinalized: 0,
    rollbacksExecuted: 0,
  },
  message: "Activation execution dependency progression was not attempted.",
};
const DEPLOYMENT_ACTIVATION_EXECUTION_NEXT_ITEM_START_NOT_ATTEMPTED: DeploymentActivationExecutionNextItemStartActionResult = {
  ok: false,
  status: "not_attempted",
  message: "Activation execution next-item start was not attempted.",
  claimantId: null,
  clinicId: null,
  deploymentRunKey: null,
  sessionId: null,
  executionKey: null,
  planKey: null,
  itemId: null,
  executionItemKey: null,
  planItemKey: null,
  sequence: null,
  entityType: null,
  entityId: null,
  action: null,
  attemptCount: 0,
  startedAt: null,
  leaseExpiresAt: null,
  result: null,
  startedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    itemsStarted: 0,
    itemsSucceeded: 0,
    entitiesActivated: 0,
    bindingsWritten: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    finalized: 0,
  },
};
const DEPLOYMENT_PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED: DeploymentProviderShellExecutionItemCompletionActionResult = {
  ok: false,
  status: "not_attempted",
  message: "Provider-shell execution item completion was not attempted.",
  claimantId: null,
  clinicId: null,
  deploymentRunId: null,
  sessionId: null,
  executionKey: null,
  itemId: null,
  executionItemKey: null,
  planItemKey: null,
  sequence: null,
  entityType: null,
  entityId: null,
  deploymentProviderKey: null,
  action: null,
  itemStatusBefore: null,
  itemStatusAfter: null,
  attemptCount: 0,
  startedAt: null,
  completedAt: null,
  providerId: null,
  providerStatus: null,
  providerActive: null,
  completionResult: null,
  issueCode: null,
  completedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  diagnostics: null,
  downstream: {
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    nextItemsStarted: 0,
    providersActivated: 0,
    sterilizersActivated: 0,
    workstationsActivated: 0,
    hardwareActivated: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  },
};
const DEPLOYMENT_PROVIDER_SHELL_ACTIVATION_NOT_ATTEMPTED: DeploymentProviderShellActivationActionResult = {
  ok: false,
  status: "not_attempted",
  message: "Provider shell activation was not attempted.",
  claimantId: null,
  clinicId: null,
  deploymentRunKey: null,
  sessionId: null,
  executionKey: null,
  planKey: null,
  itemId: null,
  executionItemKey: null,
  planItemKey: null,
  sequence: null,
  providerId: null,
  deploymentProviderKey: null,
  provisioningSourceBefore: null,
  provisioningSourceAfter: null,
  provisioningStatusBefore: null,
  provisioningStatusAfter: null,
  activeBefore: null,
  activeAfter: null,
  activatedAt: null,
  result: null,
  activatedCount: 0,
  reusedCount: 0,
  conflicts: 0,
  blockers: 0,
  warnings: 0,
  issues: [],
  downstream: {
    providersActivated: 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    bindingsWritten: 0,
    sessionsCompleted: 0,
    rollbacksExecuted: 0,
    deploymentFinalized: 0,
  },
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
    const deploymentActivationExecutionItemStart = deploymentActivationExecutionStart?.ok
      ? await startActivationExecutionItemForServerDeployment(client, {
          clinicId,
          deploymentRunId: result.deploymentRun.deploymentRunId,
          deploymentActivationExecutionClaim,
          deploymentActivationExecutionStart,
          itemStartRequestedAt: persistedAt,
        })
      : null;
    const preparedClinicItem = deploymentActivationExecution?.executionItems.find(
      (item) => item.executionItemKey === deploymentActivationExecutionItemStart?.executionItemKey,
    ) ?? null;
    const clinicOwnershipToken = getServerDeploymentActivationExecutionClaimOwnershipToken(
      deploymentActivationExecutionClaim,
    );
    const useGenericClinicStep = Boolean(
      deploymentActivationExecutionItemStart?.ok &&
      deploymentActivationExecutionItemStart.entityType === "clinic" &&
      deploymentActivationExecutionItemStart.action === "activate" &&
      deploymentActivationExecutionItemStart.itemExecutionStatus === "running" &&
      preparedClinicItem?.entityType === "clinic" &&
      preparedClinicItem.action === "activate" &&
      clinicOwnershipToken &&
      deploymentActivationExecutionClaim,
    );
    const clinicStepDependencies = useGenericClinicStep
      ? createServerClinicDeploymentExecutionStepDependencies(client, {
          deploymentActivationExecutionClaim: deploymentActivationExecutionClaim!,
          deploymentActivationExecutionItemStart: deploymentActivationExecutionItemStart!,
        })
      : null;
    const deploymentClinicExecutionStep = clinicStepDependencies && preparedClinicItem
      ? await executeDeploymentExecutionStepForServer(clinicStepDependencies, {
          context: {
            claimantId: deploymentActivationExecutionClaim!.claimantId!,
            ownershipToken: clinicOwnershipToken!,
            leaseExpiresAt: deploymentActivationExecutionClaim!.leaseExpiresAt,
            executedAt: persistedAt,
          },
          item: {
            clinicId,
            deploymentRunKey: result.deploymentRun.deploymentRunId,
            sessionId: deploymentActivationExecutionItemStart!.sessionId!,
            executionKey: deploymentActivationExecutionItemStart!.executionKey!,
            planKey: deploymentActivationExecutionClaim!.planKey!,
            itemId: deploymentActivationExecutionItemStart!.itemId!,
            executionItemKey: deploymentActivationExecutionItemStart!.executionItemKey!,
            planItemKey: deploymentActivationExecutionItemStart!.planItemKey!,
            sequence: deploymentActivationExecutionItemStart!.sequence!,
            entityType: deploymentActivationExecutionItemStart!.entityType!,
            entityId: deploymentActivationExecutionItemStart!.entityId,
            deploymentKey: preparedClinicItem.deploymentKey,
            action: deploymentActivationExecutionItemStart!.action!,
            executionStatus: deploymentActivationExecutionItemStart!.itemExecutionStatus!,
            attemptCount: deploymentActivationExecutionItemStart!.attemptCount,
            startedAt: deploymentActivationExecutionItemStart!.startedAt,
            completedAt: preparedClinicItem.completedAt,
            rolledBackAt: null,
            errorCode: preparedClinicItem.error?.code ?? null,
            errorMessage: preparedClinicItem.error?.message ?? null,
            expectedCurrentState: preparedClinicItem.currentState,
            targetState: preparedClinicItem.targetState,
            dependencyKeys: preparedClinicItem.dependencyKeys,
            reversible: preparedClinicItem.reversible,
            rollbackBehavior: preparedClinicItem.rollbackAction,
          },
        })
      : null;
    const clinicRuntimeEvidence = clinicStepDependencies?.getClinicRuntimeEvidence() ?? null;
    const deploymentClinicActivation = clinicRuntimeEvidence?.clinicActivation ?? null;
    const deploymentActivationExecutionItemCompletion = clinicRuntimeEvidence?.itemCompletion ?? null;
    const deploymentActivationExecutionDependencyProgression = clinicRuntimeEvidence?.dependencyProgression ?? null;
    const deploymentActivationExecutionNextItemStart = clinicRuntimeEvidence?.nextItemStart ?? null;
    const providerSequence = deploymentActivationExecutionNextItemStart?.ok && deploymentActivationExecution && deploymentActivationExecutionClaim && clinicOwnershipToken
      ? await executeServerProviderSequence(client, {
          context: {
            claimantId: deploymentActivationExecutionClaim.claimantId!,
            ownershipToken: clinicOwnershipToken,
            leaseExpiresAt: deploymentActivationExecutionClaim.leaseExpiresAt,
            executedAt: persistedAt,
          },
          clinicId,
          deploymentRunKey: result.deploymentRun.deploymentRunId,
          sessionId: deploymentActivationExecutionNextItemStart.sessionId!,
          executionKey: deploymentActivationExecutionNextItemStart.executionKey!,
          planKey: deploymentActivationExecutionClaim.planKey!,
          deploymentActivationExecutionClaim,
          initialNextItemStart: deploymentActivationExecutionNextItemStart,
          preparedExecutionItems: deploymentActivationExecution.executionItems,
        })
      : null;
    const deploymentProviderExecutionStep = providerSequence?.lastStep ?? null;
    const deploymentProviderShellActivation = providerSequence?.providerActivation ?? null;
    const deploymentProviderShellExecutionItemCompletion = providerSequence?.itemCompletion ?? null;
    const deploymentProviderShellExecutionDependencyProgression = providerSequence?.dependencyProgression ?? null;
    const deploymentProviderShellExecutionNextItemStart = providerSequence?.nextItemStart ?? null;
    const sterilizerSequence = providerSequence?.ok && deploymentProviderShellExecutionNextItemStart?.ok && deploymentActivationExecution && deploymentActivationExecutionClaim && clinicOwnershipToken
      ? await executeServerSterilizerSequence(client, {
          context: {
            claimantId: deploymentActivationExecutionClaim.claimantId!,
            ownershipToken: clinicOwnershipToken,
            leaseExpiresAt: deploymentActivationExecutionClaim.leaseExpiresAt,
            executedAt: persistedAt,
          },
          clinicId,
          deploymentRunKey: result.deploymentRun.deploymentRunId,
          sessionId: deploymentProviderShellExecutionNextItemStart.sessionId!,
          executionKey: deploymentProviderShellExecutionNextItemStart.executionKey!,
          planKey: deploymentActivationExecutionClaim.planKey!,
          deploymentActivationExecutionClaim,
          initialNextItemStart: deploymentProviderShellExecutionNextItemStart,
          preparedExecutionItems: deploymentActivationExecution.executionItems,
        })
      : null;
    const deploymentSterilizerExecutionStep = sterilizerSequence?.lastStep ?? null;
    const deploymentSterilizerShellActivation = sterilizerSequence?.sterilizerActivation ?? null;
    const deploymentSterilizerShellExecutionItemCompletion = sterilizerSequence?.itemCompletion ?? null;
    const deploymentSterilizerShellExecutionDependencyProgression = sterilizerSequence?.dependencyProgression ?? null;
    const deploymentSterilizerShellExecutionNextItemStart = sterilizerSequence?.nextItemStart ?? null;
    const workstationSequence = sterilizerSequence?.ok && deploymentSterilizerShellExecutionNextItemStart?.ok && deploymentActivationExecution && deploymentActivationExecutionClaim && clinicOwnershipToken
      ? await executeServerWorkstationSequence(client, {
          context: {
            claimantId: deploymentActivationExecutionClaim.claimantId!,
            ownershipToken: clinicOwnershipToken,
            leaseExpiresAt: deploymentActivationExecutionClaim.leaseExpiresAt,
            executedAt: persistedAt,
          },
          clinicId,
          deploymentRunKey: result.deploymentRun.deploymentRunId,
          sessionId: deploymentSterilizerShellExecutionNextItemStart.sessionId!,
          executionKey: deploymentSterilizerShellExecutionNextItemStart.executionKey!,
          planKey: deploymentActivationExecutionClaim.planKey!,
          deploymentActivationExecutionClaim,
          initialNextItemStart: deploymentSterilizerShellExecutionNextItemStart,
          preparedExecutionItems: deploymentActivationExecution.executionItems,
        })
      : null;
    const deploymentWorkstationExecutionStep = workstationSequence?.lastStep ?? null;
    const deploymentWorkstationShellActivation = workstationSequence?.workstationActivation ?? null;
    const deploymentWorkstationShellExecutionItemCompletion = workstationSequence?.itemCompletion ?? null;
    const deploymentWorkstationShellExecutionDependencyProgression = workstationSequence?.dependencyProgression ?? null;
    const deploymentWorkstationShellExecutionNextItemStart = workstationSequence?.nextItemStart ?? null;

    return {
      ok:
        plannedAssignmentResolution.ok &&
        Boolean(deploymentActivationReadiness?.ok) &&
        Boolean(deploymentActivationPlan?.ok) &&
        Boolean(deploymentActivationExecution?.ok) &&
        Boolean(deploymentActivationExecutionPersistence?.ok) &&
        Boolean(deploymentActivationExecutionStart?.ok) &&
        Boolean(deploymentActivationExecutionItemStart?.ok) &&
        Boolean(deploymentClinicExecutionStep?.ok) &&
        Boolean(providerSequence?.ok) &&
        Boolean(sterilizerSequence?.ok) &&
        Boolean(workstationSequence?.ok),
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
      deploymentActivationExecutionItemStart: deploymentActivationExecutionItemStart
        ? mapDeploymentActivationExecutionItemStartActionResult(
            deploymentActivationExecutionItemStart,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
            sessionId: deploymentActivationExecutionStart?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? deploymentActivationExecutionPersistence?.sessionId ?? null,
            executionKey: deploymentActivationExecutionStart?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? deploymentActivationExecutionPersistence?.executionKey ?? deploymentActivationExecution?.executionKey ?? null,
            claimantId: deploymentActivationExecutionStart?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            leaseExpiresAt: deploymentActivationExecutionStart?.leaseExpiresAt ?? deploymentActivationExecutionClaim?.leaseExpiresAt ?? null,
            message:
              "Activation execution item start was skipped because execution-session start did not complete successfully.",
          },
      deploymentClinicExecutionStep: deploymentClinicExecutionStep ?? undefined,
      deploymentProviderExecutionStep: deploymentProviderExecutionStep ?? undefined,
      deploymentSterilizerExecutionStep: deploymentSterilizerExecutionStep ?? undefined,
      deploymentClinicActivation: deploymentClinicActivation
        ? mapDeploymentClinicActivationActionResult(deploymentClinicActivation)
        : {
            ...DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            sessionId: deploymentActivationExecutionItemStart?.sessionId ?? deploymentActivationExecutionStart?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentActivationExecutionItemStart?.executionKey ?? deploymentActivationExecutionStart?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentActivationExecutionItemStart?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            itemId: deploymentActivationExecutionItemStart?.itemId ?? null,
            executionItemKey: deploymentActivationExecutionItemStart?.executionItemKey ?? null,
            planItemKey: deploymentActivationExecutionItemStart?.planItemKey ?? null,
            message:
              "Clinic activation was skipped because activation execution item start did not complete successfully.",
          },
      deploymentActivationExecutionItemCompletion: deploymentActivationExecutionItemCompletion
        ? mapDeploymentActivationExecutionItemCompletionActionResult(
            deploymentActivationExecutionItemCompletion,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            sessionId: deploymentClinicActivation?.sessionId ?? deploymentActivationExecutionItemStart?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentClinicActivation?.executionKey ?? deploymentActivationExecutionItemStart?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentClinicActivation?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            itemId: deploymentClinicActivation?.itemId ?? deploymentActivationExecutionItemStart?.itemId ?? null,
            executionItemKey: deploymentClinicActivation?.executionItemKey ?? deploymentActivationExecutionItemStart?.executionItemKey ?? null,
            planItemKey: deploymentClinicActivation?.planItemKey ?? deploymentActivationExecutionItemStart?.planItemKey ?? null,
            message:
              "Activation execution item completion was skipped because clinic activation did not complete successfully.",
          },
      deploymentActivationExecutionDependencyProgression: deploymentActivationExecutionDependencyProgression
        ? mapDeploymentActivationExecutionDependencyProgressionActionResult(
            deploymentActivationExecutionDependencyProgression,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_DEPENDENCY_PROGRESSION_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            sessionId: deploymentActivationExecutionItemCompletion?.sessionId ?? deploymentClinicActivation?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentActivationExecutionItemCompletion?.executionKey ?? deploymentClinicActivation?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentActivationExecutionItemCompletion?.claimantId ?? deploymentClinicActivation?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            completedItemId: deploymentActivationExecutionItemCompletion?.itemId ?? null,
            completedExecutionItemKey: deploymentActivationExecutionItemCompletion?.executionItemKey ?? null,
            completedPlanItemKey: deploymentActivationExecutionItemCompletion?.planItemKey ?? null,
            completedSequence: deploymentActivationExecutionItemCompletion?.sequence ?? null,
            completedStartedAt: deploymentActivationExecutionItemCompletion?.startedAt ?? null,
            completedCompletedAt: deploymentActivationExecutionItemCompletion?.completedAt ?? null,
            completedAttemptCount: deploymentActivationExecutionItemCompletion?.attemptCount ?? 0,
            message:
              "Activation execution dependency progression was skipped because item completion did not complete successfully.",
          },
      deploymentActivationExecutionNextItemStart: deploymentActivationExecutionNextItemStart
        ? mapDeploymentActivationExecutionNextItemStartActionResult(
            deploymentActivationExecutionNextItemStart,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_NEXT_ITEM_START_NOT_ATTEMPTED,
            clinicId,
            deploymentRunKey: result.deploymentRun.deploymentRunId,
            sessionId: deploymentActivationExecutionDependencyProgression?.sessionId ?? deploymentActivationExecutionItemCompletion?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentActivationExecutionDependencyProgression?.executionKey ?? deploymentActivationExecutionItemCompletion?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentActivationExecutionDependencyProgression?.claimantId ?? deploymentActivationExecutionItemCompletion?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            itemId: deploymentActivationExecutionDependencyProgression?.nextItemId ?? null,
            executionItemKey: deploymentActivationExecutionDependencyProgression?.nextExecutionItemKey ?? null,
            planItemKey: deploymentActivationExecutionDependencyProgression?.nextPlanItemKey ?? null,
            sequence: deploymentActivationExecutionDependencyProgression?.nextSequence ?? null,
            entityType: deploymentActivationExecutionDependencyProgression?.nextEntityType ?? null,
            entityId: deploymentActivationExecutionDependencyProgression?.nextEntityId ?? null,
            action: deploymentActivationExecutionDependencyProgression?.nextAction ?? null,
            attemptCount: deploymentActivationExecutionDependencyProgression?.nextAttemptCount ?? 0,
            message:
              "Activation execution next-item start was skipped because dependency progression did not complete successfully.",
          },
      deploymentProviderShellActivation: deploymentProviderShellActivation
        ? mapDeploymentProviderShellActivationActionResult(
            deploymentProviderShellActivation,
          )
        : {
            ...DEPLOYMENT_PROVIDER_SHELL_ACTIVATION_NOT_ATTEMPTED,
            clinicId,
            deploymentRunKey: result.deploymentRun.deploymentRunId,
            sessionId: deploymentActivationExecutionNextItemStart?.sessionId ?? deploymentActivationExecutionDependencyProgression?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentActivationExecutionNextItemStart?.executionKey ?? deploymentActivationExecutionDependencyProgression?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentActivationExecutionNextItemStart?.claimantId ?? deploymentActivationExecutionDependencyProgression?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            planKey: deploymentActivationExecutionNextItemStart?.planKey ?? null,
            itemId: deploymentActivationExecutionNextItemStart?.itemId ?? null,
            executionItemKey: deploymentActivationExecutionNextItemStart?.executionItemKey ?? null,
            planItemKey: deploymentActivationExecutionNextItemStart?.planItemKey ?? null,
            sequence: deploymentActivationExecutionNextItemStart?.sequence ?? null,
            deploymentProviderKey: deploymentProviderExecutionStep?.deploymentKey ?? null,
            message:
              "Provider shell activation was skipped because next-item start did not complete successfully.",
          },
      deploymentProviderShellExecutionItemCompletion: deploymentProviderShellExecutionItemCompletion
        ? mapDeploymentProviderShellExecutionItemCompletionActionResult(
            deploymentProviderShellExecutionItemCompletion,
          )
        : {
            ...DEPLOYMENT_PROVIDER_SHELL_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            sessionId: deploymentProviderShellActivation?.sessionId ?? deploymentActivationExecutionNextItemStart?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentProviderShellActivation?.executionKey ?? deploymentActivationExecutionNextItemStart?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentProviderShellActivation?.claimantId ?? deploymentActivationExecutionNextItemStart?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            itemId: deploymentProviderShellActivation?.itemId ?? deploymentActivationExecutionNextItemStart?.itemId ?? null,
            executionItemKey: deploymentProviderShellActivation?.executionItemKey ?? deploymentActivationExecutionNextItemStart?.executionItemKey ?? null,
            planItemKey: deploymentProviderShellActivation?.planItemKey ?? deploymentActivationExecutionNextItemStart?.planItemKey ?? null,
            sequence: deploymentProviderShellActivation?.sequence ?? deploymentActivationExecutionNextItemStart?.sequence ?? null,
            entityType: deploymentActivationExecutionNextItemStart?.entityType ?? null,
            entityId: deploymentActivationExecutionNextItemStart?.entityId ?? null,
            deploymentProviderKey: deploymentProviderShellActivation?.deploymentProviderKey ?? null,
            action: deploymentActivationExecutionNextItemStart?.action ?? null,
            providerId: deploymentProviderShellActivation?.providerId ?? null,
            message:
              "Provider-shell execution item completion was skipped because provider shell activation did not complete successfully.",
          },
      deploymentProviderShellExecutionDependencyProgression: deploymentProviderShellExecutionDependencyProgression
        ? mapDeploymentActivationExecutionDependencyProgressionActionResult(
            deploymentProviderShellExecutionDependencyProgression,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_DEPENDENCY_PROGRESSION_NOT_ATTEMPTED,
            clinicId,
            deploymentRunId: result.deploymentRun.deploymentRunId,
            sessionId: deploymentProviderShellExecutionItemCompletion?.sessionId ?? deploymentProviderShellActivation?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentProviderShellExecutionItemCompletion?.executionKey ?? deploymentProviderShellActivation?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentProviderShellExecutionItemCompletion?.claimantId ?? deploymentProviderShellActivation?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            completedItemId: deploymentProviderShellExecutionItemCompletion?.itemId ?? null,
            completedExecutionItemKey: deploymentProviderShellExecutionItemCompletion?.executionItemKey ?? null,
            completedPlanItemKey: deploymentProviderShellExecutionItemCompletion?.planItemKey ?? null,
            completedSequence: deploymentProviderShellExecutionItemCompletion?.sequence ?? null,
            completedStartedAt: deploymentProviderShellExecutionItemCompletion?.startedAt ?? null,
            completedCompletedAt: deploymentProviderShellExecutionItemCompletion?.completedAt ?? null,
            completedAttemptCount: deploymentProviderShellExecutionItemCompletion?.attemptCount ?? 0,
            message:
              "Provider completion dependency progression was skipped because provider-shell execution item completion did not complete successfully.",
          },
      deploymentProviderShellExecutionNextItemStart: deploymentProviderShellExecutionNextItemStart
        ? mapDeploymentActivationExecutionNextItemStartActionResult(
            deploymentProviderShellExecutionNextItemStart,
          )
        : {
            ...DEPLOYMENT_ACTIVATION_EXECUTION_NEXT_ITEM_START_NOT_ATTEMPTED,
            clinicId,
            deploymentRunKey: result.deploymentRun.deploymentRunId,
            sessionId: deploymentProviderShellExecutionDependencyProgression?.sessionId ?? deploymentProviderShellExecutionItemCompletion?.sessionId ?? deploymentProviderShellActivation?.sessionId ?? deploymentActivationExecutionClaim?.sessionId ?? null,
            executionKey: deploymentProviderShellExecutionDependencyProgression?.executionKey ?? deploymentProviderShellExecutionItemCompletion?.executionKey ?? deploymentProviderShellActivation?.executionKey ?? deploymentActivationExecutionClaim?.executionKey ?? null,
            claimantId: deploymentProviderShellExecutionDependencyProgression?.claimantId ?? deploymentProviderShellExecutionItemCompletion?.claimantId ?? deploymentProviderShellActivation?.claimantId ?? deploymentActivationExecutionClaim?.claimantId ?? null,
            itemId: deploymentProviderShellExecutionDependencyProgression?.nextItemId ?? null,
            executionItemKey: deploymentProviderShellExecutionDependencyProgression?.nextExecutionItemKey ?? null,
            planItemKey: deploymentProviderShellExecutionDependencyProgression?.nextPlanItemKey ?? null,
            sequence: deploymentProviderShellExecutionDependencyProgression?.nextSequence ?? null,
            entityType: deploymentProviderShellExecutionDependencyProgression?.nextEntityType ?? null,
            entityId: deploymentProviderShellExecutionDependencyProgression?.nextEntityId ?? null,
            action: deploymentProviderShellExecutionDependencyProgression?.nextAction ?? null,
            attemptCount: deploymentProviderShellExecutionDependencyProgression?.nextAttemptCount ?? 0,
            message:
              "Post-provider next-item start was skipped because post-provider dependency progression did not complete successfully.",
          },
      deploymentSterilizerShellActivation: deploymentSterilizerShellActivation ?? undefined,
      deploymentSterilizerShellExecutionItemCompletion: deploymentSterilizerShellExecutionItemCompletion ?? undefined,
      deploymentSterilizerShellExecutionDependencyProgression: deploymentSterilizerShellExecutionDependencyProgression ?? undefined,
      deploymentSterilizerShellExecutionNextItemStart: deploymentSterilizerShellExecutionNextItemStart ?? undefined,
      deploymentWorkstationExecutionStep: deploymentWorkstationExecutionStep ?? undefined,
      deploymentWorkstationShellActivation: deploymentWorkstationShellActivation ?? undefined,
      deploymentWorkstationShellExecutionItemCompletion: deploymentWorkstationShellExecutionItemCompletion ?? undefined,
      deploymentWorkstationShellExecutionDependencyProgression: deploymentWorkstationShellExecutionDependencyProgression ?? undefined,
      deploymentWorkstationShellExecutionNextItemStart: deploymentWorkstationShellExecutionNextItemStart ?? undefined,
      message: deploymentWorkstationShellExecutionNextItemStart?.ok
        ? "Deployment run activation completed all deterministic provider, sterilizer, and workstation items. The first hardware item may now be running, but hardware activation was not attempted. No rollback, session completion, or finalization occurred."
        : deploymentSterilizerShellExecutionNextItemStart?.ok
        ? "Deployment run activation completed all deterministic provider and sterilizer items, but workstation sequence execution did not complete. Hardware activation was not attempted. No rollback, session completion, or finalization occurred."
        : deploymentProviderShellExecutionNextItemStart?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, first execution item start, clinic activation, item completion, dependency progression, next-item start, provider shell activation, provider-shell execution item completion, post-provider dependency progression, and post-provider next-item start are complete. All deterministic provider items are complete and the first non-provider item may now be running, but no non-provider activation, binding, rollback, session completion, or finalization occurred."
        : deploymentProviderShellExecutionDependencyProgression?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, first execution item start, clinic activation, item completion, dependency progression, next-item start, provider shell activation, provider-shell execution item completion, and post-provider dependency progression are complete, but post-provider next-item start is blocked, skipped, or not applicable. No provider activation, further item completion, binding, rollback, or finalization occurred."
        : deploymentProviderShellExecutionItemCompletion?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, first execution item start, clinic activation, item completion, dependency progression, next-item start, provider shell activation, and provider-shell execution item completion are complete, but post-provider dependency progression is blocked, skipped, or not applicable. No further item start, binding, rollback, or finalization occurred."
        : deploymentProviderShellActivation?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, first execution item start, clinic activation, item completion, dependency progression, next-item start, and provider shell activation are complete, but provider-shell execution item completion is blocked, skipped, or not applicable. No further dependency progression, binding, rollback, or finalization occurred."
        : deploymentActivationExecutionNextItemStart?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, first execution item start, clinic activation, item completion, dependency progression, and next-item start are complete. Provider shell activation is blocked, skipped, or not applicable; no item completion, further dependency progression, binding, rollback, or finalization occurred."
        : deploymentActivationExecutionDependencyProgression?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, first execution item start, clinic activation, item completion, and dependency progression are complete, but next-item start is blocked. No provider/entity activation, second item completion, binding, rollback, or finalization occurred."
        : deploymentActivationExecutionItemCompletion?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, execution item start, clinic activation, and item completion are complete. Dependent unlock, binding, rollback, and finalization remain unavailable."
        : deploymentClinicActivation?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, execution item start, and clinic activation are complete, but item completion is blocked. No dependent unlock, binding, rollback, or finalization occurred."
        : deploymentActivationExecutionItemStart?.ok
        ? "Deployment run, draft clinic root, clinic settings, planned shells, hardware assignments, target validation, planned assignment resolution, deployment activation readiness, controlled activation plan, activation execution preparation, prepared execution persistence, activation execution ownership claim, atomic execution-session start, and execution item start are complete, but clinic activation is blocked. No item completion, dependency unlock, binding, rollback, or finalization occurred."
        : deploymentActivationExecutionStart?.ok
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
        deploymentActivationExecutionItemStart: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_START_NOT_ATTEMPTED,
        deploymentClinicActivation: DEPLOYMENT_CLINIC_ACTIVATION_NOT_ATTEMPTED,
        deploymentActivationExecutionItemCompletion: DEPLOYMENT_ACTIVATION_EXECUTION_ITEM_COMPLETION_NOT_ATTEMPTED,
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
function mapDeploymentActivationExecutionItemStartActionResult(
  result: Awaited<ReturnType<typeof startActivationExecutionItemForServerDeployment>>,
): DeploymentActivationExecutionItemStartActionResult {
  return {
    ok: result.ok,
    status: result.status,
    claimantId: result.claimantId,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    itemId: result.itemId,
    executionItemKey: result.executionItemKey,
    planItemKey: result.planItemKey,
    sequence: result.sequence,
    entityType: result.entityType,
    entityKey: result.entityKey,
    entityId: result.entityId,
    action: result.action,
    itemExecutionStatus: result.itemExecutionStatus,
    attemptCount: result.attemptCount,
    startedAt: result.startedAt,
    leaseExpiresAt: result.leaseExpiresAt,
    dependencyCount: result.dependencyCount,
    reversible: result.reversible,
    itemStartResult: result.itemStartResult,
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
function mapDeploymentActivationExecutionDependencyProgressionActionResult(
  result: Awaited<ReturnType<typeof progressActivationExecutionDependencyForServerDeployment>>,
): DeploymentActivationExecutionDependencyProgressionActionResult {
  return {
    ok: result.ok,
    status: result.status,
    claimantId: result.claimantId,
    clinicId: result.clinicId,
    deploymentRunId: result.deploymentRunId,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    completedItemId: result.completedItemId,
    completedExecutionItemKey: result.completedExecutionItemKey,
    completedPlanItemKey: result.completedPlanItemKey,
    completedSequence: result.completedSequence,
    completedStartedAt: result.completedStartedAt,
    completedCompletedAt: result.completedCompletedAt,
    completedAttemptCount: result.completedAttemptCount,
    nextItemId: result.nextItemId,
    nextExecutionItemKey: result.nextExecutionItemKey,
    nextPlanItemKey: result.nextPlanItemKey,
    nextSequence: result.nextSequence,
    nextEntityType: result.nextEntityType,
    nextEntityId: result.nextEntityId,
    nextAction: result.nextAction,
    nextAttemptCount: result.nextAttemptCount,
    statusBefore: result.statusBefore,
    statusAfter: result.statusAfter,
    progressionResult: result.progressionResult,
    issueCode: result.issueCode,
    progressedCount: result.progressedCount,
    reusedCount: result.reusedCount,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: {
      itemsReadied: result.downstream.itemsReadied,
      itemsStarted: result.downstream.itemsStarted,
      itemsSucceeded: result.downstream.itemsSucceeded,
      entitiesActivated: result.downstream.entitiesActivated,
      bindingsWritten: result.downstream.bindingsWritten,
      sessionsCompleted: result.downstream.sessionsCompleted,
      deploymentsFinalized: result.downstream.deploymentsFinalized,
      rollbacksExecuted: result.downstream.rollbacksExecuted,
    },
    message: result.message,
  };
}
function mapDeploymentActivationExecutionNextItemStartActionResult(
  result: Awaited<ReturnType<typeof startNextActivationExecutionItemForServerDeployment>>,
): DeploymentActivationExecutionNextItemStartActionResult {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    claimantId: result.claimantId,
    clinicId: result.clinicId,
    deploymentRunKey: result.deploymentRunKey,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    planKey: result.planKey,
    itemId: result.itemId,
    executionItemKey: result.executionItemKey,
    planItemKey: result.planItemKey,
    sequence: result.sequence,
    entityType: result.entityType,
    entityId: result.entityId,
    action: result.action,
    attemptCount: result.attemptCount,
    startedAt: result.startedAt,
    leaseExpiresAt: result.leaseExpiresAt,
    result: result.result,
    startedCount: result.startedCount,
    reusedCount: result.reusedCount,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: {
      itemsStarted: result.downstream.itemsStarted,
      itemsSucceeded: result.downstream.itemsSucceeded,
      entitiesActivated: result.downstream.entitiesActivated,
      bindingsWritten: result.downstream.bindingsWritten,
      itemsCompleted: result.downstream.itemsCompleted,
      dependenciesProgressed: result.downstream.dependenciesProgressed,
      finalized: result.downstream.finalized,
    },
  };
}
function mapDeploymentProviderShellExecutionItemCompletionActionResult(
  result: Awaited<ReturnType<typeof completeProviderShellExecutionItemForServerDeployment>>,
): DeploymentProviderShellExecutionItemCompletionActionResult {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    claimantId: result.claimantId,
    clinicId: result.clinicId,
    deploymentRunId: result.deploymentRunId,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    itemId: result.itemId,
    executionItemKey: result.executionItemKey,
    planItemKey: result.planItemKey,
    sequence: result.sequence,
    entityType: result.entityType,
    entityId: result.entityId,
    deploymentProviderKey: result.deploymentProviderKey,
    action: result.action,
    itemStatusBefore: result.itemStatusBefore,
    itemStatusAfter: result.itemStatusAfter,
    attemptCount: result.attemptCount,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    providerId: result.providerId,
    providerStatus: result.providerStatus,
    providerActive: result.providerActive,
    completionResult: result.completionResult,
    issueCode: result.issueCode,
    completedCount: result.completedCount,
    reusedCount: result.reusedCount,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    diagnostics: result.diagnostics,
    downstream: {
      itemsCompleted: result.downstream.itemsCompleted,
      dependenciesProgressed: result.downstream.dependenciesProgressed,
      nextItemsStarted: result.downstream.nextItemsStarted,
      providersActivated: result.downstream.providersActivated,
      sterilizersActivated: result.downstream.sterilizersActivated,
      workstationsActivated: result.downstream.workstationsActivated,
      hardwareActivated: result.downstream.hardwareActivated,
      bindingsWritten: result.downstream.bindingsWritten,
      sessionsCompleted: result.downstream.sessionsCompleted,
      rollbacksExecuted: result.downstream.rollbacksExecuted,
      deploymentFinalized: result.downstream.deploymentFinalized,
    },
  };
}
function mapDeploymentProviderShellActivationActionResult(
  result: Awaited<ReturnType<typeof activateProviderShellForServerDeployment>>,
): DeploymentProviderShellActivationActionResult {
  return {
    ok: result.ok,
    status: result.status,
    message: result.message,
    claimantId: result.claimantId,
    clinicId: result.clinicId,
    deploymentRunKey: result.deploymentRunKey,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    planKey: result.planKey,
    itemId: result.itemId,
    executionItemKey: result.executionItemKey,
    planItemKey: result.planItemKey,
    sequence: result.sequence,
    providerId: result.providerId,
    deploymentProviderKey: result.deploymentProviderKey,
    provisioningSourceBefore: result.provisioningSourceBefore,
    provisioningSourceAfter: result.provisioningSourceAfter,
    provisioningStatusBefore: result.provisioningStatusBefore,
    provisioningStatusAfter: result.provisioningStatusAfter,
    activeBefore: result.activeBefore,
    activeAfter: result.activeAfter,
    activatedAt: result.activatedAt,
    result: result.result,
    activatedCount: result.activatedCount,
    reusedCount: result.reusedCount,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: {
      providersActivated: result.downstream.providersActivated,
      itemsCompleted: result.downstream.itemsCompleted,
      dependenciesProgressed: result.downstream.dependenciesProgressed,
      bindingsWritten: result.downstream.bindingsWritten,
      sessionsCompleted: result.downstream.sessionsCompleted,
      rollbacksExecuted: result.downstream.rollbacksExecuted,
      deploymentFinalized: result.downstream.deploymentFinalized,
    },
  };
}
function mapDeploymentActivationExecutionItemCompletionActionResult(
  result: Awaited<ReturnType<typeof completeActivationExecutionItemForServerDeployment>>,
): DeploymentActivationExecutionItemCompletionActionResult {
  return {
    ok: result.ok,
    status: result.status,
    claimantId: result.claimantId,
    clinicId: result.clinicId,
    deploymentRunId: result.deploymentRunId,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    itemId: result.itemId,
    executionItemKey: result.executionItemKey,
    planItemKey: result.planItemKey,
    sequence: result.sequence,
    entityType: result.entityType,
    action: result.action,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    attemptCount: result.attemptCount,
    executionStatusBefore: result.executionStatusBefore,
    executionStatusAfter: result.executionStatusAfter,
    completionResult: result.completionResult,
    issueCode: result.issueCode,
    completedCount: result.completedCount,
    reusedCount: result.reusedCount,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: {
      itemsCompleted: result.downstream.itemsCompleted,
      dependenciesUnlocked: result.downstream.dependenciesUnlocked,
      providersActivated: result.downstream.providersActivated,
      sterilizersActivated: result.downstream.sterilizersActivated,
      workstationsActivated: result.downstream.workstationsActivated,
      hardwareActivated: result.downstream.hardwareActivated,
      bindingsWritten: result.downstream.bindingsWritten,
      deploymentFinalized: result.downstream.deploymentFinalized,
    },
    message: result.message,
  };
}

function mapDeploymentClinicActivationActionResult(
  result: Awaited<ReturnType<typeof activateClinicForServerDeployment>>,
): DeploymentClinicActivationActionResult {
  return {
    ok: result.ok,
    status: result.status,
    claimantId: result.claimantId,
    clinicId: result.clinicId,
    deploymentRunId: result.deploymentRunId,
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    itemId: result.itemId,
    executionItemKey: result.executionItemKey,
    planItemKey: result.planItemKey,
    currentClinicState: result.currentClinicState,
    targetClinicState: result.targetClinicState,
    deployedAt: result.deployedAt,
    activationResult: result.activationResult,
    activatedCount: result.activatedCount,
    reusedCount: result.reusedCount,
    conflicts: result.conflicts,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: {
      itemsSucceeded: result.downstream.itemsSucceeded,
      dependenciesUnlocked: result.downstream.dependenciesUnlocked,
      providersActivated: result.downstream.providersActivated,
      sterilizersActivated: result.downstream.sterilizersActivated,
      workstationsActivated: result.downstream.workstationsActivated,
      hardwareActivated: result.downstream.hardwareActivated,
      bindingsWritten: result.downstream.bindingsWritten,
      deploymentFinalized: result.downstream.deploymentFinalized,
    },
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
