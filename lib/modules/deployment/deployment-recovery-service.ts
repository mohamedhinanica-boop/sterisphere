import { hashDeploymentCanonicalPayload } from "./deployment-draft";
import { isValidIdempotencyKey } from "./deployment-idempotency";
import type { DeploymentRecoveryRepository } from "./deployment-recovery-repository";
import type {
  DeploymentRecoveryPersistenceCommand,
  DeploymentRecoveryPersistenceDownstreamCounts,
  DeploymentRecoveryPersistenceInput,
  DeploymentRecoveryPersistenceIssue,
  DeploymentRecoveryPersistenceIssueCode,
  DeploymentRecoveryPersistenceRepositoryResult,
  DeploymentRecoveryPersistenceServiceResult,
  DeploymentRecoveryPersistenceServiceStatus,
} from "./deployment-recovery-persistence-types";
import type {
  DeploymentExecutionRecoveryCompensationClassification,
  DeploymentExecutionRecoveryFailure,
  DeploymentExecutionRecoveryIssue,
  DeploymentExecutionRecoveryRollbackItem,
  DeploymentExecutionRecoveryRunningItem,
  DeploymentExecutionRecoveryStatus,
} from "./deployment-recovery-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HARDWARE_KEY = /^hardware-[0-9]{3}$/;
const WORKSTATION_KEY = /^workstation-[0-9]{3}$/;
const STERILIZER_KEY = /^sterilizer-[0-9]{3}$/;
const RECOVERY_STATUSES = new Set<DeploymentExecutionRecoveryStatus>([
  "rollback_required", "rollback_not_required", "blocked", "not_found",
]);
const SAFE_DIAGNOSTIC_KEYS = new Set([
  "operation", "status", "reason", "attempt", "sequence",
  "entityType", "action", "targetType", "retryAfterSeconds",
]);
const FORBIDDEN_KEYS = /^(stack|sql|hint|details|ownershipToken|ownership_token|claimantToken|serviceRoleKey|credentials|headers|rawException|rawPayload)$/i;

export class DeploymentRecoveryPersistenceService {
  constructor(private readonly repository: DeploymentRecoveryRepository) {}

  async persistRecoveryDecision(
    input: DeploymentRecoveryPersistenceInput,
  ): Promise<DeploymentRecoveryPersistenceServiceResult> {
    const built = buildDeploymentRecoveryPersistenceCommand(input);
    if (!built.command) {
      return serviceResult(input, {
        status: "blocked",
        recoveryKey: built.recoveryKey,
        payloadHash: built.payloadHash,
        issues: built.issues,
        issueCode: built.issues[0]?.code ?? "unsafe_recovery_evidence",
        stoppedAtStage: "validation",
        message: "Recovery persistence validation blocked unsafe or inconsistent evidence.",
      });
    }

    let repositoryResult: DeploymentRecoveryPersistenceRepositoryResult;
    try {
      repositoryResult = await this.repository.persistRecoveryPlan(built.command);
    } catch {
      return serviceResult(input, {
        status: "repository_error",
        recoveryKey: built.command.recoveryKey,
        payloadHash: built.command.payloadHash,
        issues: [persistenceIssue("repository_error", "Recovery persistence repository failed unexpectedly.")],
        issueCode: "repository_error",
        stoppedAtStage: "repository",
        message: "Recovery persistence repository failed safely.",
      });
    }

    return mapRepositoryResult(input, built.command, repositoryResult);
  }
}

export interface DeploymentRecoveryPersistenceCommandBuildResult {
  command: DeploymentRecoveryPersistenceCommand | null;
  recoveryKey: string | null;
  payloadHash: string | null;
  issues: readonly DeploymentRecoveryPersistenceIssue[];
}

