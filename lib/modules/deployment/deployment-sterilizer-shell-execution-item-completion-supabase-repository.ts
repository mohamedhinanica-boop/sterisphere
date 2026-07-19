import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentSterilizerShellExecutionItemCompletionRepository,
} from "./deployment-sterilizer-shell-execution-item-completion-repository";
import {
  emptySterilizerShellExecutionItemCompletionAggregate,
  type DeploymentSterilizerShellExecutionAtomicItemCompletionCommand,
  type DeploymentSterilizerShellExecutionAtomicItemCompletionDiagnostics,
  type DeploymentSterilizerShellExecutionAtomicItemCompletionResult,
  type DeploymentSterilizerShellExecutionItemCompletionAggregateSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionItemSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot,
  type DeploymentSterilizerShellExecutionItemCompletionSnapshot,
} from "./deployment-sterilizer-shell-execution-item-completion-types";

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

const STERILIZER_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_sterilizer_key",
  "provisioning_source",
  "provisioning_status",
  "active",
  "updated_at",
].join(",");

const RPC_NAME = "complete_deployment_sterilizer_shell_execution_item";
const REDACTED = "[redacted]";

export type SterilizerShellItemCompletionSessionRow = {
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

export type SterilizerShellItemCompletionItemRow = {
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

export type SterilizerShellItemCompletionSterilizerRow = {
  id: string;
  clinic_id: string | null;
  deployment_sterilizer_key: string | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  active: boolean | null;
  updated_at: string | null;
};

type SterilizerShellItemCompletionRpcRow = {
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
  deployment_sterilizer_key: string | null;
  action: string | null;
  sterilizer_id: string | null;
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

export class DeploymentSterilizerShellExecutionItemCompletionRepositoryError extends Error {
  readonly diagnostics: DeploymentSterilizerShellExecutionAtomicItemCompletionDiagnostics;

  constructor(input: { message: string; diagnostics?: DeploymentSterilizerShellExecutionAtomicItemCompletionDiagnostics }) {
    super(input.message);
    this.name = "DeploymentSterilizerShellExecutionItemCompletionRepositoryError";
    this.diagnostics = input.diagnostics ?? {};
  }
}

export class SupabaseDeploymentSterilizerShellExecutionItemCompletionRepository
  implements DeploymentSterilizerShellExecutionItemCompletionRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadSterilizerShellExecutionItemCompletionSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentSterilizerShellExecutionItemCompletionSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        item: null,
        items: [],
        sterilizer: null,
        aggregate: emptySterilizerShellExecutionItemCompletionAggregate(),
      };
    }

    const items = await this.listItems(session.id);
    const selectedItem = selectSterilizerShellCompletionItem(items);
    const sterilizer = selectedItem ? await this.findSterilizer(input.clinicId, selectedItem) : null;

    return {
      session: mapSterilizerShellItemCompletionSessionRow(session),
      item: mapSterilizerShellItemCompletionItemRow(selectedItem),
      items: items.map(mapSterilizerShellItemCompletionItemRow).filter((item): item is DeploymentSterilizerShellExecutionItemCompletionItemSnapshot => item !== null),
      sterilizer: sterilizer ? mapSterilizerShellItemCompletionSterilizerRow(sterilizer) : null,
      aggregate: aggregateSterilizerShellItemCompletionRows(items, sterilizer ? [sterilizer] : []),
    };
  }

  async completeSterilizerShellExecutionItemAtomically(
    command: DeploymentSterilizerShellExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentSterilizerShellExecutionAtomicItemCompletionResult> {
    const payload = sterilizerShellItemCompletionRpcPayload(command);
    const { data, error } = await this.client.rpc(RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error, command.ownershipToken, "atomic_rpc");
    }

    return mapSterilizerShellItemCompletionRpcResult(readSingleRpcRow(data, "atomic_rpc_response_mapping"));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<SterilizerShellItemCompletionSessionRow | null> {
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

    const rows = (data ?? []) as unknown as SterilizerShellItemCompletionSessionRow[];
    assertAtMostOne(rows, "sterilizer-shell item-completion session");
    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly SterilizerShellItemCompletionItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error, null, "snapshot_item_listing");
    }

    return (data ?? []) as unknown as SterilizerShellItemCompletionItemRow[];
  }

  private async findSterilizer(
    clinicId: string,
    item: SterilizerShellItemCompletionItemRow,
  ): Promise<SterilizerShellItemCompletionSterilizerRow | null> {
    const deploymentSterilizerKey = readDeploymentSterilizerKey(item);

    if (!item.entity_id || !deploymentSterilizerKey) {
      return null;
    }

    const { data, error } = await this.client
      .from("sterilizers")
      .select(STERILIZER_COLUMNS)
      .eq("id", item.entity_id)
      .eq("clinic_id", clinicId)
      .eq("deployment_sterilizer_key", deploymentSterilizerKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_sterilizer_lookup");
    }

    const rows = (data ?? []) as unknown as SterilizerShellItemCompletionSterilizerRow[];
    assertAtMostOne(rows, "sterilizer-shell item-completion sterilizer");
    return rows[0] ?? null;
  }
}

