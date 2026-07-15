import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationExecutionDependencyProgressionRepository,
} from "./deployment-activation-execution-dependency-progression-repository";
import {
  emptyDependencyProgressionAggregate,
  type DeploymentActivationExecutionAtomicDependencyProgressionCommand,
  type DeploymentActivationExecutionAtomicDependencyProgressionResult,
  type DeploymentActivationExecutionDependencyProgressionAggregateSnapshot,
  type DeploymentActivationExecutionDependencyProgressionItemSnapshot,
  type DeploymentActivationExecutionDependencyProgressionSessionSnapshot,
  type DeploymentActivationExecutionDependencyProgressionSnapshot,
} from "./deployment-activation-execution-dependency-progression-types";

const DEPENDENCY_PROGRESSION_SESSION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_run_key",
  "execution_key",
  "preparation_status",
  "execution_status",
  "execution_owner",
  "ownership_token",
  "lease_expires_at",
  "started_at",
  "completed_at",
  "failed_at",
  "items_requested",
].join(",");

const DEPENDENCY_PROGRESSION_ITEM_COLUMNS = [
  "id",
  "session_id",
  "execution_item_key",
  "plan_item_key",
  "sequence",
  "entity_type",
  "entity_id",
  "action",
  "execution_status",
  "attempt_count",
  "started_at",
  "completed_at",
  "rolled_back_at",
  "error_code",
  "error_message",
  "dependency_keys",
  "expected_current_state",
  "target_state",
  "reversible",
  "rollback_action",
].join(",");

const DEPENDENCY_PROGRESSION_RPC_NAME = "progress_deployment_activation_execution_dependency";
const REDACTED = "[redacted]";

type DependencyProgressionSessionRow = {
  id: string;
  clinic_id: string;
  deployment_run_key: string;
  execution_key: string;
  preparation_status: string;
  execution_status: string;
  execution_owner: string | null;
  ownership_token: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  items_requested: number;
};

export type DependencyProgressionItemRow = {
  id: string;
  session_id: string;
  execution_item_key: string;
  plan_item_key: string;
  sequence: number;
  entity_type: string;
  entity_id: string | null;
  action: string;
  execution_status: string;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  rolled_back_at: string | null;
  error_code: string | null;
  error_message: string | null;
  dependency_keys: unknown;
  expected_current_state: unknown;
  target_state: unknown;
  reversible: boolean | null;
  rollback_action: string | null;
};

type DependencyProgressionRpcRow = {
  status: string | null;
  clinic_id: string | null;
  deployment_run_key: string | null;
  session_id: string | null;
  execution_key: string | null;
  completed_item_id: string | null;
  completed_execution_item_key: string | null;
  completed_plan_item_key: string | null;
  completed_sequence: number | null;
  next_item_id: string | null;
  next_execution_item_key: string | null;
  next_plan_item_key: string | null;
  next_sequence: number | null;
  next_entity_type: string | null;
  next_entity_id: string | null;
  next_action: string | null;
  next_status_before: string | null;
  next_status_after: string | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class DeploymentActivationExecutionDependencyProgressionRepositoryError extends Error {
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;
  readonly layer: string;

  constructor(input: {
    message: string;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
    layer?: string;
  }) {
    super(input.message);
    this.name = "DeploymentActivationExecutionDependencyProgressionRepositoryError";
    this.code = input.code ?? null;
    this.details = input.details ?? null;
    this.hint = input.hint ?? null;
    this.layer = input.layer ?? "repository";
  }
}

export class SupabaseDeploymentActivationExecutionDependencyProgressionRepository
  implements DeploymentActivationExecutionDependencyProgressionRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadDependencyProgressionSnapshot(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionDependencyProgressionSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        items: [],
        aggregate: emptyDependencyProgressionAggregate(),
      };
    }

    const items = await this.listItems(session.id);

    return {
      session: mapDependencyProgressionSessionRow(session),
      items: items.map(mapDependencyProgressionItemRow),
      aggregate: aggregateDependencyProgressionItems(items),
    };
  }

  async progressDependencyAtomically(
    command: DeploymentActivationExecutionAtomicDependencyProgressionCommand,
  ): Promise<DeploymentActivationExecutionAtomicDependencyProgressionResult> {
    const payload = dependencyProgressionRpcPayload(command);
    const { data, error } = await this.client.rpc(DEPENDENCY_PROGRESSION_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error, command.ownershipToken, "atomic_rpc");
    }

    return mapDependencyProgressionRpcResult(readSingleRpcRow(data, "atomic_rpc_response_mapping"));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DependencyProgressionSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(DEPENDENCY_PROGRESSION_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunKey)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_session_lookup");
    }

    const rows = (data ?? []) as unknown as DependencyProgressionSessionRow[];
    assertAtMostOne(rows, "activation execution dependency-progression session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly DependencyProgressionItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(DEPENDENCY_PROGRESSION_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error, null, "snapshot_item_listing");
    }

    return (data ?? []) as unknown as DependencyProgressionItemRow[];
  }
}