export function buildDeploymentRecoveryPersistenceCommand(
  input: DeploymentRecoveryPersistenceInput,
): DeploymentRecoveryPersistenceCommandBuildResult {
  const issues = validateInput(input);
  const recovery = input.recovery;
  if (!recovery.failure) {
    if (!issues.some((current) => current.code === "recovery_failure_missing")) {
      issues.push(persistenceIssue("recovery_failure_missing", "Sanitized failure evidence is required by the persistence contract."));
    }
    return { command: null, recoveryKey: null, payloadHash: null, issues: sortIssues(issues) };
  }

  const rollbackItems = normalizeRollbackItems(recovery.rollbackItems);
  const runningItemsToRecover = normalizeRunningItems(recovery.runningItemsToRecover);
  const unsupportedCompensations = normalizeCompensations(recovery.unsupportedCompensations);
  const recoveryIssues = normalizeRecoveryIssues(recovery.issues);
  const recoveryKey = deriveDeploymentRecoveryKey(input, recovery.failure);
  const idempotencyKey = recoveryKey;
  const evidence = {
    message: recovery.message,
    failedItem: recovery.failedItem ? clone(recovery.failedItem) : null,
    issues: recoveryIssues,
    stoppedAtStage: recovery.stoppedAtStage,
  };
  const normalizedPayload = {
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    recoveryStatus: recovery.status,
    rollbackRequired: recovery.rollbackRequired,
    rollbackExecutable: recovery.rollbackExecutable,
    sanitizedFailure: clone(recovery.failure),
    unsupportedCompensations,
    runningItemsToRecover,
    completedMutationCount: recovery.completedMutationCount,
    reversibleMutationCount: recovery.reversibleMutationCount,
    downstream: clone(recovery.downstream),
    evidence,
    rollbackItems,
  };
  const payloadHash = hashDeploymentCanonicalPayload(normalizedPayload, "recovery-payload");

  if (!isValidIdempotencyKey(idempotencyKey)) {
    issues.push(persistenceIssue("idempotency_key_mismatch", "Derived recovery idempotency identity is invalid."));
  }
  if (input.expectedRecoveryKey && input.expectedRecoveryKey !== recoveryKey) {
    issues.push(persistenceIssue("recovery_key_mismatch", "Expected recovery key does not match the deterministic recovery identity."));
  }
  if (input.expectedIdempotencyKey && input.expectedIdempotencyKey !== idempotencyKey) {
    issues.push(persistenceIssue("idempotency_key_mismatch", "Expected idempotency key does not match the deterministic recovery identity."));
  }
  if (input.expectedPayloadHash && input.expectedPayloadHash !== payloadHash) {
    issues.push(persistenceIssue("payload_hash_mismatch", "Expected payload hash does not match normalized recovery evidence."));
  }

  if (issues.some((current) => current.severity === "blocker")) {
    return { command: null, recoveryKey, payloadHash, issues: sortIssues(issues) };
  }

  return {
    command: {
      ...normalizedPayload,
      recoveryKey,
      idempotencyKey,
      payloadHash,
    },
    recoveryKey,
    payloadHash,
    issues: [],
  };
}

export function deriveDeploymentRecoveryKey(
  input: DeploymentRecoveryPersistenceInput,
  failure: DeploymentExecutionRecoveryFailure,
): string {
  const identityHash = hashDeploymentCanonicalPayload({
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    failureCode: failure.failureCode,
    failureLayer: failure.failureLayer,
    failedAt: failure.failedAt,
    failedExecutionItemKey: failure.failedExecutionItemKey,
    failedPlanItemKey: failure.failedPlanItemKey,
    failedSequence: failure.failedSequence,
  }, "recovery");
  return `deployment-recovery:${identityHash.slice("recovery-".length)}`;
}

