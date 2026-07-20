import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentWorkstationShellExecutionItemCompletionRepository,
} from "./deployment-workstation-shell-execution-item-completion-repository";
import {
  emptyWorkstationShellExecutionItemCompletionAggregate,
  type DeploymentWorkstationShellExecutionAtomicItemCompletionCommand,
  type DeploymentWorkstationShellExecutionAtomicItemCompletionDiagnostics,
  type DeploymentWorkstationShellExecutionAtomicItemCompletionResult,
  type DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionItemSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot,
  type DeploymentWorkstationShellExecutionItemCompletionSnapshot,
} from "./deployment-workstation-shell-execution-item-completion-types";

const SESSION_COLUMNS = [
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

const ITEM_COLUMNS = [
  "id",
  "session_id",
  "execution_item_key",
  "plan_item_key",
  "sequence",
  "entity_type",
  "entity_id",
  "deployment_key",
  "action",
  "execution_status",
  "attempt_count",
  "started_at",
  "completed_at",
  "rolled_back_at",
  "error_code",
  "error_message",
  "expected_current_state",
  "target_state",
  "dependency_keys",
  "reversible",
].join(",");

const WORKSTATION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_workstation_key",
  "provisioning_source",
  "provisioning_status",
  "active",
  "updated_at",
].join(",");

const RPC_NAME = "complete_deployment_workstation_shell_execution_item";
const REDACTED = "[redacted]";

export type WorkstationShellItemCompletionSessionRow = {
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

export type WorkstationShellItemCompletionItemRow = {
  id: string;
  session_id: string;
  execution_item_key: string;
  plan_item_key: string;
  sequence: number;
  entity_type: string;
  entity_id: string | null;
  deployment_key: string | null;
  action: string;
  execution_status: string;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  rolled_back_at: string | null;
  error_code: string | null;
  error_message: string | null;
  expected_current_state: unknown;
  target_state: unknown;
  dependency_keys: unknown;
  reversible: boolean | null;
};

export type WorkstationShellItemCompletionWorkstationRow = {
  id: string;
  clinic_id: string | null;
  deployment_workstation_key: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
  updated_at: string | null;
};

type WorkstationShellItemCompletionRpcRow = {
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
  entity_id: string | null;
  deployment_workstation_key: string | null;
  action: string | null;
  workstation_id: string | null;
  item_status_before: string | null;
  item_status_after: string | null;
  started_at: string | null;
  completed_at: string | null;
  attempt_count: number | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class DeploymentWorkstationShellExecutionItemCompletionRepositoryError extends Error {
  readonly diagnostics: DeploymentWorkstationShellExecutionAtomicItemCompletionDiagnostics;

  constructor(input: { message: string; diagnostics?: DeploymentWorkstationShellExecutionAtomicItemCompletionDiagnostics }) {
    super(input.message);
    this.name = "DeploymentWorkstationShellExecutionItemCompletionRepositoryError";
    this.diagnostics = input.diagnostics ?? {};
  }
}

export class SupabaseDeploymentWorkstationShellExecutionItemCompletionRepository
  implements DeploymentWorkstationShellExecutionItemCompletionRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadWorkstationShellExecutionItemCompletionSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentWorkstationShellExecutionItemCompletionSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        item: null,
        items: [],
        workstation: null,
        aggregate: emptyWorkstationShellExecutionItemCompletionAggregate(),
      };
    }

    const items = await this.listItems(session.id);
    const selectedItem = selectWorkstationShellCompletionItem(items);
    const workstation = selectedItem ? await this.findWorkstation(input.clinicId, selectedItem) : null;

    return {
      session: mapWorkstationShellItemCompletionSessionRow(session),
      item: mapWorkstationShellItemCompletionItemRow(selectedItem),
      items: items.map(mapWorkstationShellItemCompletionItemRow).filter((item): item is DeploymentWorkstationShellExecutionItemCompletionItemSnapshot => item !== null),
      workstation: workstation ? mapWorkstationShellItemCompletionWorkstationRow(workstation) : null,
      aggregate: aggregateWorkstationShellItemCompletionRows(items, workstation ? [workstation] : []),
    };
  }

  async completeWorkstationShellExecutionItemAtomically(
    command: DeploymentWorkstationShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentWorkstationShellExecutionAtomicItemCompletionResult> {
    const payload = workstationShellItemCompletionRpcPayload(command);
    const { data, error } = await this.client.rpc(RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error, command.ownershipToken, "atomic_rpc");
    }

    return mapWorkstationShellItemCompletionRpcResult(readSingleRpcRow(data, "atomic_rpc_response_mapping"));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<WorkstationShellItemCompletionSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_session_lookup");
    }

    const rows = (data ?? []) as unknown as WorkstationShellItemCompletionSessionRow[];
    assertAtMostOne(rows, "workstation-shell item-completion session");
    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly WorkstationShellItemCompletionItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error, null, "snapshot_item_listing");
    }

    return (data ?? []) as unknown as WorkstationShellItemCompletionItemRow[];
  }

  private async findWorkstation(
    clinicId: string,
    item: WorkstationShellItemCompletionItemRow,
  ): Promise<WorkstationShellItemCompletionWorkstationRow | null> {
    const deploymentWorkstationKey = readDeploymentWorkstationKey(item);

    if (!item.entity_id || !deploymentWorkstationKey) {
      return null;
    }

    const { data, error } = await this.client
      .from("clinical_workstations")
      .select(WORKSTATION_COLUMNS)
      .eq("id", item.entity_id)
      .eq("clinic_id", clinicId)
      .eq("deployment_workstation_key", deploymentWorkstationKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_workstation_lookup");
    }

    const rows = (data ?? []) as unknown as WorkstationShellItemCompletionWorkstationRow[];
    assertAtMostOne(rows, "workstation-shell item-completion workstation");
    return rows[0] ?? null;
  }
}

