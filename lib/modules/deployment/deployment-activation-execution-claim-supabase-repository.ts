import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationExecutionClaimRepository,
} from "./deployment-activation-execution-claim-repository";
import {
  emptyClaimItemCompleteness,
  type DeploymentActivationExecutionAtomicClaimCommand,
  type DeploymentActivationExecutionAtomicClaimResult,
  type DeploymentActivationExecutionClaimItemCompletenessSnapshot,
  type DeploymentActivationExecutionClaimSessionSnapshot,
  type DeploymentActivationExecutionClaimSnapshot,
} from "./deployment-activation-execution-claim-types";

const CLAIM_SESSION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_run_record_id",
  "deployment_run_key",
  "execution_key",
  "plan_key",
  "preparation_status",
  "execution_status",
  "items_requested",
  "items_ready",
  "items_pending",
  "items_blocked",
  "blockers",
  "execution_owner",
  "ownership_token",
  "lease_expires_at",
  "started_at",
  "completed_at",
  "failed_at",
  "created_at",
  "updated_at",
].join(",");

const CLAIM_ITEM_COLUMNS = [
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

const CLAIM_RPC_NAME = "claim_deployment_activation_execution_session";

type ClaimSessionRow = {
  id: string;
  clinic_id: string;
  deployment_run_record_id: string;
  deployment_run_key: string;
  execution_key: string;
  plan_key: string;
  preparation_status: string;
  execution_status: string;
  items_requested: number;
  items_ready: number;
  items_pending: number;
  items_blocked: number;
  blockers: number;
  execution_owner: string | null;
  ownership_token: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClaimItemRow = {
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

type ClaimRpcRow = {
  status: string | null;
  session_id: string | null;
  execution_key: string | null;
  execution_owner: string | null;
  ownership_token?: string | null;
  lease_expires_at: string | null;
  execution_status: string | null;
  item_count: number | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentActivationExecutionClaimRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentActivationExecutionClaimRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentActivationExecutionClaimRepository
  implements DeploymentActivationExecutionClaimRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async getClaimSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionClaimSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        itemCompleteness: emptyClaimItemCompleteness(),
      };
    }

    const items = await this.listItems(session.id);

    return {
      session: mapClaimSessionRow(session),
      itemCompleteness: aggregateClaimItems(items),
    };
  }

  async claimSession(
    command: DeploymentActivationExecutionAtomicClaimCommand,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult> {
    const payload = atomicClaimRpcPayload(command);
    const { data, error } = await this.client.rpc(CLAIM_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error);
    }

    return mapAtomicClaimRpcResult(readSingleRpcRow(data));
  }

  async claimFreshSession(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult> {
    return this.claimSession({ ...command, mode: "fresh" });
  }

  async confirmSameOwnerClaim(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult> {
    return this.claimSession({ ...command, mode: "same_owner" });
  }

  async reclaimExpiredSession(
    command: Omit<DeploymentActivationExecutionAtomicClaimCommand, "mode">,
  ): Promise<DeploymentActivationExecutionAtomicClaimResult> {
    return this.claimSession({ ...command, mode: "expired_reclaim" });
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<ClaimSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(CLAIM_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClaimSessionRow[];
    assertAtMostOne(rows, "activation execution claim session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly ClaimItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(CLAIM_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    return (data ?? []) as unknown as ClaimItemRow[];
  }
}

export function mapClaimSessionRow(
  row: ClaimSessionRow,
): DeploymentActivationExecutionClaimSessionSnapshot {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentRunRecordId: row.deployment_run_record_id,
    deploymentRunId: row.deployment_run_key,
    executionKey: row.execution_key,
    planKey: row.plan_key,
    preparationStatus: row.preparation_status,
    executionStatus: row.execution_status,
    itemsRequested: row.items_requested,
    itemsReady: row.items_ready,
    itemsPending: row.items_pending,
    itemsBlocked: row.items_blocked,
    blockers: row.blockers,
    executionOwner: row.execution_owner,
    ownershipToken: row.ownership_token,
    leaseExpiresAt: row.lease_expires_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function aggregateClaimItems(
  items: readonly ClaimItemRow[],
): DeploymentActivationExecutionClaimItemCompletenessSnapshot {
  const duplicateExecutionItemKeyCount = duplicateCount(
    items.map((item) => item.execution_item_key),
  );
  const duplicatePlanItemKeyCount = duplicateCount(
    items.map((item) => item.plan_item_key),
  );
  const duplicateSequenceCount = duplicateCount(
    items.map((item) => String(item.sequence)),
  );
  const readyItems = items.filter((item) => item.execution_status === "ready");
  const pendingItems = items.filter((item) => item.execution_status === "pending");
  const firstItem = [...items].sort(compareItems)[0] ?? null;

  return {
    durableItemCount: items.length,
    duplicateExecutionItemKeyCount,
    duplicatePlanItemKeyCount,
    duplicateSequenceCount,
    invalidPreparedItemCount: items.filter(
      (item) => !["ready", "pending"].includes(item.execution_status),
    ).length,
    runningOrTerminalItemCount: items.filter((item) =>
      ["running", "succeeded", "failed", "skipped", "rollback_pending", "rolled_back"].includes(
        item.execution_status,
      ),
    ).length,
    itemsWithAttempts: items.filter((item) => item.attempt_count > 0).length,
    itemsWithExecutionTimestamps: items.filter(
      (item) => item.started_at !== null || item.completed_at !== null,
    ).length,
    itemsWithRollbackTimestamps: items.filter(
      (item) => item.rolled_back_at !== null,
    ).length,
    itemsWithErrors: items.filter(
      (item) => item.error_code !== null || item.error_message !== null,
    ).length,
    readyItemCount: readyItems.length,
    pendingItemCount: pendingItems.length,
    blockedItemCount: items.filter((item) => item.execution_status === "blocked").length,
    firstExecutableSequence: firstItem?.sequence ?? null,
    firstExecutableStatus: firstItem
      ? classifyItemStatus(firstItem.execution_status)
      : null,
    readyRootItemCount: readyItems.filter((item) => dependencyKeys(item).length === 0).length,
    pendingExecutableWithoutSatisfiedDependencies: pendingItems.filter(
      (item) => dependencyKeys(item).length === 0,
    ).length,
    dependencyIntegrityIssueCount: items.filter(
      (item) => !Array.isArray(item.dependency_keys),
    ).length,
  };
}

export function atomicClaimRpcPayload(
  command: DeploymentActivationExecutionAtomicClaimCommand,
): Record<string, unknown> {
  return {
    p_claim_mode: command.mode,
    p_clinic_id: command.clinicId,
    p_deployment_run_key: command.deploymentRunId,
    p_session_id: command.sessionId,
    p_execution_key: command.executionKey,
    p_claimant_id: command.claimantId,
    p_proposed_ownership_token: command.proposedOwnershipToken,
    p_claimed_at: command.claimRequestedAt,
    p_lease_expires_at: command.proposedLeaseExpiresAt,
    p_expected_item_count: command.expectedItemCount,
    p_expected_previous_owner: command.expectedPreviousOwner ?? null,
    p_expected_previous_ownership_token:
      command.expectedPreviousOwnershipToken ?? null,
    p_expected_previous_lease_expires_at:
      command.expectedPreviousLeaseExpiresAt ?? null,
  };
}

export function mapAtomicClaimRpcResult(
  row: ClaimRpcRow,
): DeploymentActivationExecutionAtomicClaimResult {
  const status = readAtomicStatus(row.status);

  return {
    ok: status === "claimed" || status === "already_owned" || status === "reclaimed",
    status,
    sessionId: row.session_id,
    executionKey: row.execution_key,
    owner: row.execution_owner,
    ownershipToken: row.ownership_token ?? null,
    leaseExpiresAt: row.lease_expires_at,
    executionStatus: row.execution_status,
    itemCount: row.item_count ?? 0,
    issueCode: row.issue_code,
    message: row.message ?? "Activation execution claim RPC returned no message.",
  };
}

function readSingleRpcRow(data: unknown): ClaimRpcRow {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentActivationExecutionClaimRepositoryError(
      "Malformed activation execution claim RPC response.",
    );
  }

  return row as ClaimRpcRow;
}

function readAtomicStatus(
  value: string | null,
): DeploymentActivationExecutionAtomicClaimResult["status"] {
  const allowed = [
    "claimed",
    "already_owned",
    "reclaimed",
    "blocked",
    "conflict",
    "not_found",
    "error",
  ] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentActivationExecutionAtomicClaimResult["status"];
  }

  throw new DeploymentActivationExecutionClaimRepositoryError(
    "Malformed activation execution claim RPC status.",
  );
}

function classifyItemStatus(
  status: string,
): DeploymentActivationExecutionClaimItemCompletenessSnapshot["firstExecutableStatus"] {
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

function dependencyKeys(item: ClaimItemRow): string[] {
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

function compareItems(left: ClaimItemRow, right: ClaimItemRow): number {
  return (
    left.sequence - right.sequence ||
    left.execution_item_key.localeCompare(right.execution_item_key)
  );
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentActivationExecutionClaimRepositoryError(
      `Ambiguous ${label} rows prevent deterministic activation execution claiming.`,
    );
  }
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentActivationExecutionClaimRepositoryError {
  return new DeploymentActivationExecutionClaimRepositoryError(
    "Activation execution claim repository query failed.",
    error.code ?? null,
  );
}