function validateInput(input: DeploymentRecoveryPersistenceInput): DeploymentRecoveryPersistenceIssue[] {
  const issues: DeploymentRecoveryPersistenceIssue[] = [];
  const recovery = input.recovery;
  compare(input.clinicId, recovery.clinicId, "clinic_identity_mismatch", "Clinic identity does not match the recovery decision.", issues);
  compare(input.deploymentRunKey, recovery.deploymentRunKey, "deployment_run_identity_mismatch", "Deployment-run identity does not match the recovery decision.", issues);
  compare(input.sessionId, recovery.sessionId, "session_identity_mismatch", "Session identity does not match the recovery decision.", issues);
  compare(input.executionKey, recovery.executionKey, "execution_identity_mismatch", "Execution identity does not match the recovery decision.", issues);
  compare(input.planKey, recovery.planKey, "plan_identity_mismatch", "Plan identity does not match the recovery decision.", issues);

  if (!RECOVERY_STATUSES.has(recovery.status)) {
    issues.push(persistenceIssue("recovery_status_invalid", "Recovery status is unsupported."));
  }
  if (!recovery.failure) {
    issues.push(persistenceIssue("recovery_failure_missing", "Sanitized failure evidence is required."));
  } else if (!safeFailure(recovery.failure)) {
    issues.push(persistenceIssue("unsafe_recovery_evidence", "Failure evidence contains unsafe or malformed diagnostics."));
  }
  if (recovery.rollbackRequired !== (recovery.status === "rollback_required")) {
    issues.push(persistenceIssue("rollback_required_inconsistent", "rollbackRequired does not match recovery status semantics."));
  }
  if (recovery.rollbackExecutable && !recovery.rollbackRequired) {
    issues.push(persistenceIssue("rollback_executable_inconsistent", "Only a rollback-required decision can be executable."));
  }
  if (
    !Number.isInteger(recovery.completedMutationCount) || recovery.completedMutationCount < 0 ||
    !Number.isInteger(recovery.reversibleMutationCount) || recovery.reversibleMutationCount < 0 ||
    recovery.reversibleMutationCount > recovery.completedMutationCount
  ) {
    issues.push(persistenceIssue("mutation_counter_invalid", "Recovery mutation counters are invalid."));
  }

  validateRollbackItems(recovery.rollbackItems, recovery.runningItemsToRecover, issues);
  const reversibleCount = recovery.rollbackItems.filter((item) => item.reversible).length;
  if (recovery.reversibleMutationCount !== reversibleCount) {
    issues.push(persistenceIssue("mutation_counter_invalid", "Reversible mutation count does not match rollback items."));
  }
  if (recovery.status === "rollback_not_required" && recovery.rollbackItems.length > 0) {
    issues.push(persistenceIssue("rollback_required_inconsistent", "rollback_not_required decisions cannot contain rollback items."));
  }
  if (recovery.status === "not_found" && recovery.rollbackItems.length > 0) {
    issues.push(persistenceIssue("rollback_required_inconsistent", "not_found decisions cannot contain rollback items."));
  }
  if (recovery.status === "blocked" && recovery.rollbackExecutable) {
    issues.push(persistenceIssue("rollback_executable_inconsistent", "Blocked recovery decisions cannot be executable."));
  }
  if (recovery.rollbackExecutable && (
    recovery.rollbackItems.length === 0 ||
    recovery.rollbackItems.some((item) => !item.reversible || item.blockedReason !== null || !item.compensationAction) ||
    recovery.unsupportedCompensations.length > 0
  )) {
    issues.push(persistenceIssue("rollback_executable_inconsistent", "Executable rollback evidence contains blocked or unsupported compensation."));
  }
  if (recovery.rollbackRequired && !recovery.rollbackExecutable && recovery.rollbackItems.length > 0 &&
      recovery.rollbackItems.every((item) => item.reversible && item.blockedReason === null) &&
      recovery.unsupportedCompensations.length === 0) {
    issues.push(persistenceIssue("rollback_executable_inconsistent", "Non-executable rollback evidence lacks a blocking explanation."));
  }
  if (!safeObject(recovery)) {
    issues.push(persistenceIssue("unsafe_recovery_evidence", "Recovery evidence contains forbidden fields or unsupported values."));
  }
  if (!zeroExecutionCounters(recovery.downstream)) {
    issues.push(persistenceIssue("unsafe_recovery_evidence", "RC10.9A execution counters must remain zero before persistence."));
  }
  return dedupeIssues(issues);
}