export function mapWorkstationShellItemCompletionSessionRow(
  row: WorkstationShellItemCompletionSessionRow,
): DeploymentWorkstationShellExecutionItemCompletionSessionSnapshot {
  return {
    sessionId: row.id,
    clinicId: row.clinic_id,
    deploymentRunId: row.deployment_run_key,
    executionKey: row.execution_key,
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

export function mapWorkstationShellItemCompletionItemRow(
  row: WorkstationShellItemCompletionItemRow | null,
): DeploymentWorkstationShellExecutionItemCompletionItemSnapshot | null {
  if (!row) return null;
  return {
    itemId: row.id,
    sessionId: row.session_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    entityType: row.entity_type,
    entityId: row.entity_id,
    deploymentKey: row.deployment_key ?? readDeploymentWorkstationKey(row),
    action: row.action,
    executionStatus: row.execution_status,
    attemptCount: row.attempt_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    rolledBackAt: row.rolled_back_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    expectedCurrentState: readNullableRecord(row.expected_current_state),
    targetState: readNullableRecord(row.target_state),
    dependencyKeys: readStringArray(row.dependency_keys),
    reversible: row.reversible,
  };
}

export function mapWorkstationShellItemCompletionWorkstationRow(
  row: WorkstationShellItemCompletionWorkstationRow,
): DeploymentWorkstationShellExecutionItemCompletionWorkstationSnapshot {
  return {
    workstationId: row.id,
    clinicId: row.clinic_id,
    deploymentWorkstationKey: row.deployment_workstation_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active,
    updatedAt: row.updated_at,
  };
}

export function aggregateWorkstationShellItemCompletionRows(
  items: readonly WorkstationShellItemCompletionItemRow[],
  workstations: readonly WorkstationShellItemCompletionWorkstationRow[],
): DeploymentWorkstationShellExecutionItemCompletionAggregateSnapshot {
  const ordered = [...items].sort(compareRows);
  const selected = selectWorkstationShellCompletionItem(ordered);
  return {
    totalItemCount: items.length,
    succeededItemCount: items.filter((item) => item.execution_status === "succeeded").length,
    runningItemCount: items.filter((item) => item.execution_status === "running").length,
    readyItemCount: items.filter((item) => item.execution_status === "ready").length,
    pendingItemCount: items.filter((item) => item.execution_status === "pending").length,
    failedItemCount: items.filter((item) => ["failed", "blocked", "cancelled", "rolled_back"].includes(item.execution_status)).length,
    duplicateExecutionItemKeyCount: duplicateCount(items.map((item) => item.execution_item_key)),
    duplicatePlanItemKeyCount: duplicateCount(items.map((item) => item.plan_item_key)),
    duplicateSequenceCount: duplicateCount(items.map((item) => String(item.sequence))),
    duplicateWorkstationDeploymentIdentityCount: duplicateCount(workstations.map((workstation) => `${workstation.clinic_id ?? "global"}:${workstation.deployment_workstation_key ?? "null"}`)),
    unexpectedTouchedLaterItemCount: selected ? items.filter((item) => item.sequence > selected.sequence && hasLaterDrift(item)).length : 0,
    priorSucceededPrefixCount: succeededPrefix(ordered).length,
    runningWorkstationItemCount: items.filter((item) => item.execution_status === "running" && item.entity_type === "workstation_shell").length,
  };
}

export function selectWorkstationShellCompletionItem(
  items: readonly WorkstationShellItemCompletionItemRow[],
): WorkstationShellItemCompletionItemRow | null {
  const workstationItems = items.filter((item) => item.entity_type === "workstation_shell" && ["running", "succeeded"].includes(item.execution_status));
  const running = workstationItems.filter((item) => item.execution_status === "running");
  const selected = running[0] ?? workstationItems.sort(compareRows)[workstationItems.length - 1] ?? null;
  if (!selected) return null;
  const matches = items.filter((item) => item.id === selected.id && item.execution_item_key === selected.execution_item_key && item.plan_item_key === selected.plan_item_key);
  assertAtMostOne(matches, "workstation-shell item-completion item");
  return selected;
}

export function workstationShellItemCompletionRpcPayload(
  command: DeploymentWorkstationShellExecutionAtomicItemCompletionCommand,
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
    p_expected_entity_id: command.expectedEntityId,
    p_expected_deployment_workstation_key: command.expectedDeploymentWorkstationKey,
    p_expected_action: command.expectedAction,
    p_expected_item_started_at: command.expectedItemStartedAt,
    p_expected_attempt_count: command.expectedAttemptCount,
    p_workstation_id: command.workstationId,
    p_expected_workstation_state: cloneRecord(command.expectedWorkstationState),
    p_expected_target_state: cloneRecord(command.expectedTargetState),
    p_proposed_completed_at: command.proposedCompletedAt,
  };
}

export function mapWorkstationShellItemCompletionRpcResult(
  row: WorkstationShellItemCompletionRpcRow,
): DeploymentWorkstationShellExecutionAtomicItemCompletionResult {
  const status = readStatus(row.status);
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
    entityId: row.entity_id,
    deploymentWorkstationKey: row.deployment_workstation_key,
    action: row.action,
    workstationId: row.workstation_id,
    itemStatusBefore: row.item_status_before,
    itemStatusAfter: row.item_status_after,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    attemptCount: row.attempt_count ?? 0,
    issueCode: row.issue_code,
    message: row.message ?? "Workstation-shell item-completion RPC returned no message.",
  };
}