export function mapDependencyProgressionSessionRow(
  row: DependencyProgressionSessionRow,
): DeploymentActivationExecutionDependencyProgressionSessionSnapshot {
  return {
    sessionId: row.id,
    clinicId: row.clinic_id,
    deploymentRunKey: row.deployment_run_key,
    executionKey: row.execution_key,
    preparationStatus: row.preparation_status,
    executionStatus: row.execution_status,
    executionOwner: row.execution_owner,
    ownershipToken: row.ownership_token,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    cancelledAt: null,
    rolledBackAt: null,
    itemsRequested: row.items_requested,
  };
}

export function mapDependencyProgressionItemRow(
  row: DependencyProgressionItemRow,
): DeploymentActivationExecutionDependencyProgressionItemSnapshot {
  return {
    itemId: row.id,
    sessionId: row.session_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    executionStatus: row.execution_status,
    attemptCount: row.attempt_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    rolledBackAt: row.rolled_back_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    dependencyKeys: readStringArray(row.dependency_keys),
    expectedCurrentState: readNullableRecord(row.expected_current_state),
    targetState: readNullableRecord(row.target_state),
    reversible: row.reversible,
    rollbackBehavior: row.rollback_action,
  };
}

export function aggregateDependencyProgressionItems(
  items: readonly DependencyProgressionItemRow[],
): DeploymentActivationExecutionDependencyProgressionAggregateSnapshot {
  return {
    totalItemCount: items.length,
    succeededItemCount: items.filter((item) => item.execution_status === "succeeded").length,
    pendingItemCount: items.filter((item) => item.execution_status === "pending").length,
    readyItemCount: items.filter((item) => item.execution_status === "ready").length,
    runningItemCount: items.filter((item) => item.execution_status === "running").length,
    failedOrTerminalItemCount: items.filter((item) => ["failed", "blocked", "cancelled", "rolled_back"].includes(item.execution_status)).length,
    attemptedItemCount: items.filter((item) => item.attempt_count > 0).length,
    timestampedItemCount: items.filter((item) => item.started_at !== null || item.completed_at !== null).length,
    rollbackEvidenceCount: items.filter((item) => item.rolled_back_at !== null).length,
    errorEvidenceCount: items.filter((item) => item.error_code !== null || item.error_message !== null).length,
    malformedDependencyCount: items.filter((item) => !Array.isArray(item.dependency_keys) || !item.dependency_keys.every((entry) => typeof entry === "string")).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((item) => item.execution_item_key)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((item) => item.plan_item_key)),
    duplicateSequenceCount: duplicateCount(items.map((item) => String(item.sequence))),
  };
}

export function dependencyProgressionRpcPayload(
  command: DeploymentActivationExecutionAtomicDependencyProgressionCommand,
): Record<string, unknown> {
  return {
    p_clinic_id: command.clinicId,
    p_deployment_run_key: command.deploymentRunKey,
    p_session_id: command.sessionId,
    p_execution_key: command.executionKey,
    p_claimant_id: command.claimantId,
    p_ownership_token: command.ownershipToken,
    p_expected_lease_expires_at: command.expectedLeaseExpiresAt,
    p_completed_item_id: command.completedItemId,
    p_completed_execution_item_key: command.completedExecutionItemKey,
    p_completed_plan_item_key: command.completedPlanItemKey,
    p_completed_sequence: command.completedSequence,
    p_completed_started_at: command.completedStartedAt,
    p_completed_completed_at: command.completedCompletedAt,
    p_completed_attempt_count: command.completedAttemptCount,
    p_next_item_id: command.nextItemId,
    p_next_execution_item_key: command.nextExecutionItemKey,
    p_next_plan_item_key: command.nextPlanItemKey,
    p_next_sequence: command.nextSequence,
    p_next_entity_type: command.nextEntityType,
    p_next_entity_id: command.nextEntityId,
    p_next_action: command.nextAction,
    p_expected_next_status: command.expectedNextStatus,
    p_expected_next_attempt_count: command.expectedNextAttemptCount,
    p_expected_dependency_keys: [...command.expectedDependencyKeys],
    p_progressed_at: command.progressedAt,
  };
}

