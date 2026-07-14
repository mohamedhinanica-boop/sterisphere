import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationExecutionItemStartRepository,
} from "./deployment-activation-execution-item-start-repository";
import {
  emptyItemStartAggregate,
  type DeploymentActivationExecutionAtomicItemStartCommand,
  type DeploymentActivationExecutionAtomicItemStartResult,
  type DeploymentActivationExecutionItemStartAggregateSnapshot,
  type DeploymentActivationExecutionItemStartCandidateSnapshot,
  type DeploymentActivationExecutionItemStartSessionSnapshot,
  type DeploymentActivationExecutionItemStartSnapshot,
} from "./deployment-activation-execution-item-start-types";

const ITEM_START_SESSION_COLUMNS = [
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

const ITEM_START_ITEM_COLUMNS = [
  "id",
  "session_id",
  "execution_item_key",
  "plan_item_key",
  "sequence",
  "dependency_level",
  "entity_type",
  "deployment_key",
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
  "reversible",
  "rollback_action",
  "expected_current_state",
  "target_state",
].join(",");

const ITEM_START_RPC_NAME = "start_deployment_activation_execution_item";

type ItemStartSessionRow = {
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

export type ItemStartItemRow = {
  id: string;
  session_id: string;
  execution_item_key: string;
  plan_item_key: string;
  sequence: number;
  dependency_level: number | null;
  entity_type: string;
  deployment_key: string | null;
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
  reversible: boolean;
  rollback_action: string | null;
  expected_current_state: unknown;
  target_state: unknown;
};

type ItemStartRpcRow = {
  status: string | null;
  session_id: string | null;
  execution_key: string | null;
  item_id: string | null;
  execution_item_key: string | null;
  plan_item_key: string | null;
  sequence: number | null;
  action: string | null;
  entity_type: string | null;
  entity_key: string | null;
  execution_status: string | null;
  attempt_count: number | null;
  started_at: string | null;
  lease_expires_at: string | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentActivationExecutionItemStartRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentActivationExecutionItemStartRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentActivationExecutionItemStartRepository
  implements DeploymentActivationExecutionItemStartRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadExecutionItemStartSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionItemStartSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        candidateItem: null,
        aggregate: emptyItemStartAggregate(),
      };
    }

    const items = await this.listItems(session.id);

    return {
      session: mapItemStartSessionRow(session),
      candidateItem: mapCandidateItem(selectCandidateItem(items)),
      aggregate: aggregateItemStartItems(items),
    };
  }

  async startExecutionItemAtomically(
    command: DeploymentActivationExecutionAtomicItemStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicItemStartResult> {
    const payload = atomicItemStartRpcPayload(command);
    const { data, error } = await this.client.rpc(ITEM_START_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error);
    }

    return mapAtomicItemStartRpcResult(readSingleRpcRow(data));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<ItemStartSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(ITEM_START_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ItemStartSessionRow[];
    assertAtMostOne(rows, "activation execution item-start session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly ItemStartItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(ITEM_START_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return (data ?? []) as unknown as ItemStartItemRow[];
  }
}

export function mapItemStartSessionRow(
  row: ItemStartSessionRow,
): DeploymentActivationExecutionItemStartSessionSnapshot {
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

export function mapCandidateItem(
  row: ItemStartItemRow | null,
): DeploymentActivationExecutionItemStartCandidateSnapshot | null {
  if (!row) {
    return null;
  }

  return {
    itemId: row.id,
    sessionId: row.session_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    dependencyLevel: row.dependency_level ?? 0,
    entityType: row.entity_type,
    entityKey: row.deployment_key,
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
    reversible: row.reversible,
    rollbackAction: row.rollback_action,
    expectedCurrentState: readRecord(row.expected_current_state),
    targetState: readRecord(row.target_state),
  };
}

export function aggregateItemStartItems(
  items: readonly ItemStartItemRow[],
): DeploymentActivationExecutionItemStartAggregateSnapshot {
  const ordered = [...items].sort(compareItems);
  const firstItem = ordered[0] ?? null;

  return {
    totalItemCount: items.length,
    readyItemCount: items.filter((item) => item.execution_status === "ready").length,
    pendingItemCount: items.filter((item) => item.execution_status === "pending").length,
    runningItemCount: items.filter((item) => item.execution_status === "running").length,
    succeededItemCount: items.filter((item) => item.execution_status === "succeeded").length,
    failedItemCount: items.filter((item) => item.execution_status === "failed").length,
    blockedItemCount: items.filter((item) => item.execution_status === "blocked").length,
    attemptedItemCount: items.filter((item) => item.attempt_count > 0).length,
    timestampedItemCount: items.filter(
      (item) => item.started_at !== null || item.completed_at !== null,
    ).length,
    rollbackEvidenceCount: items.filter((item) => item.rolled_back_at !== null).length,
    errorEvidenceCount: items.filter(
      (item) => item.error_code !== null || item.error_message !== null,
    ).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((item) => item.execution_item_key)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((item) => item.plan_item_key)),
    duplicateSequenceCount: duplicateCount(items.map((item) => String(item.sequence))),
    malformedDependencyCount: items.filter((item) => !Array.isArray(item.dependency_keys)).length,
    readyRootCount: items.filter(
      (item) => item.execution_status === "ready" && readStringArray(item.dependency_keys).length === 0,
    ).length,
    firstSequence: firstItem?.sequence ?? null,
    firstExecutionStatus: firstItem?.execution_status ?? null,
    succeededPlanItemKeys: ordered
      .filter((item) => item.execution_status === "succeeded")
      .map((item) => item.plan_item_key),
  };
}

export function selectCandidateItem(
  items: readonly ItemStartItemRow[],
): ItemStartItemRow | null {
  const ordered = [...items].sort(compareItems);
  const ready = ordered.filter((item) => item.execution_status === "ready");

  if (ready.length > 0) {
    return ready[0] ?? null;
  }

  const running = ordered.filter((item) => item.execution_status === "running");
  return running.length === 1 ? running[0] : null;
}

export function atomicItemStartRpcPayload(
  command: DeploymentActivationExecutionAtomicItemStartCommand,
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
    p_expected_action: command.expectedAction,
    p_expected_entity_type: command.expectedEntityType,
    p_expected_entity_key: command.expectedEntityKey,
    p_proposed_started_at: command.proposedStartedAt,
    p_expected_attempt_count: command.expectedAttemptCount,
  };
}