export function mapSterilizerShellItemCompletionSessionRow(
  row: SterilizerShellItemCompletionSessionRow,
): DeploymentSterilizerShellExecutionItemCompletionSessionSnapshot {
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

export function mapSterilizerShellItemCompletionItemRow(
  row: SterilizerShellItemCompletionItemRow | null,
): DeploymentSterilizerShellExecutionItemCompletionItemSnapshot | null {
  if (!row) return null;
  return {
    itemId: row.id,
    sessionId: row.session_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    entityType: row.entity_type,
    entityId: row.entity_id,
    deploymentKey: row.deployment_key ?? readDeploymentSterilizerKey(row),
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

export function mapSterilizerShellItemCompletionSterilizerRow(
  row: SterilizerShellItemCompletionSterilizerRow,
): DeploymentSterilizerShellExecutionItemCompletionSterilizerSnapshot {
  return {
    sterilizerId: row.id,
    clinicId: row.clinic_id,
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active,
    updatedAt: row.updated_at,
  };
}

export function aggregateSterilizerShellItemCompletionRows(
  items: readonly SterilizerShellItemCompletionItemRow[],
  sterilizers: readonly SterilizerShellItemCompletionSterilizerRow[],
): DeploymentSterilizerShellExecutionItemCompletionAggregateSnapshot {
  const ordered = [...items].sort(compareRows);
  const selected = selectSterilizerShellCompletionItem(ordered);
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
    duplicateSterilizerDeploymentIdentityCount: duplicateCount(sterilizers.map((sterilizer) => `${sterilizer.clinic_id ?? "global"}:${sterilizer.deployment_sterilizer_key ?? "null"}`)),
    unexpectedTouchedLaterItemCount: selected ? items.filter((item) => item.sequence > selected.sequence && hasLaterDrift(item)).length : 0,
    priorSucceededPrefixCount: succeededPrefix(ordered).length,
    runningSterilizerItemCount: items.filter((item) => item.execution_status === "running" && item.entity_type === "sterilizer_shell").length,
  };
}

export function selectSterilizerShellCompletionItem(
  items: readonly SterilizerShellItemCompletionItemRow[],
): SterilizerShellItemCompletionItemRow | null {
  const sterilizerItems = items.filter((item) => item.entity_type === "sterilizer_shell" && ["running", "succeeded"].includes(item.execution_status));
  const running = sterilizerItems.filter((item) => item.execution_status === "running");
  const selected = running[0] ?? sterilizerItems.sort(compareRows)[sterilizerItems.length - 1] ?? null;
  if (!selected) return null;
  const matches = items.filter((item) => item.id === selected.id && item.execution_item_key === selected.execution_item_key && item.plan_item_key === selected.plan_item_key);
  assertAtMostOne(matches, "sterilizer-shell item-completion item");
  return selected;
}

export function sterilizerShellItemCompletionRpcPayload(
  command: DeploymentSterilizerShellExecutionAtomicItemCompletionCommand,
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
    p_expected_deployment_sterilizer_key: command.expectedDeploymentSterilizerKey,
    p_expected_action: command.expectedAction,
    p_expected_item_started_at: command.expectedItemStartedAt,
    p_expected_attempt_count: command.expectedAttemptCount,
    p_sterilizer_id: command.sterilizerId,
    p_expected_sterilizer_state: cloneRecord(command.expectedSterilizerState),
    p_expected_target_state: cloneRecord(command.expectedTargetState),
    p_proposed_completed_at: command.proposedCompletedAt,
  };
}

export function mapSterilizerShellItemCompletionRpcResult(
  row: SterilizerShellItemCompletionRpcRow,
): DeploymentSterilizerShellExecutionAtomicItemCompletionResult {
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
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    action: row.action,
    sterilizerId: row.sterilizer_id,
    itemStatusBefore: row.item_status_before,
    itemStatusAfter: row.item_status_after,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    attemptCount: row.attempt_count ?? 0,
    issueCode: row.issue_code,
    message: row.message ?? "Sterilizer-shell item-completion RPC returned no message.",
  };
}

