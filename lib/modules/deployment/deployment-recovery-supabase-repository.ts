import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentRecoveryRepository } from "./deployment-recovery-repository";
import type {
  DeploymentRecoveryPersistenceCommand,
  DeploymentRecoveryPersistenceRepositoryResult,
  DeploymentRecoveryPersistenceRepositoryStatus,
  DeploymentRecoveryRepositoryErrorEvidence,
} from "./deployment-recovery-persistence-types";
import type { DeploymentExecutionRecoveryStatus } from "./deployment-recovery-types";

export const DEPLOYMENT_RECOVERY_PERSISTENCE_RPC_NAME = "persist_deployment_recovery_plan";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
const REPOSITORY_STATUSES = new Set<DeploymentRecoveryPersistenceRepositoryStatus>([
  "created", "reused", "conflict", "blocked", "not_found", "error",
]);
const RECOVERY_STATUSES = new Set<DeploymentExecutionRecoveryStatus>([
  "rollback_required", "rollback_not_required", "blocked", "not_found",
]);

interface RecoveryPersistenceRpcRow {
  persistence_status?: unknown;
  recovery_plan_id?: unknown;
  recovery_key?: unknown;
  recovery_status?: unknown;
  rollback_required?: unknown;
  rollback_executable?: unknown;
  rollback_items_persisted?: unknown;
  rollback_items_reused?: unknown;
  issue_code?: unknown;
  message?: unknown;
  persisted_at?: unknown;
}

interface SupabaseErrorLike {
  code?: unknown;
}

export class SupabaseDeploymentRecoveryRepository
  implements DeploymentRecoveryRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async persistRecoveryPlan(
    command: DeploymentRecoveryPersistenceCommand,
  ): Promise<DeploymentRecoveryPersistenceRepositoryResult> {
    try {
      const { data, error } = await this.client.rpc(
        DEPLOYMENT_RECOVERY_PERSISTENCE_RPC_NAME,
        deploymentRecoveryPersistenceRpcPayload(command),
      );

      if (error) {
        return repositoryFailure(command, classifyRepositoryError(error));
      }

      return mapDeploymentRecoveryPersistenceRpcResult(data, command);
    } catch {
      return repositoryFailure(command, safeRepositoryError("rpc_failure", false));
    }
  }
}

export function deploymentRecoveryPersistenceRpcPayload(
  command: DeploymentRecoveryPersistenceCommand,
): Record<string, unknown> {
  const rollbackItems = [...command.rollbackItems]
    .sort((left, right) => left.rollbackSequence - right.rollbackSequence)
    .map(cloneRecord);

  return {
    p_clinic_id: command.clinicId,
    p_deployment_run_key: command.deploymentRunKey,
    p_session_id: command.sessionId,
    p_execution_key: command.executionKey,
    p_plan_key: command.planKey,
    p_recovery_key: command.recoveryKey,
    p_idempotency_key: command.idempotencyKey,
    p_payload_hash: command.payloadHash,
    p_recovery_status: command.recoveryStatus,
    p_rollback_required: command.rollbackRequired,
    p_rollback_executable: command.rollbackExecutable,
    p_sanitized_failure: cloneRecord(command.sanitizedFailure),
    p_unsupported_compensations: command.unsupportedCompensations.map(cloneRecord),
    p_running_items_to_recover: command.runningItemsToRecover.map(cloneRecord),
    p_completed_mutation_count: command.completedMutationCount,
    p_reversible_mutation_count: command.reversibleMutationCount,
    p_downstream: cloneRecord(command.downstream),
    p_evidence: cloneRecord(command.evidence),
    p_rollback_items: rollbackItems,
  };
}