export function mapAtomicItemStartRpcResult(
  row: ItemStartRpcRow,
): DeploymentActivationExecutionAtomicItemStartResult {
  const status = readAtomicItemStartStatus(row.status);

  return {
    ok: status === "started" || status === "already_started",
    status,
    sessionId: row.session_id,
    executionKey: row.execution_key,
    itemId: row.item_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    action: row.action,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    executionStatus: row.execution_status,
    attemptCount: row.attempt_count ?? 0,
    startedAt: row.started_at,
    leaseExpiresAt: row.lease_expires_at,
    issueCode: row.issue_code,
    message: row.message ?? "Activation execution item-start RPC returned no message.",
  };
}

function readSingleRpcRow(data: unknown): ItemStartRpcRow {
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length !== 1) {
    throw new DeploymentActivationExecutionItemStartRepositoryError(
      "Ambiguous activation execution item-start RPC response.",
    );
  }

  const row = rows[0];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentActivationExecutionItemStartRepositoryError(
      "Malformed activation execution item-start RPC response.",
    );
  }

  return row as ItemStartRpcRow;
}

function readAtomicItemStartStatus(
  value: string | null,
): DeploymentActivationExecutionAtomicItemStartResult["status"] {
  const allowed = [
    "started",
    "already_started",
    "blocked",
    "conflict",
    "not_found",
    "error",
  ] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentActivationExecutionAtomicItemStartResult["status"];
  }

  throw new DeploymentActivationExecutionItemStartRepositoryError(
    "Malformed activation execution item-start RPC status.",
  );
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentActivationExecutionItemStartRepositoryError(
      `Ambiguous ${label} rows prevent deterministic activation execution item start.`,
    );
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value)) as Record<string, unknown>
    : {};
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

function compareItems(left: ItemStartItemRow, right: ItemStartItemRow): number {
  return left.sequence - right.sequence || left.execution_item_key.localeCompare(right.execution_item_key);
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentActivationExecutionItemStartRepositoryError {
  return new DeploymentActivationExecutionItemStartRepositoryError(
    "Activation execution item-start repository query failed.",
    error.code ?? null,
  );
}