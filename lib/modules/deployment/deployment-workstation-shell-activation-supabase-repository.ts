import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentWorkstationShellActivationRepository,
} from "./deployment-workstation-shell-activation-repository";
import {
  emptyWorkstationShellActivationAggregate,
  type DeploymentWorkstationShellActivationAggregateSnapshot,
  type DeploymentWorkstationShellActivationAtomicCommand,
  type DeploymentWorkstationShellActivationAtomicResult,
  type DeploymentWorkstationShellActivationItemSnapshot,
  type DeploymentWorkstationShellActivationWorkstationLookupDiagnostics,
  type DeploymentWorkstationShellActivationWorkstationSnapshot,
  type DeploymentWorkstationShellActivationSessionSnapshot,
  type DeploymentWorkstationShellActivationSnapshot,
} from "./deployment-workstation-shell-activation-types";

const WORKSTATION_ACTIVATION_SESSION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_run_key",
  "execution_key",
  "plan_key",
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

const WORKSTATION_ACTIVATION_ITEM_COLUMNS = [
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

const WORKSTATION_ACTIVATION_WORKSTATION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_workstation_key",
  "active",
  "provisioning_source",
  "provisioning_status",
].join(",");

const WORKSTATION_ACTIVATION_RPC_NAME = "activate_deployment_workstation_shell";
const REDACTED = "[redacted]";

export type WorkstationShellActivationSessionRow = {
  id: string;
  clinic_id: string;
  deployment_run_key: string;
  execution_key: string;
  plan_key: string;
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

export type WorkstationShellActivationItemRow = {
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

export type WorkstationShellActivationWorkstationRow = {
  id: string;
  clinic_id: string | null;
  deployment_workstation_key: string | null;
  active: boolean | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
};

type WorkstationShellActivationRpcRow = {
  status: string | null;
  clinic_id: string | null;
  deployment_run_key: string | null;
  session_id: string | null;
  execution_key: string | null;
  item_id: string | null;
  execution_item_key: string | null;
  plan_item_key: string | null;
  sequence: number | null;
  workstation_id: string | null;
  deployment_workstation_key: string | null;
  workstation_state_before: unknown;
  workstation_state_after: unknown;
  activated_at: string | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class DeploymentWorkstationShellActivationRepositoryError extends Error {
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
    this.name = "DeploymentWorkstationShellActivationRepositoryError";
    this.code = input.code ?? null;
    this.details = input.details ?? null;
    this.hint = input.hint ?? null;
    this.layer = input.layer ?? "repository";
  }
}

export class SupabaseDeploymentWorkstationShellActivationRepository
  implements DeploymentWorkstationShellActivationRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadWorkstationShellActivationSnapshot(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentWorkstationShellActivationSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        items: [],
        workstationShell: null,
        workstationLookup: notAttemptedWorkstationLookup(),
        aggregate: emptyWorkstationShellActivationAggregate(),
      };
    }

    const items = await this.listItems(session.id);
    const workstationLookup = selectRunningWorkstationLookup(items);
    const workstations = workstationLookup.deploymentWorkstationKey
      ? await this.listWorkstations(input.clinicId, workstationLookup.deploymentWorkstationKey)
      : [];
    const workstationShell = workstations.length === 1 ? mapWorkstationShellActivationWorkstationRow(workstations[0]) : null;

    return {
      session: mapWorkstationShellActivationSessionRow(session),
      items: items.map(mapWorkstationShellActivationItemRow),
      workstationShell,
      workstationLookup: {
        ...workstationLookup,
        rowsReturned: workstations.length,
        result: workstationLookup.attempted
          ? workstations.length === 0
            ? "zero_rows"
            : workstations.length === 1
              ? "mapped"
              : "multiple_rows"
          : "not_attempted",
      },
      aggregate: aggregateWorkstationShellActivationRows(items, workstations),
    };
  }

  async activateWorkstationShellAtomically(
    command: DeploymentWorkstationShellActivationAtomicCommand,
  ): Promise<DeploymentWorkstationShellActivationAtomicResult> {
    const payload = workstationShellActivationRpcPayload(command);
    const { data, error } = await this.client.rpc(WORKSTATION_ACTIVATION_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error, command.ownershipToken, "atomic_rpc");
    }

    return mapWorkstationShellActivationRpcResult(readSingleRpcRow(data, "atomic_rpc_response_mapping"));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<WorkstationShellActivationSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(WORKSTATION_ACTIVATION_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunKey)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_session_lookup");
    }

    const rows = (data ?? []) as unknown as WorkstationShellActivationSessionRow[];
    assertAtMostOne(rows, "workstation shell activation session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly WorkstationShellActivationItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(WORKSTATION_ACTIVATION_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error, null, "snapshot_item_listing");
    }

    return (data ?? []) as unknown as WorkstationShellActivationItemRow[];
  }

  private async listWorkstations(
    clinicId: string,
    deploymentWorkstationKey: string,
  ): Promise<readonly WorkstationShellActivationWorkstationRow[]> {
    const { data, error } = await this.client
      .from("clinical_workstations")
      .select(WORKSTATION_ACTIVATION_WORKSTATION_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_workstation_key", deploymentWorkstationKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_workstation_lookup");
    }

    return (data ?? []) as unknown as WorkstationShellActivationWorkstationRow[];
  }
}

