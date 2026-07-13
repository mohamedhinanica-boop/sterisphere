import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationExecutionStartRepository,
} from "./deployment-activation-execution-start-repository";
import {
  emptyStartItemIntegrity,
  type DeploymentActivationExecutionAtomicStartCommand,
  type DeploymentActivationExecutionAtomicStartResult,
  type DeploymentActivationExecutionStartItemIntegritySnapshot,
  type DeploymentActivationExecutionStartSessionSnapshot,
  type DeploymentActivationExecutionStartSnapshot,
} from "./deployment-activation-execution-start-types";

const START_SESSION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_run_key",
  "execution_key",
  "plan_key",
  "execution_owner",
  "ownership_token",
  "lease_expires_at",
  "preparation_status",
  "execution_status",
  "started_at",
  "completed_at",
  "failed_at",
  "items_requested",
  "items_ready",
  "items_pending",
  "items_blocked",
].join(",");

const START_ITEM_COLUMNS = [
  "id",
  "execution_item_key",
  "plan_item_key",
  "sequence",
  "dependency_keys",
  "execution_status",
  "attempt_count",
  "error_code",
  "error_message",
  "started_at",
  "completed_at",
  "rolled_back_at",
].join(",");

const START_RPC_NAME = "start_deployment_activation_execution_session";

type StartSessionRow = {
  id: string;
  clinic_id: string;
  deployment_run_key: string;
  execution_key: string;
  plan_key: string;
  execution_owner: string | null;
  ownership_token: string | null;
  lease_expires_at: string | null;
  preparation_status: string;
  execution_status: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  items_requested: number;
  items_ready: number;
  items_pending: number;
  items_blocked: number;
};

export type StartItemRow = {
  id: string;
  execution_item_key: string;
  plan_item_key: string;
  sequence: number;
  dependency_keys: unknown;
  execution_status: string;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  rolled_back_at: string | null;
};

type StartRpcRow = {
  status: string | null;
  session_id: string | null;
  execution_key: string | null;
  execution_owner: string | null;
  lease_expires_at: string | null;
  execution_status: string | null;
  started_at: string | null;
  item_count: number | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentActivationExecutionStartRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentActivationExecutionStartRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentActivationExecutionStartRepository
  implements DeploymentActivationExecutionStartRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadExecutionStartSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionStartSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        itemIntegrity: emptyStartItemIntegrity(),
      };
    }

    const items = await this.listItems(session.id);

    return {
      session: mapStartSessionRow(session),
      itemIntegrity: aggregateStartItems(items),
    };
  }

  async startClaimedExecutionSessionAtomically(
    command: DeploymentActivationExecutionAtomicStartCommand,
  ): Promise<DeploymentActivationExecutionAtomicStartResult> {
    const payload = atomicStartRpcPayload(command);
    const { data, error } = await this.client.rpc(START_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error);
    }

    return mapAtomicStartRpcResult(readSingleRpcRow(data));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<StartSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(START_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as StartSessionRow[];
    assertAtMostOne(rows, "activation execution start session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly StartItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(START_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return (data ?? []) as unknown as StartItemRow[];
  }
}

export function mapStartSessionRow(
  row: StartSessionRow,
): DeploymentActivationExecutionStartSessionSnapshot {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentRunId: row.deployment_run_key,
    executionKey: row.execution_key,
    planKey: row.plan_key,
    executionOwner: row.execution_owner,
    ownershipToken: row.ownership_token,
    leaseExpiresAt: row.lease_expires_at,
    preparationStatus: row.preparation_status,
    executionStatus: row.execution_status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    itemsRequested: row.items_requested,
    itemsReady: row.items_ready,
    itemsPending: row.items_pending,
    itemsBlocked: row.items_blocked,
  };
}

