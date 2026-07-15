import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationExecutionItemCompletionRepository,
} from "./deployment-activation-execution-item-completion-repository";
import {
  emptyItemCompletionAggregate,
  type DeploymentActivationExecutionAtomicItemCompletionCommand,
  type DeploymentActivationExecutionAtomicItemCompletionResult,
  type DeploymentActivationExecutionItemCompletionAggregateSnapshot,
  type DeploymentActivationExecutionItemCompletionClinicSnapshot,
  type DeploymentActivationExecutionItemCompletionItemSnapshot,
  type DeploymentActivationExecutionItemCompletionSessionSnapshot,
  type DeploymentActivationExecutionItemCompletionSnapshot,
} from "./deployment-activation-execution-item-completion-types";

const ITEM_COMPLETION_SESSION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_run_key",
  "execution_key",
  "execution_status",
  "execution_owner",
  "ownership_token",
  "lease_expires_at",
  "started_at",
  "completed_at",
  "failed_at",
  "items_requested",
].join(",");

const ITEM_COMPLETION_ITEM_COLUMNS = [
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
].join(",");

const ITEM_COMPLETION_CLINIC_COLUMNS = [
  "id",
  "deployment_status",
  "deployed_at",
].join(",");

const ITEM_COMPLETION_RPC_NAME = "complete_deployment_activation_execution_item";

type ItemCompletionSessionRow = {
  id: string;
  clinic_id: string;
  deployment_run_key: string;
  execution_key: string;
  execution_status: string;
  execution_owner: string | null;
  ownership_token: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  items_requested: number;
};

export type ItemCompletionItemRow = {
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
};

type ItemCompletionClinicRow = {
  id: string;
  deployment_status: string | null;
  deployed_at: string | null;
};

type ItemCompletionRpcRow = {
  status: string | null;
  claimant_id: string | null;
  clinic_id: string | null;
  deployment_run_key: string | null;
  session_id: string | null;
  execution_key: string | null;
  item_id: string | null;
  execution_item_key: string | null;
  plan_item_key: string | null;
  sequence: number | null;
  entity_type: string | null;
  action: string | null;
  started_at: string | null;
  completed_at: string | null;
  attempt_count: number | null;
  execution_status_before: string | null;
  execution_status_after: string | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentActivationExecutionItemCompletionRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentActivationExecutionItemCompletionRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentActivationExecutionItemCompletionRepository
  implements DeploymentActivationExecutionItemCompletionRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadExecutionItemCompletionSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
    itemId: string;
    executionItemKey: string;
    planItemKey: string;
  }): Promise<DeploymentActivationExecutionItemCompletionSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        item: null,
        clinic: null,
        aggregate: emptyItemCompletionAggregate(),
      };
    }

    const [items, clinic] = await Promise.all([
      this.listItems(session.id),
      this.findClinic(input.clinicId),
    ]);

    return {
      session: mapItemCompletionSessionRow(session),
      item: mapItemCompletionItemRow(selectCompletionItem(items, input)),
      clinic: clinic ? mapItemCompletionClinicRow(clinic) : null,
      aggregate: aggregateItemCompletionItems(items),
    };
  }

  async completeExecutionItemAtomically(
    command: DeploymentActivationExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentActivationExecutionAtomicItemCompletionResult> {
    const payload = itemCompletionRpcPayload(command);
    const { data, error } = await this.client.rpc(ITEM_COMPLETION_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error);
    }

    return mapItemCompletionRpcResult(readSingleRpcRow(data));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<ItemCompletionSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(ITEM_COMPLETION_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ItemCompletionSessionRow[];
    assertAtMostOne(rows, "activation execution item-completion session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly ItemCompletionItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(ITEM_COMPLETION_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return (data ?? []) as unknown as ItemCompletionItemRow[];
  }

  private async findClinic(clinicId: string): Promise<ItemCompletionClinicRow | null> {
    const { data, error } = await this.client
      .from("clinics")
      .select(ITEM_COMPLETION_CLINIC_COLUMNS)
      .eq("id", clinicId)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ItemCompletionClinicRow[];
    assertAtMostOne(rows, "activation execution item-completion clinic");

    return rows[0] ?? null;
  }
}

export function mapItemCompletionSessionRow(
  row: ItemCompletionSessionRow,
): DeploymentActivationExecutionItemCompletionSessionSnapshot {
  return {
    clinicId: row.clinic_id,
    deploymentRunId: row.deployment_run_key,
    sessionId: row.id,
    executionKey: row.execution_key,
    executionStatus: row.execution_status,
    executionOwner: row.execution_owner,
    ownershipToken: row.ownership_token,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    itemsRequested: row.items_requested,
  };
}

export function mapItemCompletionItemRow(
  row: ItemCompletionItemRow | null,
): DeploymentActivationExecutionItemCompletionItemSnapshot | null {
  if (!row) {
    return null;
  }

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
  };
}