export function mapDeploymentRecoveryPersistenceRpcResult(
  data: unknown,
  command: DeploymentRecoveryPersistenceCommand,
): DeploymentRecoveryPersistenceRepositoryResult {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length !== 1 || !isRecord(rows[0])) {
    return repositoryFailure(command, safeRepositoryError("malformed_response", false));
  }

  const row = rows[0] as RecoveryPersistenceRpcRow;
  const status = readRepositoryStatus(row.persistence_status);
  const recoveryStatus = readRecoveryStatus(row.recovery_status);
  const recoveryKey = readString(row.recovery_key);
  const rollbackRequired = readBoolean(row.rollback_required);
  const rollbackExecutable = readBoolean(row.rollback_executable);
  const rollbackItemsPersisted = readCount(row.rollback_items_persisted);
  const rollbackItemsReused = readCount(row.rollback_items_reused);
  const recoveryPlanId = readNullableUuid(row.recovery_plan_id);
  const persistedAt = readNullableTimestamp(row.persisted_at);

  if (
    !status ||
    !recoveryStatus ||
    !recoveryKey ||
    rollbackRequired === null ||
    rollbackExecutable === null ||
    rollbackItemsPersisted === null ||
    rollbackItemsReused === null ||
    recoveryKey !== command.recoveryKey ||
    recoveryStatus !== command.recoveryStatus ||
    rollbackRequired !== command.rollbackRequired ||
    rollbackExecutable !== command.rollbackExecutable
  ) {
    return repositoryFailure(command, safeRepositoryError("malformed_response", false));
  }

  const successful = status === "created" || status === "reused";
  if (
    (successful && (!recoveryPlanId || !persistedAt)) ||
    (status === "created" && (rollbackItemsPersisted !== command.rollbackItems.length || rollbackItemsReused !== 0)) ||
    (status === "reused" && rollbackItemsPersisted !== 0)
  ) {
    return repositoryFailure(command, safeRepositoryError("malformed_response", false));
  }

  const repositoryError = status === "error"
    ? safeRepositoryError("rpc_failure", false)
    : null;

  return {
    ok: successful,
    status,
    recoveryPlanId,
    recoveryKey,
    payloadHash: command.payloadHash,
    recoveryStatus,
    rollbackRequired,
    rollbackExecutable,
    rollbackItemsPersisted,
    rollbackItemsReused,
    issueCode: readSafeNullableCode(row.issue_code),
    message: repositoryMessage(status),
    persistedAt,
    repositoryError,
  };
}

function repositoryFailure(
  command: DeploymentRecoveryPersistenceCommand,
  repositoryError: DeploymentRecoveryRepositoryErrorEvidence,
): DeploymentRecoveryPersistenceRepositoryResult {
  return {
    ok: false,
    status: "error",
    recoveryPlanId: null,
    recoveryKey: command.recoveryKey,
    payloadHash: command.payloadHash,
    recoveryStatus: command.recoveryStatus,
    rollbackRequired: command.rollbackRequired,
    rollbackExecutable: command.rollbackExecutable,
    rollbackItemsPersisted: 0,
    rollbackItemsReused: 0,
    issueCode: repositoryError.code,
    message: repositoryError.message,
    persistedAt: null,
    repositoryError,
  };
}

function classifyRepositoryError(error: SupabaseErrorLike): DeploymentRecoveryRepositoryErrorEvidence {
  return safeRepositoryError(error.code === "PGRST202" ? "rpc_unavailable" : "rpc_failure", error.code === "PGRST202");
}

function safeRepositoryError(
  code: DeploymentRecoveryRepositoryErrorEvidence["code"],
  retryable: boolean,
): DeploymentRecoveryRepositoryErrorEvidence {
  return {
    code,
    layer: "deployment_recovery_repository",
    message: code === "rpc_unavailable"
      ? "Deployment recovery persistence RPC is unavailable."
      : code === "malformed_response"
        ? "Deployment recovery persistence returned malformed evidence."
        : "Deployment recovery persistence repository failed safely.",
    retryable,
  };
}

function repositoryMessage(status: DeploymentRecoveryPersistenceRepositoryStatus): string {
  switch (status) {
    case "created": return "Recovery decision and rollback plan were persisted.";
    case "reused": return "Compatible recovery persistence evidence was reused.";
    case "conflict": return "Recovery persistence identity conflicts with immutable evidence.";
    case "blocked": return "Recovery persistence was blocked by the atomic boundary.";
    case "not_found": return "Recovery persistence source evidence was not found.";
    case "error": return "Deployment recovery persistence repository failed safely.";
  }
}

function readRepositoryStatus(value: unknown): DeploymentRecoveryPersistenceRepositoryStatus | null {
  return typeof value === "string" && REPOSITORY_STATUSES.has(value as DeploymentRecoveryPersistenceRepositoryStatus)
    ? value as DeploymentRecoveryPersistenceRepositoryStatus
    : null;
}

function readRecoveryStatus(value: unknown): DeploymentExecutionRecoveryStatus | null {
  return typeof value === "string" && RECOVERY_STATUSES.has(value as DeploymentExecutionRecoveryStatus)
    ? value as DeploymentExecutionRecoveryStatus
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readNullableUuid(value: unknown): string | null {
  return value === null ? null : typeof value === "string" && UUID.test(value) ? value : null;
}

function readNullableTimestamp(value: unknown): string | null {
  return value === null
    ? null
    : typeof value === "string" && Number.isFinite(Date.parse(value))
      ? value
      : null;
}

function readSafeNullableCode(value: unknown): string | null {
  return value === null ? null : typeof value === "string" && SAFE_CODE.test(value) ? value : null;
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