export function readSingleRpcRow(data: unknown, layer = "rpc_response_mapping"): WorkstationShellItemCompletionRpcRow {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length !== 1) {
    throw new DeploymentWorkstationShellExecutionItemCompletionRepositoryError({ message: "Ambiguous workstation-shell item-completion RPC response.", diagnostics: { layer } });
  }
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentWorkstationShellExecutionItemCompletionRepositoryError({ message: "Malformed workstation-shell item-completion RPC response.", diagnostics: { layer } });
  }
  return row as WorkstationShellItemCompletionRpcRow;
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentWorkstationShellExecutionItemCompletionRepositoryError({ message: `Ambiguous ${label} rows prevent deterministic workstation-shell item completion.` });
  }
}

function readStatus(value: string | null): DeploymentWorkstationShellExecutionAtomicItemCompletionResult["status"] {
  const allowed = ["completed", "already_completed", "blocked", "conflict", "not_found", "error"] as const;
  if (allowed.includes(value as (typeof allowed)[number])) return value as DeploymentWorkstationShellExecutionAtomicItemCompletionResult["status"];
  throw new DeploymentWorkstationShellExecutionItemCompletionRepositoryError({ message: "Malformed workstation-shell item-completion RPC status.", diagnostics: { layer: "atomic_rpc_response_mapping" } });
}

function readDeploymentWorkstationKey(item: WorkstationShellItemCompletionItemRow): string | null {
  return item.deployment_key ??
    readStringField(item.expected_current_state, "deploymentWorkstationKey") ??
    readStringField(item.expected_current_state, "deployment_workstation_key") ??
    null;
}

function readStringField(source: unknown, key: string): string | null {
  const record = readNullableRecord(source);
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : [];
}

function readNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? cloneRecord(value as Record<string, unknown>) : null;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function duplicateCount(values: readonly string[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return duplicates.size;
}

function compareRows(left: WorkstationShellItemCompletionItemRow, right: WorkstationShellItemCompletionItemRow): number {
  return left.sequence - right.sequence || left.execution_item_key.localeCompare(right.execution_item_key);
}

function succeededPrefix(items: readonly WorkstationShellItemCompletionItemRow[]): WorkstationShellItemCompletionItemRow[] {
  const prefix: WorkstationShellItemCompletionItemRow[] = [];
  let expected = 1;
  for (const item of items) {
    if (item.sequence !== expected || item.execution_status !== "succeeded") break;
    prefix.push(item);
    expected += 1;
  }
  return prefix;
}

function hasLaterDrift(item: WorkstationShellItemCompletionItemRow): boolean {
  return item.execution_status !== "pending" || item.attempt_count !== 0 || item.started_at !== null || item.completed_at !== null || item.rolled_back_at !== null || item.error_code !== null || item.error_message !== null;
}

function toRepositoryError(error: SupabaseErrorLike, token: string | null, layer: string): DeploymentWorkstationShellExecutionItemCompletionRepositoryError {
  const diagnostics = {
    layer,
    errorCode: error.code ?? null,
    errorMessage: redact(error.message, token),
    errorDetails: error.details ? redact(error.details, token) : null,
    errorHint: error.hint ? redact(error.hint, token) : null,
  };
  return new DeploymentWorkstationShellExecutionItemCompletionRepositoryError({
    message: "Workstation-shell item-completion repository query failed safely.",
    diagnostics,
  });
}

function redact(value: string, token: string | null): string {
  return token ? value.split(token).join(REDACTED) : value;
}