function validateRollbackItems(
  rollbackItems: readonly DeploymentExecutionRecoveryRollbackItem[],
  runningItems: readonly DeploymentExecutionRecoveryRunningItem[],
  issues: DeploymentRecoveryPersistenceIssue[],
): void {
  const keys = new Set<string>();
  const rollbackSequences = new Set<number>();
  const sourceItems = new Set<string>();
  const sourceSequences = new Set<number>();
  const runningKeys = new Set(runningItems.map((item) => item.executionItemKey));
  const normalized = normalizeRollbackItems(rollbackItems);

  for (const item of rollbackItems) {
    if (!item.rollbackItemKey || !item.sourceExecutionItemKey || !item.sourcePlanItemKey || !item.entityType || !item.originalAction || !item.compensationReason) {
      issues.push(itemIssue("rollback_item_identity_invalid", item, "Rollback item identity is incomplete."));
    }
    if (keys.has(item.rollbackItemKey)) issues.push(itemIssue("duplicate_rollback_item_key", item, "Rollback item key is duplicated."));
    if (rollbackSequences.has(item.rollbackSequence)) issues.push(itemIssue("duplicate_rollback_sequence", item, "Rollback sequence is duplicated."));
    if (sourceItems.has(item.sourceExecutionItemKey)) issues.push(itemIssue("duplicate_source_execution_item", item, "Source execution item is duplicated."));
    if (sourceSequences.has(item.sourceSequence)) issues.push(itemIssue("duplicate_source_sequence", item, "Source sequence is duplicated."));
    keys.add(item.rollbackItemKey);
    rollbackSequences.add(item.rollbackSequence);
    sourceItems.add(item.sourceExecutionItemKey);
    sourceSequences.add(item.sourceSequence);
    if (runningKeys.has(item.sourceExecutionItemKey)) {
      issues.push(itemIssue("running_item_mixed_with_rollback", item, "Running execution-control evidence cannot be persisted as a rollback child."));
    }
    if (item.entityType === "hardware_binding" && !validHardwareBindingRollback(item)) {
      issues.push(itemIssue("hardware_binding_compensation_invalid", item, "Hardware Binding rollback identity is incomplete, reused, or conflicting."));
    }
  }
  for (let index = 0; index < normalized.length; index += 1) {
    const item = normalized[index];
    if (item.rollbackSequence !== index + 1 || (index > 0 && normalized[index - 1].sourceSequence <= item.sourceSequence)) {
      issues.push(itemIssue("rollback_order_invalid", item, "Rollback order must use contiguous rollback sequences and strictly descending source sequences."));
    }
  }
}

function validHardwareBindingRollback(item: DeploymentExecutionRecoveryRollbackItem): boolean {
  const current = item.expectedCurrentState;
  const prior = item.expectedPriorState;
  const targetType = current.targetType;
  return item.originalAction === "bind" &&
    item.reversible &&
    item.compensationAction === "remove_deployment_hardware_binding" &&
    item.blockedReason === null &&
    typeof item.entityId === "string" && UUID.test(item.entityId) &&
    current.hardwareId === item.entityId && prior.hardwareId === item.entityId &&
    typeof current.targetId === "string" && UUID.test(current.targetId) &&
    prior.targetId === null &&
    typeof prior.deploymentHardwareKey === "string" && HARDWARE_KEY.test(prior.deploymentHardwareKey) &&
    (targetType === "workstation" || targetType === "sterilizer") &&
    prior.targetType === targetType &&
    current.targetDeploymentKey === prior.targetDeploymentKey &&
    typeof current.targetDeploymentKey === "string" &&
    (targetType === "workstation" ? WORKSTATION_KEY : STERILIZER_KEY).test(current.targetDeploymentKey);
}