export function mapItemCompletionClinicRow(
  row: ItemCompletionClinicRow,
): DeploymentActivationExecutionItemCompletionClinicSnapshot {
  return {
    clinicId: row.id,
    deploymentStatus: row.deployment_status,
    deployedAt: row.deployed_at,
    currentState: {
      clinicId: row.id,
      deploymentStatus: row.deployment_status,
    },
  };
}

export function aggregateItemCompletionItems(
  items: readonly ItemCompletionItemRow[],
): DeploymentActivationExecutionItemCompletionAggregateSnapshot {
  return {
    totalItemCount: items.length,
    runningItemCount: items.filter((item) => item.execution_status === "running").length,
    succeededItemCount: items.filter((item) => item.execution_status === "succeeded").length,
    pendingItemCount: items.filter((item) => item.execution_status === "pending").length,
    failedItemCount: items.filter((item) => item.execution_status === "failed").length,
    attemptedItemCount: items.filter((item) => item.attempt_count > 0).length,
    timestampedItemCount: items.filter((item) => item.started_at !== null || item.completed_at !== null).length,
    rollbackEvidenceCount: items.filter((item) => item.rolled_back_at !== null).length,
    errorEvidenceCount: items.filter((item) => item.error_code !== null || item.error_message !== null).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((item) => item.execution_item_key)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((item) => item.plan_item_key)),
    duplicateSequenceCount: duplicateCount(items.map((item) => String(item.sequence))),
  };
}

export function selectCompletionItem(
  items: readonly ItemCompletionItemRow[],
  input: {
    itemId: string;
    executionItemKey: string;
    planItemKey: string;
  },
): ItemCompletionItemRow | null {
  const matches = items.filter(
    (item) =>
      item.id === input.itemId &&
      item.execution_item_key === input.executionItemKey &&
      item.plan_item_key === input.planItemKey,
  );

  assertAtMostOne(matches, "activation execution item-completion item");

  return matches[0] ?? null;
}

export function itemCompletionRpcPayload(
  command: DeploymentActivationExecutionAtomicItemCompletionCommand,
): Record<string, unknown> {
  return {
    p_clinic_id: command.clinicId,
    p_deployment_run_key: command.deploymentRunId,
    p_session_id: command.sessionId,
    p_execution_key: command.executionKey,
    p_claimant_id: command.claimantId,
    p_ownership_token: command.ownershipToken,
    p_expected_lease_expires_at: command.expectedLeaseExpiresAt,
    p_item_id: command.itemId,
    p_execution_item_key: command.executionItemKey,
    p_plan_item_key: command.planItemKey,
    p_expected_sequence: command.expectedSequence,
    p_expected_entity_type: command.expectedEntityType,
    p_expected_action: command.expectedAction,
    p_expected_started_at: command.expectedStartedAt,
    p_expected_attempt_count: command.expectedAttemptCount,
    p_proposed_completed_at: command.proposedCompletedAt,
  };
}

export function mapItemCompletionRpcResult(
  row: ItemCompletionRpcRow,
): DeploymentActivationExecutionAtomicItemCompletionResult {
  const status = readAtomicItemCompletionStatus(row.status);

  return {
    ok: status === "completed" || status === "already_completed",
    status,
    claimantId: row.claimant_id,
    clinicId: row.clinic_id,
    deploymentRunId: row.deployment_run_key,
    sessionId: row.session_id,
    executionKey: row.execution_key,
    itemId: row.item_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    entityType: row.entity_type,
    action: row.action,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    attemptCount: row.attempt_count ?? 0,
    executionStatusBefore: row.execution_status_before,
    executionStatusAfter: row.execution_status_after,
    issueCode: row.issue_code,
    message: row.message ?? "Activation execution item-completion RPC returned no message.",
  };
}

function readSingleRpcRow(data: unknown): ItemCompletionRpcRow {
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length !== 1) {
    throw new DeploymentActivationExecutionItemCompletionRepositoryError(
      "Ambiguous activation execution item-completion RPC response.",
    );
  }

  const row = rows[0];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentActivationExecutionItemCompletionRepositoryError(
      "Malformed activation execution item-completion RPC response.",
    );
  }

  return row as ItemCompletionRpcRow;
}

function readAtomicItemCompletionStatus(
  value: string | null,
): DeploymentActivationExecutionAtomicItemCompletionResult["status"] {
  const allowed = [
    "completed",
    "already_completed",
    "blocked",
    "conflict",
    "not_found",
    "error",
  ] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentActivationExecutionAtomicItemCompletionResult["status"];
  }

  throw new DeploymentActivationExecutionItemCompletionRepositoryError(
    "Malformed activation execution item-completion RPC status.",
  );
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentActivationExecutionItemCompletionRepositoryError(
      `Ambiguous ${label} rows prevent deterministic activation execution item completion.`,
    );
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
): DeploymentActivationExecutionItemCompletionRepositoryError {
  return new DeploymentActivationExecutionItemCompletionRepositoryError(
    "Activation execution item-completion repository query failed.",
    error.code ?? null,
  );
}