export function mapWorkstationShellActivationSessionRow(
  row: WorkstationShellActivationSessionRow,
): DeploymentWorkstationShellActivationSessionSnapshot {
  return {
    clinicId: row.clinic_id,
    deploymentRunKey: row.deployment_run_key,
    sessionId: row.id,
    executionKey: row.execution_key,
    planKey: row.plan_key,
    preparationStatus: row.preparation_status,
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

export function mapWorkstationShellActivationItemRow(
  row: WorkstationShellActivationItemRow,
): DeploymentWorkstationShellActivationItemSnapshot {
  return {
    itemId: row.id,
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

export function mapWorkstationShellActivationWorkstationRow(
  row: WorkstationShellActivationWorkstationRow,
): DeploymentWorkstationShellActivationWorkstationSnapshot {
  return {
    workstationId: row.id,
    clinicId: row.clinic_id,
    deploymentWorkstationKey: row.deployment_workstation_key,
    active: row.active,
    planned: row.provisioning_source === "setup_draft" && row.provisioning_status === "planned" && row.active === false,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    archivedAt: null,
    deletedAt: null,
    currentState: workstationState(row),
  };
}

export function aggregateWorkstationShellActivationRows(
  items: readonly WorkstationShellActivationItemRow[],
  workstations: readonly WorkstationShellActivationWorkstationRow[],
): DeploymentWorkstationShellActivationAggregateSnapshot {
  const ordered = [...items].sort(compareRows);
  const prefix = getSucceededPrefix(ordered);
  const runningSequence = ordered.find((item) => item.execution_status === "running")?.sequence ?? prefix.length + 1;

  return {
    totalItemCount: items.length,
    succeededItemCount: items.filter((item) => item.execution_status === "succeeded").length,
    runningItemCount: items.filter((item) => item.execution_status === "running").length,
    pendingItemCount: items.filter((item) => item.execution_status === "pending").length,
    readyItemCount: items.filter((item) => item.execution_status === "ready").length,
    failedItemCount: items.filter((item) => ["failed", "blocked", "cancelled", "rolled_back"].includes(item.execution_status)).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((item) => item.execution_item_key)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((item) => item.plan_item_key)),
    duplicateSequenceCount: duplicateCount(items.map((item) => String(item.sequence))),
    succeededPlanItemKeys: prefix.map((item) => item.plan_item_key),
    succeededContiguousPrefixLength: prefix.length,
    laterPendingItemIntegrityIssueCount: items.filter((item) => item.sequence > runningSequence && hasLaterIntegrityIssue(item)).length,
    workstationCandidateCount: workstations.length,
    duplicateWorkstationIdentityCount: duplicateCount(workstations.map((workstation) => `${workstation.clinic_id ?? "global"}:${workstation.deployment_workstation_key ?? "null"}`)),
  };
}

export function workstationShellActivationRpcPayload(
  command: DeploymentWorkstationShellActivationAtomicCommand,
): Record<string, unknown> {
  return {
    p_clinic_id: command.clinicId,
    p_deployment_run_key: command.deploymentRunKey,
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
    p_expected_entity_id: command.expectedEntityId,
    p_expected_action: command.expectedAction,
    p_expected_item_started_at: command.expectedItemStartedAt,
    p_expected_attempt_count: command.expectedAttemptCount,
    p_workstation_id: command.workstationId,
    p_expected_workstation_key: command.expectedWorkstationKey,
    p_expected_current_state: cloneRecord(command.expectedCurrentState),
    p_target_state: cloneRecord(command.targetState),
    p_proposed_activated_at: command.proposedActivatedAt,
  };
}

export function mapWorkstationShellActivationRpcResult(
  row: WorkstationShellActivationRpcRow,
): DeploymentWorkstationShellActivationAtomicResult {
  const status = readWorkstationShellActivationAtomicStatus(row.status);

  return {
    ok: status === "activated" || status === "already_activated",
    status,
    clinicId: row.clinic_id,
    deploymentRunKey: row.deployment_run_key,
    sessionId: row.session_id,
    executionKey: row.execution_key,
    itemId: row.item_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    workstationId: row.workstation_id,
    deploymentWorkstationKey: row.deployment_workstation_key,
    workstationStateBefore: readNullableRecord(row.workstation_state_before),
    workstationStateAfter: readNullableRecord(row.workstation_state_after),
    activatedAt: row.activated_at,
    issueCode: row.issue_code,
    message: row.message ?? "Workstation shell activation RPC returned no message.",
  };
}

export function readSingleRpcRow(data: unknown, layer = "rpc_response_mapping"): WorkstationShellActivationRpcRow {
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length !== 1) {
    throw new DeploymentWorkstationShellActivationRepositoryError({
      message: "Ambiguous workstation shell activation RPC response.",
      layer,
    });
  }

  const row = rows[0];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentWorkstationShellActivationRepositoryError({
      message: "Malformed workstation shell activation RPC response.",
      layer,
    });
  }

  return row as WorkstationShellActivationRpcRow;
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentWorkstationShellActivationRepositoryError({
      message: `Ambiguous ${label} rows prevent deterministic workstation shell activation.`,
    });
  }
}

