import type { DeploymentActivationExecutionNextItemStartItemSnapshot } from "./deployment-activation-execution-next-item-start-types";
import type {
  DeploymentExecutionRecoveryCommand,
  DeploymentExecutionRecoveryCompensationClassification,
  DeploymentExecutionRecoveryFailure,
  DeploymentExecutionRecoveryIssue,
  DeploymentExecutionRecoveryIssueCode,
  DeploymentExecutionRecoveryMutationEvidence,
  DeploymentExecutionRecoveryResult,
  DeploymentExecutionRecoveryRollbackItem,
  DeploymentExecutionRecoveryRunningItem,
  DeploymentExecutionRecoverySafeDiagnostic,
} from "./deployment-recovery-types";

const SAFE_DIAGNOSTIC_KEYS = new Set([
  "operation",
  "status",
  "reason",
  "attempt",
  "sequence",
  "entityType",
  "action",
  "targetType",
  "retryAfterSeconds",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/;

export const DEPLOYMENT_EXECUTION_RECOVERY_COMPENSATION_MATRIX: readonly DeploymentExecutionRecoveryCompensationClassification[] = [
  unsupported("clinic", "activate"),
  unsupported("provider_shell", "activate"),
  unsupported("sterilizer_shell", "activate"),
  unsupported("workstation_shell", "activate"),
  unsupported("hardware_shell", "activate"),
  {
    entityType: "hardware_binding",
    action: "bind",
    support: "conditionally_supported",
    compensationAction: "remove_deployment_hardware_binding",
    reason: "Planning is safe only for a newly written binding with exact hardware and target identity evidence.",
  },
] as const;

export class DeploymentExecutionRecoveryService {
  decide(command: DeploymentExecutionRecoveryCommand): DeploymentExecutionRecoveryResult {
    return decideDeploymentExecutionRecovery(command);
  }
}

export function decideDeploymentExecutionRecovery(
  command: DeploymentExecutionRecoveryCommand,
): DeploymentExecutionRecoveryResult {
  try {
    return decide(command);
  } catch {
    return result(command, {
      status: "blocked",
      message: "Recovery planning was blocked by an unexpected internal error.",
      failure: null,
      issues: [issue("recovery_internal_error", "Recovery planning could not safely classify the supplied evidence.")],
      stoppedAtStage: "failure_validation",
    });
  }
}

function decide(command: DeploymentExecutionRecoveryCommand): DeploymentExecutionRecoveryResult {
  const failure = sanitizeFailure(command.failure, command.ownershipToken);
  if (!failure || !validTimestamp(command.requestedAt)) {
    return result(command, {
      status: "blocked",
      message: "Recovery planning requires valid sanitized failure evidence.",
      failure,
      issues: [issue("invalid_failure_evidence", "Failure evidence or the recovery request timestamp is invalid.")],
      stoppedAtStage: "failure_validation",
    });
  }

  if (!command.session) {
    return result(command, {
      status: "not_found",
      message: "The requested execution session was not found.",
      failure,
      issues: [issue("session_identity_mismatch", "The requested execution session was not found.")],
      stoppedAtStage: "identity_validation",
    });
  }
  if (!command.prepared) {
    return result(command, {
      status: "not_found",
      message: "Prepared execution evidence was not found.",
      failure,
      issues: [issue("prepared_item_missing", "Prepared execution evidence was not found.")],
      stoppedAtStage: "identity_validation",
    });
  }

  const identityIssues = validateTopLevelIdentity(command);
  if (identityIssues.length > 0) {
    return result(command, {
      status: "blocked",
      message: "Recovery planning was blocked by execution identity evidence.",
      failure,
      issues: identityIssues,
      stoppedAtStage: "identity_validation",
    });
  }

  const snapshotIssues = validateItemSnapshots(command);
  if (snapshotIssues.length > 0) {
    return result(command, {
      status: "blocked",
      message: "Recovery planning was blocked by inconsistent execution-item evidence.",
      failure,
      issues: snapshotIssues,
      stoppedAtStage: "snapshot_validation",
    });
  }

  const failedItem = findFailedItem(command, failure);
  if (failureIdentifiesItem(failure) && !failedItem) {
    return result(command, {
      status: "not_found",
      message: "The failed execution item was not found in the exact execution snapshot.",
      failure,
      issues: [issue("failed_item_not_found", "The failed execution item was not found.")],
      stoppedAtStage: "snapshot_validation",
    });
  }

  const mutationCandidates = command.items
    .map((entry) => entry.item)
    .filter(isMutationLifecycle);
  const evidenceByItem = uniqueEvidence(command.mutationEvidence);
  const evidenceIssues: DeploymentExecutionRecoveryIssue[] = [];

  for (const item of mutationCandidates) {
    const evidence = evidenceByItem.get(item.executionItemKey);
    const completedItemWithoutMutationEvidence =
      item.executionStatus === "succeeded" &&
      (!evidence || evidence.disposition === "not_applied");
    const malformedSuccessfulMutationEvidence =
      evidence !== undefined &&
      evidence.disposition !== "not_applied" &&
      !validTimestamp(evidence.completedAt);
    if (completedItemWithoutMutationEvidence || malformedSuccessfulMutationEvidence) {
      evidenceIssues.push(itemIssue("mutation_evidence_missing", item, "A completed mutation requires exact successful mutation evidence."));
    }
  }
  if (evidenceIssues.length > 0) {
    return result(command, {
      status: "blocked",
      message: "Recovery planning was blocked because mutation evidence is incomplete.",
      failure,
      failedItem,
      issues: evidenceIssues,
      stoppedAtStage: "plan_construction",
    });
  }

  const applied = mutationCandidates.filter((item) => {
    const evidence = evidenceByItem.get(item.executionItemKey);
    return evidence?.disposition === "applied" && validTimestamp(evidence.completedAt);
  });
  const rollbackItems: DeploymentExecutionRecoveryRollbackItem[] = [];
  const unsupportedCompensations: DeploymentExecutionRecoveryCompensationClassification[] = [];
  const constructionIssues: DeploymentExecutionRecoveryIssue[] = [];

  for (const item of [...applied].sort((left, right) => right.sequence - left.sequence)) {
    const classification = compensationFor(item.entityType, item.action);
    const evidence = evidenceByItem.get(item.executionItemKey)!;
    if (!classification) {
      const unknown = unsupportedFor(item.entityType, item.action);
      unsupportedCompensations.push(unknown);
      constructionIssues.push(itemIssue("unsupported_compensation", item, unknown.reason, "warning"));
      rollbackItems.push(rollbackItem(command, item, rollbackItems.length + 1, unknown, false));
      continue;
    }
    if (classification.support === "conditionally_supported") {
      if (!validBindingEvidence(item, evidence)) {
        constructionIssues.push(itemIssue("binding_identity_incomplete", item, "Exact newly written Hardware Binding identity evidence is incomplete."));
        return result(command, {
          status: "blocked",
          message: "Recovery planning cannot safely identify the Hardware Binding compensation target.",
          failure,
          failedItem,
          issues: constructionIssues,
          stoppedAtStage: "plan_construction",
        });
      }
      rollbackItems.push(rollbackItem(command, item, rollbackItems.length + 1, classification, true));
      continue;
    }
    if (classification.support === "unsupported") {
      if (!unsupportedCompensations.some((current) => current.entityType === classification.entityType && current.action === classification.action)) {
        unsupportedCompensations.push(classification);
      }
      constructionIssues.push(itemIssue("unsupported_compensation", item, classification.reason, "warning"));
      rollbackItems.push(rollbackItem(command, item, rollbackItems.length + 1, classification, false));
      continue;
    }
    rollbackItems.push(rollbackItem(command, item, rollbackItems.length + 1, classification, true));
  }

  const runningItemsToRecover = command.items
    .map((entry) => entry.item)
    .filter((item) => item.executionStatus === "running")
    .sort((left, right) => left.sequence - right.sequence)
    .map(runningItem);
  const rollbackRequired = rollbackItems.length > 0;
  const rollbackExecutable = rollbackRequired && rollbackItems.every((item) => item.reversible);

  return result(command, {
    status: rollbackRequired ? "rollback_required" : "rollback_not_required",
    message: rollbackRequired
      ? rollbackExecutable
        ? "Deterministic rollback planning is required and all planned compensations are executable by contract."
        : "Rollback is required, but one or more compensations are not yet executable."
      : "No completed durable deployment mutation requires rollback.",
    failure,
    failedItem,
    rollbackItems,
    unsupportedCompensations,
    runningItemsToRecover,
    rollbackRequired,
    rollbackExecutable,
    completedMutationCount: applied.length,
    reversibleMutationCount: rollbackItems.filter((item) => item.reversible).length,
    issues: constructionIssues,
    stoppedAtStage: "decision_complete",
  });
}

function validateTopLevelIdentity(command: DeploymentExecutionRecoveryCommand): DeploymentExecutionRecoveryIssue[] {
  const issues: DeploymentExecutionRecoveryIssue[] = [];
  const session = command.session!;
  const prepared = command.prepared!;
  compareIdentity(command.clinicId, [session.clinicId, prepared.clinicId], "clinic_identity_mismatch", "Clinic identity does not match recovery evidence.", issues);
  compareIdentity(command.deploymentRunKey, [session.deploymentRunKey, prepared.deploymentRunKey], "deployment_run_identity_mismatch", "Deployment-run identity does not match recovery evidence.", issues);
  compareIdentity(command.sessionId, [session.sessionId], "session_identity_mismatch", "Session identity does not match recovery evidence.", issues);
  compareIdentity(command.executionKey, [session.executionKey, prepared.executionKey], "execution_identity_mismatch", "Execution identity does not match recovery evidence.", issues);
  compareIdentity(command.planKey, [session.planKey, prepared.planKey], "plan_identity_mismatch", "Plan identity does not match recovery evidence.", issues);
  compareIdentity(command.claimantId, [session.executionOwner], "claimant_identity_mismatch", "Claimant identity does not match session ownership.", issues);
  compareIdentity(command.ownershipToken, [session.ownershipToken], "ownership_token_mismatch", "Ownership-token evidence does not match session ownership.", issues);
  compareIdentity(command.expectedLeaseExpiresAt, [session.leaseExpiresAt], "lease_identity_mismatch", "Lease identity does not match the execution snapshot.", issues);
  if (!validTimestamp(command.expectedLeaseExpiresAt) || !validTimestamp(command.requestedAt)) {
    issues.push(issue("lease_identity_mismatch", "Lease or request timestamp is malformed."));
  }
  return dedupeIssues(issues);
}

function validateItemSnapshots(command: DeploymentExecutionRecoveryCommand): DeploymentExecutionRecoveryIssue[] {
  const issues: DeploymentExecutionRecoveryIssue[] = [];
  const prepared = new Map(command.prepared!.items.map((item) => [item.executionItemKey, item]));
  const sequences = new Set<number>();
  const executionKeys = new Set<string>();
  const planKeys = new Set<string>();
  if (
    command.session!.itemsRequested !== command.prepared!.items.length ||
    command.items.length !== command.prepared!.items.length
  ) {
    issues.push(issue("prepared_item_missing", "Prepared, session, and current execution-item counts must match."));
  }
  for (const entry of [...command.items].sort((left, right) => left.item.sequence - right.item.sequence)) {
    const item = entry.item;
    if (sequences.has(item.sequence)) issues.push(itemIssue("duplicate_execution_sequence", item, "Execution-item sequences must be unique."));
    sequences.add(item.sequence);
    if (executionKeys.has(item.executionItemKey) || planKeys.has(item.planItemKey)) issues.push(itemIssue("foreign_execution_item", item, "Execution-item identities must be unique."));
    executionKeys.add(item.executionItemKey);
    planKeys.add(item.planItemKey);
    if (entry.clinicId !== command.clinicId) issues.push(itemIssue("clinic_identity_mismatch", item, "Execution item belongs to a different clinic."));
    if (entry.deploymentRunKey !== command.deploymentRunKey) issues.push(itemIssue("deployment_run_identity_mismatch", item, "Execution item belongs to a different deployment run."));
    if (entry.sessionId !== command.sessionId) issues.push(itemIssue("session_identity_mismatch", item, "Execution item belongs to a different session."));
    if (entry.executionKey !== command.executionKey) issues.push(itemIssue("execution_identity_mismatch", item, "Execution item belongs to a different execution."));
    if (entry.planKey !== command.planKey) issues.push(itemIssue("plan_identity_mismatch", item, "Execution item belongs to a different plan."));
    const source = prepared.get(item.executionItemKey);
    if (!source) {
      issues.push(itemIssue("prepared_item_missing", item, "Execution item is absent from prepared execution evidence."));
    } else if (
      source.planItemKey !== item.planItemKey ||
      source.sequence !== item.sequence ||
      source.entityType !== item.entityType ||
      source.entityId !== item.entityId ||
      source.action !== item.action
    ) {
      issues.push(itemIssue("foreign_execution_item", item, "Execution-item identity differs from prepared evidence."));
    }
  }
  for (const source of command.prepared!.items) {
    if (!executionKeys.has(source.executionItemKey)) {
      issues.push({
        ...issue("prepared_item_missing", "A prepared execution item is absent from the current execution snapshot."),
        executionItemKey: source.executionItemKey,
        planItemKey: source.planItemKey,
        sequence: source.sequence,
        entityType: source.entityType,
        entityId: source.entityId,
      });
    }
  }
  const evidenceKeys = new Set<string>();
  for (const evidence of command.mutationEvidence) {
    if (evidenceKeys.has(evidence.sourceExecutionItemKey) || !executionKeys.has(evidence.sourceExecutionItemKey)) {
      issues.push(issue("foreign_execution_item", "Mutation evidence must identify one unique item in the exact execution snapshot."));
    }
    evidenceKeys.add(evidence.sourceExecutionItemKey);
  }
  return dedupeIssues(issues);
}

function sanitizeFailure(input: DeploymentExecutionRecoveryCommand["failure"], ownershipToken: string): DeploymentExecutionRecoveryFailure | null {
  if (!input || typeof input !== "object") return null;
  if (!safeIdentifier(input.failureCode) || !safeIdentifier(input.failureLayer) || !validTimestamp(input.failedAt)) return null;
  const optionalStrings = [input.failedExecutionItemKey, input.failedPlanItemKey, input.failedEntityType, input.failedEntityId, input.failedAction];
  if (optionalStrings.some((value) => value !== undefined && value !== null && !safeIdentifier(value))) return null;
  if (input.failedSequence !== undefined && input.failedSequence !== null && (!Number.isInteger(input.failedSequence) || Number(input.failedSequence) < 1)) return null;
  if (input.retryable !== undefined && typeof input.retryable !== "boolean") return null;
  const diagnostics: Record<string, DeploymentExecutionRecoverySafeDiagnostic> = {};
  if (isRecord(input.diagnostics)) {
    for (const key of [...SAFE_DIAGNOSTIC_KEYS].sort()) {
      const value = input.diagnostics[key];
      if ((value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") && (typeof value !== "string" || !ownershipToken || !value.includes(ownershipToken))) diagnostics[key] = value;
    }
  }
  return {
    failureCode: input.failureCode,
    failureLayer: input.failureLayer,
    failedAt: input.failedAt,
    message: "Deployment execution failure classified for recovery planning.",
    failedExecutionItemKey: stringOrNull(input.failedExecutionItemKey),
    failedPlanItemKey: stringOrNull(input.failedPlanItemKey),
    failedSequence: typeof input.failedSequence === "number" ? input.failedSequence : null,
    failedEntityType: stringOrNull(input.failedEntityType),
    failedEntityId: stringOrNull(input.failedEntityId),
    failedAction: stringOrNull(input.failedAction),
    retryable: input.retryable === true,
    diagnostics,
  };
}

function findFailedItem(command: DeploymentExecutionRecoveryCommand, failure: DeploymentExecutionRecoveryFailure) {
  const matches = command.items.map((entry) => entry.item).filter((item) =>
    (failure.failedExecutionItemKey === null || item.executionItemKey === failure.failedExecutionItemKey) &&
    (failure.failedPlanItemKey === null || item.planItemKey === failure.failedPlanItemKey) &&
    (failure.failedSequence === null || item.sequence === failure.failedSequence) &&
    (failure.failedEntityType === null || item.entityType === failure.failedEntityType) &&
    (failure.failedEntityId === null || item.entityId === failure.failedEntityId) &&
    (failure.failedAction === null || item.action === failure.failedAction));
  return matches.length === 1 ? identity(matches[0]) : null;
}

function failureIdentifiesItem(failure: DeploymentExecutionRecoveryFailure): boolean {
  return failure.failedExecutionItemKey !== null || failure.failedPlanItemKey !== null || failure.failedSequence !== null;
}

function isMutationLifecycle(item: DeploymentActivationExecutionNextItemStartItemSnapshot): boolean {
  return compensationFor(item.entityType, item.action) !== null;
}

function validBindingEvidence(item: DeploymentActivationExecutionNextItemStartItemSnapshot, evidence: DeploymentExecutionRecoveryMutationEvidence): boolean {
  const binding = evidence.hardwareBinding;
  if (!binding || evidence.disposition !== "applied" || binding.previousTargetId !== null) return false;
  if (!UUID_PATTERN.test(binding.hardwareId) || !UUID_PATTERN.test(binding.targetId)) return false;
  const expected = item.expectedCurrentState;
  const target = item.targetState;
  if (!expected || !target) return false;
  return item.entityId === binding.hardwareId &&
    expected.deploymentHardwareKey === binding.deploymentHardwareKey &&
    expected.hardwareId === binding.hardwareId &&
    expected.targetId === null &&
    target.hardwareId === binding.hardwareId &&
    target.targetId === binding.targetId &&
    target.targetType === binding.targetType &&
    target.targetDeploymentKey === binding.targetDeploymentKey;
}

function rollbackItem(
  command: DeploymentExecutionRecoveryCommand,
  item: DeploymentActivationExecutionNextItemStartItemSnapshot,
  rollbackSequence: number,
  classification: DeploymentExecutionRecoveryCompensationClassification,
  reversible: boolean,
): DeploymentExecutionRecoveryRollbackItem {
  return {
    rollbackItemKey: `${command.executionKey}:rollback:${item.executionItemKey}`,
    sourceExecutionItemKey: item.executionItemKey,
    sourcePlanItemKey: item.planItemKey,
    sourceSequence: item.sequence,
    rollbackSequence,
    entityType: item.entityType,
    entityId: item.entityId,
    originalAction: item.action,
    compensationAction: reversible ? classification.compensationAction : null,
    compensationReason: classification.reason,
    expectedCurrentState: cloneRecord(item.targetState),
    expectedPriorState: cloneRecord(item.expectedCurrentState),
    reversible,
    blockedReason: reversible ? null : classification.reason,
  };
}

function runningItem(item: DeploymentActivationExecutionNextItemStartItemSnapshot): DeploymentExecutionRecoveryRunningItem {
  return { ...identity(item), recoveryControl: "cancel_or_reset_required" };
}

function identity(item: DeploymentActivationExecutionNextItemStartItemSnapshot) {
  return {
    executionItemKey: item.executionItemKey,
    planItemKey: item.planItemKey,
    sequence: item.sequence,
    entityType: item.entityType,
    entityId: item.entityId,
    action: item.action,
  };
}

function result(command: DeploymentExecutionRecoveryCommand, input: Partial<DeploymentExecutionRecoveryResult> & Pick<DeploymentExecutionRecoveryResult, "status" | "message" | "stoppedAtStage">): DeploymentExecutionRecoveryResult {
  const rollbackItems = input.rollbackItems ?? [];
  const unsupportedCompensations = input.unsupportedCompensations ?? [];
  const runningItemsToRecover = input.runningItemsToRecover ?? [];
  const failure = input.failure ?? null;
  return {
    ok: input.status === "rollback_required" || input.status === "rollback_not_required",
    status: input.status,
    message: input.message,
    clinicId: command.clinicId,
    deploymentRunKey: command.deploymentRunKey,
    sessionId: command.sessionId,
    executionKey: command.executionKey,
    planKey: command.planKey,
    failure,
    failedItem: input.failedItem ?? null,
    rollbackRequired: input.rollbackRequired ?? input.status === "rollback_required",
    rollbackExecutable: input.rollbackExecutable ?? false,
    rollbackItems,
    unsupportedCompensations,
    runningItemsToRecover,
    completedMutationCount: input.completedMutationCount ?? 0,
    reversibleMutationCount: input.reversibleMutationCount ?? 0,
    issues: sortIssues(input.issues ?? []),
    stoppedAtStage: input.stoppedAtStage,
    downstream: {
      failuresClassified: failure ? 1 : 0,
      rollbackItemsPlanned: rollbackItems.length,
      unsupportedCompensations: unsupportedCompensations.length,
      runningItemsIdentified: runningItemsToRecover.length,
      rollbackExecuted: 0,
      entitiesCompensated: 0,
      bindingsRemoved: 0,
      sessionsRecovered: 0,
      finalized: 0,
    },
  };
}

function compensationFor(entityType: string, action: string) {
  return DEPLOYMENT_EXECUTION_RECOVERY_COMPENSATION_MATRIX.find((entry) => entry.entityType === entityType && entry.action === action) ?? null;
}

function unsupported(entityType: DeploymentExecutionRecoveryCompensationClassification["entityType"], action: "activate"): DeploymentExecutionRecoveryCompensationClassification {
  return { entityType, action, support: "unsupported", compensationAction: null, reason: `No atomic ${entityType}:${action} compensation boundary exists in RC10.9A.` };
}

function unsupportedFor(entityType: string, action: string): DeploymentExecutionRecoveryCompensationClassification {
  return { entityType: entityType as DeploymentExecutionRecoveryCompensationClassification["entityType"], action: action as "activate", support: "unsupported", compensationAction: null, reason: `No supported compensation contract exists for ${entityType}:${action}.` };
}

function uniqueEvidence(evidence: readonly DeploymentExecutionRecoveryMutationEvidence[]) {
  const map = new Map<string, DeploymentExecutionRecoveryMutationEvidence>();
  for (const current of evidence) if (!map.has(current.sourceExecutionItemKey)) map.set(current.sourceExecutionItemKey, current);
  return map;
}

function compareIdentity(expected: string, actual: readonly (string | null)[], code: DeploymentExecutionRecoveryIssueCode, message: string, issues: DeploymentExecutionRecoveryIssue[]) {
  if (!safeIdentifier(expected) || actual.some((value) => value !== expected)) issues.push(issue(code, message));
}

function issue(code: DeploymentExecutionRecoveryIssueCode, message: string, severity: "blocker" | "warning" = "blocker"): DeploymentExecutionRecoveryIssue {
  return { code, severity, message, executionItemKey: null, planItemKey: null, sequence: null, entityType: null, entityId: null };
}

function itemIssue(code: DeploymentExecutionRecoveryIssueCode, item: DeploymentActivationExecutionNextItemStartItemSnapshot, message: string, severity: "blocker" | "warning" = "blocker"): DeploymentExecutionRecoveryIssue {
  return { code, severity, message, ...identity(item) };
}

function sortIssues(issues: readonly DeploymentExecutionRecoveryIssue[]) {
  return [...issues].sort((left, right) => `${left.sequence ?? 0}:${left.code}:${left.executionItemKey ?? ""}`.localeCompare(`${right.sequence ?? 0}:${right.code}:${right.executionItemKey ?? ""}`));
}

function dedupeIssues(issues: readonly DeploymentExecutionRecoveryIssue[]) {
  const seen = new Set<string>();
  return sortIssues(issues).filter((current) => {
    const key = `${current.code}:${current.executionItemKey ?? ""}:${current.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER_PATTERN.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneRecord(value: Record<string, unknown> | null): Record<string, unknown> {
  return value ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : {};
}