function safeFailure(failure: DeploymentExecutionRecoveryFailure): boolean {
  if (
    failure.message !== "Deployment execution failure classified for recovery planning." ||
    !failure.failureCode || !failure.failureLayer || !Number.isFinite(Date.parse(failure.failedAt)) ||
    !isRecord(failure.diagnostics)
  ) return false;
  return Object.entries(failure.diagnostics).every(([key, value]) =>
    SAFE_DIAGNOSTIC_KEYS.has(key) &&
    (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") &&
    (typeof value !== "string" || !/(ownership.?token|service.?role|credential|authorization|bearer\s|secret|stack trace|sqlstate)/i.test(value)));
}

function safeObject(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return false;
  if (Array.isArray(value)) return value.every((current) => safeObject(current, seen));
  if (!isRecord(value) || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).every(([key, current]) => !FORBIDDEN_KEYS.test(key) && safeObject(current, seen));
}

function zeroExecutionCounters(downstream: DeploymentRecoveryPersistenceCommand["downstream"]): boolean {
  return downstream.rollbackExecuted === 0 && downstream.entitiesCompensated === 0 &&
    downstream.bindingsRemoved === 0 && downstream.sessionsRecovered === 0 && downstream.finalized === 0;
}

function normalizeRollbackItems(items: readonly DeploymentExecutionRecoveryRollbackItem[]) {
  return [...items].sort((left, right) => left.rollbackSequence - right.rollbackSequence).map(clone);
}

function normalizeRunningItems(items: readonly DeploymentExecutionRecoveryRunningItem[]) {
  return [...items].sort((left, right) => left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey)).map(clone);
}

function normalizeCompensations(items: readonly DeploymentExecutionRecoveryCompensationClassification[]) {
  return [...items].sort((left, right) => `${left.entityType}:${left.action}:${left.support}`.localeCompare(`${right.entityType}:${right.action}:${right.support}`)).map(clone);
}

function normalizeRecoveryIssues(items: readonly DeploymentExecutionRecoveryIssue[]) {
  return [...items].sort((left, right) => `${left.sequence ?? 0}:${left.code}:${left.executionItemKey ?? ""}`.localeCompare(`${right.sequence ?? 0}:${right.code}:${right.executionItemKey ?? ""}`)).map(clone);
}

function mapRepositoryResult(
  input: DeploymentRecoveryPersistenceInput,
  command: DeploymentRecoveryPersistenceCommand,
  repository: DeploymentRecoveryPersistenceRepositoryResult,
): DeploymentRecoveryPersistenceServiceResult {
  const status = serviceStatus(repository.status);
  const issueCode = repository.issueCode ?? repository.repositoryError?.code ?? null;
  const issues = status === "persisted" || status === "reused"
    ? []
    : [persistenceIssue(
      status === "conflict" ? "repository_conflict" : status === "blocked" ? "repository_blocked" : status === "not_found" ? "repository_not_found" : "repository_error",
      repository.message,
    )];
  return serviceResult(input, {
    status,
    recoveryKey: command.recoveryKey,
    payloadHash: command.payloadHash,
    recoveryPlanId: repository.recoveryPlanId,
    rollbackItemsPersisted: repository.rollbackItemsPersisted,
    rollbackItemsReused: repository.rollbackItemsReused,
    issueCode,
    issues,
    stoppedAtStage: status === "persisted" || status === "reused" ? "complete" : "repository",
    message: repository.message,
  });
}

function serviceStatus(status: DeploymentRecoveryPersistenceRepositoryResult["status"]): DeploymentRecoveryPersistenceServiceStatus {
  if (status === "created") return "persisted";
  if (status === "reused") return "reused";
  if (status === "conflict") return "conflict";
  if (status === "blocked") return "blocked";
  if (status === "not_found") return "not_found";
  return "repository_error";
}