export function mapDependencyProgressionRpcResult(
  row: DependencyProgressionRpcRow,
): DeploymentActivationExecutionAtomicDependencyProgressionResult {
  const status = readAtomicDependencyProgressionStatus(row.status);

  return {
    ok: status === "progressed" || status === "already_progressed",
    status,
    clinicId: row.clinic_id,
    deploymentRunKey: row.deployment_run_key,
    sessionId: row.session_id,
    executionKey: row.execution_key,
    completedItemId: row.completed_item_id,
    completedExecutionItemKey: row.completed_execution_item_key,
    completedPlanItemKey: row.completed_plan_item_key,
    completedSequence: row.completed_sequence,
    completedStartedAt: null,
    completedCompletedAt: null,
    completedAttemptCount: 0,
    nextItemId: row.next_item_id,
    nextExecutionItemKey: row.next_execution_item_key,
    nextPlanItemKey: row.next_plan_item_key,
    nextSequence: row.next_sequence,
    nextEntityType: row.next_entity_type,
    nextEntityId: row.next_entity_id,
    nextAction: row.next_action,
    nextStatusBefore: row.next_status_before,
    nextStatusAfter: row.next_status_after,
    issueCode: row.issue_code,
    message: row.message ?? "Activation execution dependency-progression RPC returned no message.",
  };
}

function readSingleRpcRow(data: unknown, layer = "rpc_response_mapping"): DependencyProgressionRpcRow {
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length !== 1) {
    throw new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      message: "Ambiguous activation execution dependency-progression RPC response.",
      layer,
    });
  }

  const row = rows[0];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      message: "Malformed activation execution dependency-progression RPC response.",
      layer,
    });
  }

  return row as DependencyProgressionRpcRow;
}

function readAtomicDependencyProgressionStatus(
  value: string | null,
): DeploymentActivationExecutionAtomicDependencyProgressionResult["status"] {
  const allowed = [
    "progressed",
    "already_progressed",
    "blocked",
    "conflict",
    "not_found",
    "error",
  ] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentActivationExecutionAtomicDependencyProgressionResult["status"];
  }

  throw new DeploymentActivationExecutionDependencyProgressionRepositoryError({
    message: "Malformed activation execution dependency-progression RPC status.",
  });
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentActivationExecutionDependencyProgressionRepositoryError({
      message: `Ambiguous ${label} rows prevent deterministic activation execution dependency progression.`,
    });
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [];
}

function readNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value)) as Record<string, unknown>
    : null;
}

function duplicateCount(values: readonly string[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return duplicates.size;
}

function toRepositoryError(
  error: SupabaseErrorLike,
  sensitiveToken: string | null = null,
  layer = "repository",
): DeploymentActivationExecutionDependencyProgressionRepositoryError {
  return new DeploymentActivationExecutionDependencyProgressionRepositoryError({
    message: sanitizeDiagnostic(error.message || "Activation execution dependency-progression repository query failed.", sensitiveToken) ?? "Activation execution dependency-progression repository query failed.",
    code: sanitizeDiagnostic(error.code ?? null, sensitiveToken),
    details: sanitizeDiagnostic(error.details ?? null, sensitiveToken),
    hint: sanitizeDiagnostic(error.hint ?? null, sensitiveToken),
    layer,
  });
}

function sanitizeDiagnostic(value: string | null, sensitiveToken: string | null): string | null {
  if (!value) {
    return value;
  }

  return sensitiveToken ? value.split(sensitiveToken).join(REDACTED) : value;
}