function readWorkstationShellActivationAtomicStatus(
  value: string | null,
): DeploymentWorkstationShellActivationAtomicResult["status"] {
  const allowed = ["activated", "already_activated", "blocked", "conflict", "not_found", "error"] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentWorkstationShellActivationAtomicResult["status"];
  }

  throw new DeploymentWorkstationShellActivationRepositoryError({
    message: "Malformed workstation shell activation RPC status.",
    layer: "atomic_rpc_response_mapping",
  });
}

export function selectRunningWorkstationLookup(
  items: readonly WorkstationShellActivationItemRow[],
): DeploymentWorkstationShellActivationWorkstationLookupDiagnostics {
  const runningWorkstation = [...items]
    .sort(compareRows)
    .find((item) => item.execution_status === "running" && item.entity_type === "workstation_shell");

  if (!runningWorkstation) {
    return notAttemptedWorkstationLookup();
  }

  const deploymentWorkstationKey = readDeploymentWorkstationKey(runningWorkstation);

  return {
    attempted: deploymentWorkstationKey !== null,
    result: deploymentWorkstationKey === null ? "not_attempted" : "zero_rows",
    rowsReturned: 0,
    deploymentWorkstationKey,
    workstationId: runningWorkstation.entity_id ?? null,
  };
}

function notAttemptedWorkstationLookup(): DeploymentWorkstationShellActivationWorkstationLookupDiagnostics {
  return {
    attempted: false,
    result: "not_attempted",
    rowsReturned: 0,
    deploymentWorkstationKey: null,
    workstationId: null,
  };
}

function readDeploymentWorkstationKey(item: WorkstationShellActivationItemRow): string | null {
  return readStringField(item.expected_current_state, "deploymentWorkstationKey") ??
    readStringField(item.expected_current_state, "deployment_workstation_key");
}


function readStringField(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}


function workstationState(row: WorkstationShellActivationWorkstationRow): Record<string, unknown> {
  return {
    deploymentWorkstationKey: row.deployment_workstation_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active,
  };
}

function getSucceededPrefix(items: readonly WorkstationShellActivationItemRow[]): WorkstationShellActivationItemRow[] {
  const prefix: WorkstationShellActivationItemRow[] = [];
  let expectedSequence = 1;

  for (const item of [...items].sort(compareRows)) {
    if (item.sequence !== expectedSequence || item.execution_status !== "succeeded") {
      break;
    }

    prefix.push(item);
    expectedSequence += 1;
  }

  return prefix;
}

function hasLaterIntegrityIssue(item: WorkstationShellActivationItemRow): boolean {
  return item.execution_status !== "pending" || item.attempt_count !== 0 || item.started_at !== null || item.completed_at !== null || item.rolled_back_at !== null || item.error_code !== null || item.error_message !== null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : [];
}

function readNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? cloneRecord(value as Record<string, unknown>)
    : null;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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

function compareRows(left: WorkstationShellActivationItemRow, right: WorkstationShellActivationItemRow): number {
  return left.sequence - right.sequence || left.execution_item_key.localeCompare(right.execution_item_key);
}

function toRepositoryError(
  error: SupabaseErrorLike,
  sensitiveToken: string | null = null,
  layer = "repository",
): DeploymentWorkstationShellActivationRepositoryError {
  return new DeploymentWorkstationShellActivationRepositoryError({
    message: sanitizeDiagnostic(error.message || "Workstation shell activation repository query failed.", sensitiveToken) ?? "Workstation shell activation repository query failed.",
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