export function readSingleRpcRow(data: unknown, layer = "rpc_response_mapping"): SterilizerShellItemCompletionRpcRow {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length !== 1) {
    throw new DeploymentSterilizerShellExecutionItemCompletionRepositoryError({ message: "Ambiguous sterilizer-shell item-completion RPC response.", diagnostics: { layer } });
  }
  const row = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentSterilizerShellExecutionItemCompletionRepositoryError({ message: "Malformed sterilizer-shell item-completion RPC response.", diagnostics: { layer } });
  }
  return row as SterilizerShellItemCompletionRpcRow;
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentSterilizerShellExecutionItemCompletionRepositoryError({ message: `Ambiguous ${label} rows prevent deterministic sterilizer-shell item completion.` });
  }
}

function readStatus(value: string | null): DeploymentSterilizerShellExecutionAtomicItemCompletionResult["status"] {
  const allowed = ["completed", "already_completed", "blocked", "conflict", "not_found", "error"] as const;
  if (allowed.includes(value as (typeof allowed)[number])) return value as DeploymentSterilizerShellExecutionAtomicItemCompletionResult["status"];
  throw new DeploymentSterilizerShellExecutionItemCompletionRepositoryError({ message: "Malformed sterilizer-shell item-completion RPC status.", diagnostics: { layer: "atomic_rpc_response_mapping" } });
}

function readDeploymentSterilizerKey(item: SterilizerShellItemCompletionItemRow): string | null {
  return readStringField(item.target_state, "deploymentSterilizerKey") ??
    readStringField(item.target_state, "deployment_sterilizer_key") ??
    readStringField(item.expected_current_state, "deploymentSterilizerKey") ??
    readStringField(item.expected_current_state, "deployment_sterilizer_key") ??
    item.deployment_key ??
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

function compareRows(left: SterilizerShellItemCompletionItemRow, right: SterilizerShellItemCompletionItemRow): number {
  return left.sequence - right.sequence || left.execution_item_key.localeCompare(right.execution_item_key);
}

function succeededPrefix(items: readonly SterilizerShellItemCompletionItemRow[]): SterilizerShellItemCompletionItemRow[] {
  const prefix: SterilizerShellItemCompletionItemRow[] = [];
  let expected = 1;
  for (const item of items) {
    if (item.sequence !== expected || item.execution_status !== "succeeded") break;
    prefix.push(item);
    expected += 1;
  }
  return prefix;
}

function hasLaterDrift(item: SterilizerShellItemCompletionItemRow): boolean {
  return item.execution_status !== "pending" || item.attempt_count !== 0 || item.started_at !== null || item.completed_at !== null || item.rolled_back_at !== null || item.error_code !== null || item.error_message !== null;
}

function toRepositoryError(error: SupabaseErrorLike, token: string | null, layer: string): DeploymentSterilizerShellExecutionItemCompletionRepositoryError {
  const diagnostics = {
    layer,
    errorCode: error.code ?? null,
    errorMessage: redact(error.message, token),
    errorDetails: error.details ? redact(error.details, token) : null,
    errorHint: error.hint ? redact(error.hint, token) : null,
  };
  return new DeploymentSterilizerShellExecutionItemCompletionRepositoryError({
    message: "Sterilizer-shell item-completion repository query failed safely.",
    diagnostics,
  });
}

function redact(value: string, token: string | null): string {
  return token ? value.split(token).join(REDACTED) : value;
}