function serviceResult(
  input: DeploymentRecoveryPersistenceInput,
  patch: {
    status: DeploymentRecoveryPersistenceServiceStatus;
    recoveryKey?: string | null;
    payloadHash?: string | null;
    recoveryPlanId?: string | null;
    rollbackItemsPersisted?: number;
    rollbackItemsReused?: number;
    issueCode?: string | null;
    issues: readonly DeploymentRecoveryPersistenceIssue[];
    stoppedAtStage: DeploymentRecoveryPersistenceServiceResult["stoppedAtStage"];
    message: string;
  },
): DeploymentRecoveryPersistenceServiceResult {
  const status = patch.status;
  const persisted = status === "persisted";
  const reused = status === "reused";
  const conflict = status === "conflict";
  const blocked = status === "blocked";
  const notFound = status === "not_found";
  const rollbackItemsPersisted = patch.rollbackItemsPersisted ?? 0;
  const rollbackItemsReused = patch.rollbackItemsReused ?? 0;
  return {
    ok: persisted || reused,
    status,
    message: patch.message,
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    recoveryKey: patch.recoveryKey ?? null,
    recoveryStatus: RECOVERY_STATUSES.has(input.recovery.status) ? input.recovery.status : null,
    rollbackRequired: input.recovery.rollbackRequired,
    rollbackExecutable: input.recovery.rollbackExecutable,
    recoveryPlanId: patch.recoveryPlanId ?? null,
    rollbackItemsRequested: input.recovery.rollbackItems.length,
    rollbackItemsPersisted,
    payloadHash: patch.payloadHash ?? null,
    issueCode: patch.issueCode ?? null,
    issues: sortIssues(patch.issues),
    stoppedAtStage: patch.stoppedAtStage,
    downstream: downstream({ persisted, reused, conflict, blocked, notFound, rollbackItemsPersisted, rollbackItemsReused }),
  };
}

function downstream(input: {
  persisted: boolean; reused: boolean; conflict: boolean; blocked: boolean; notFound: boolean;
  rollbackItemsPersisted: number; rollbackItemsReused: number;
}): DeploymentRecoveryPersistenceDownstreamCounts {
  return {
    recoveryPlansCreated: input.persisted ? 1 : 0,
    recoveryPlansReused: input.reused ? 1 : 0,
    rollbackItemsPersisted: input.rollbackItemsPersisted,
    rollbackItemsReused: input.rollbackItemsReused,
    conflicts: input.conflict ? 1 : 0,
    blocked: input.blocked ? 1 : 0,
    notFound: input.notFound ? 1 : 0,
    rollbackExecuted: 0,
    entitiesCompensated: 0,
    bindingsRemoved: 0,
    sessionsRecovered: 0,
    finalized: 0,
  };
}

function compare(expected: string, actual: string, code: DeploymentRecoveryPersistenceIssueCode, message: string, issues: DeploymentRecoveryPersistenceIssue[]) {
  if (!expected || expected !== actual) issues.push(persistenceIssue(code, message));
}

function persistenceIssue(code: DeploymentRecoveryPersistenceIssueCode, message: string): DeploymentRecoveryPersistenceIssue {
  return { code, severity: "blocker", message, executionItemKey: null, rollbackItemKey: null, sequence: null };
}

function itemIssue(code: DeploymentRecoveryPersistenceIssueCode, item: DeploymentExecutionRecoveryRollbackItem, message: string): DeploymentRecoveryPersistenceIssue {
  return { code, severity: "blocker", message, executionItemKey: item.sourceExecutionItemKey, rollbackItemKey: item.rollbackItemKey, sequence: item.sourceSequence };
}

function sortIssues(issues: readonly DeploymentRecoveryPersistenceIssue[]) {
  return [...issues].sort((left, right) => `${left.sequence ?? 0}:${left.code}:${left.rollbackItemKey ?? ""}`.localeCompare(`${right.sequence ?? 0}:${right.code}:${right.rollbackItemKey ?? ""}`));
}

function dedupeIssues(issues: readonly DeploymentRecoveryPersistenceIssue[]) {
  const seen = new Set<string>();
  return sortIssues(issues).filter((current) => {
    const key = `${current.code}:${current.rollbackItemKey ?? ""}:${current.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