export function aggregateStartItems(
  items: readonly StartItemRow[],
): DeploymentActivationExecutionStartItemIntegritySnapshot {
  const readyItems = items.filter((item) => item.execution_status === "ready");
  const pendingItems = items.filter((item) => item.execution_status === "pending");
  const firstItem = [...items].sort(compareItems)[0] ?? null;

  return {
    durableItemCount: items.length,
    readyItemCount: readyItems.length,
    pendingItemCount: pendingItems.length,
    invalidStatusCount: items.filter(
      (item) => !["ready", "pending"].includes(item.execution_status),
    ).length,
    attemptedItemCount: items.filter((item) => item.attempt_count > 0).length,
    itemExecutionTimestampCount: items.filter(
      (item) => item.started_at !== null || item.completed_at !== null,
    ).length,
    rollbackTimestampCount: items.filter(
      (item) => item.rolled_back_at !== null,
    ).length,
    errorEvidenceCount: items.filter(
      (item) => item.error_code !== null || item.error_message !== null,
    ).length,
    duplicateExecutionItemKeyCount: duplicateCount(
      items.map((item) => item.execution_item_key),
    ),
    duplicatePlanItemKeyCount: duplicateCount(
      items.map((item) => item.plan_item_key),
    ),
    duplicateSequenceCount: duplicateCount(
      items.map((item) => String(item.sequence)),
    ),
    readyRootCount: readyItems.filter((item) => dependencyKeys(item).length === 0).length,
    pendingRootCount: pendingItems.filter((item) => dependencyKeys(item).length === 0).length,
    malformedDependencyCount: items.filter(
      (item) => !Array.isArray(item.dependency_keys),
    ).length,
    firstSequence: firstItem?.sequence ?? null,
    firstItemStatus: firstItem ? classifyItemStatus(firstItem.execution_status) : null,
  };
}

export function atomicStartRpcPayload(
  command: DeploymentActivationExecutionAtomicStartCommand,
): Record<string, unknown> {
  return {
    p_clinic_id: command.clinicId,
    p_deployment_run_key: command.deploymentRunId,
    p_session_id: command.sessionId,
    p_execution_key: command.executionKey,
    p_claimant_id: command.claimantId,
    p_ownership_token: command.ownershipToken,
    p_expected_lease_expires_at: command.expectedLeaseExpiresAt,
    p_proposed_started_at: command.proposedStartedAt,
    p_expected_item_count: command.expectedItemCount,
  };
}

export function mapAtomicStartRpcResult(
  row: StartRpcRow,
): DeploymentActivationExecutionAtomicStartResult {
  const status = readAtomicStartStatus(row.status);

  return {
    ok: status === "started" || status === "already_started",
    status,
    sessionId: row.session_id,
    executionKey: row.execution_key,
    owner: row.execution_owner,
    leaseExpiresAt: row.lease_expires_at,
    executionStatus: row.execution_status,
    startedAt: row.started_at,
    itemCount: row.item_count ?? 0,
    issueCode: row.issue_code,
    message: row.message ?? "Activation execution start RPC returned no message.",
  };
}

function readSingleRpcRow(data: unknown): StartRpcRow {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentActivationExecutionStartRepositoryError(
      "Malformed activation execution start RPC response.",
    );
  }

  return row as StartRpcRow;
}

function readAtomicStartStatus(
  value: string | null,
): DeploymentActivationExecutionAtomicStartResult["status"] {
  const allowed = [
    "started",
    "already_started",
    "blocked",
    "conflict",
    "not_found",
    "error",
  ] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentActivationExecutionAtomicStartResult["status"];
  }

  throw new DeploymentActivationExecutionStartRepositoryError(
    "Malformed activation execution start RPC status.",
  );
}

function classifyItemStatus(
  status: string,
): DeploymentActivationExecutionStartItemIntegritySnapshot["firstItemStatus"] {
  if (status === "ready" || status === "pending") {
    return status;
  }

  if (status === "blocked") {
    return "blocked";
  }

  if (status === "running") {
    return "running";
  }

  return "terminal";
}

function dependencyKeys(item: StartItemRow): string[] {
  return Array.isArray(item.dependency_keys) &&
    item.dependency_keys.every((value) => typeof value === "string")
    ? [...item.dependency_keys]
    : [];
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

function compareItems(left: StartItemRow, right: StartItemRow): number {
  return (
    left.sequence - right.sequence ||
    left.execution_item_key.localeCompare(right.execution_item_key)
  );
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentActivationExecutionStartRepositoryError(
      `Ambiguous ${label} rows prevent deterministic activation execution start.`,
    );
  }
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentActivationExecutionStartRepositoryError {
  return new DeploymentActivationExecutionStartRepositoryError(
    "Activation execution start repository query failed.",
    error.code ?? null,
  );
}