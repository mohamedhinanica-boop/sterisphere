import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentSterilizerShellActivationRepository,
} from "./deployment-sterilizer-shell-activation-repository";
import {
  emptySterilizerShellActivationAggregate,
  type DeploymentSterilizerShellActivationAggregateSnapshot,
  type DeploymentSterilizerShellActivationAtomicCommand,
  type DeploymentSterilizerShellActivationAtomicResult,
  type DeploymentSterilizerShellActivationItemSnapshot,
  type DeploymentSterilizerShellActivationSterilizerLookupDiagnostics,
  type DeploymentSterilizerShellActivationSterilizerSnapshot,
  type DeploymentSterilizerShellActivationSessionSnapshot,
  type DeploymentSterilizerShellActivationSnapshot,
} from "./deployment-sterilizer-shell-activation-types";

const STERILIZER_ACTIVATION_SESSION_COLUMNS = [
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

const STERILIZER_ACTIVATION_ITEM_COLUMNS = [
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

const STERILIZER_ACTIVATION_STERILIZER_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_sterilizer_key",
  "active",
  "provisioning_source",
  "provisioning_status",
].join(",");

const STERILIZER_ACTIVATION_RPC_NAME = "activate_deployment_sterilizer_shell";
const REDACTED = "[redacted]";

export type SterilizerShellActivationSessionRow = {
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

export type SterilizerShellActivationItemRow = {
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

export type SterilizerShellActivationSterilizerRow = {
  id: string;
  clinic_id: string | null;
  deployment_sterilizer_key: string | null;
  active: boolean | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
};

type SterilizerShellActivationRpcRow = {
  status: string | null;
  clinic_id: string | null;
  deployment_run_key: string | null;
  session_id: string | null;
  execution_key: string | null;
  item_id: string | null;
  execution_item_key: string | null;
  plan_item_key: string | null;
  sequence: number | null;
  sterilizer_id: string | null;
  deployment_sterilizer_key: string | null;
  sterilizer_state_before: unknown;
  sterilizer_state_after: unknown;
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

export class DeploymentSterilizerShellActivationRepositoryError extends Error {
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
    this.name = "DeploymentSterilizerShellActivationRepositoryError";
    this.code = input.code ?? null;
    this.details = input.details ?? null;
    this.hint = input.hint ?? null;
    this.layer = input.layer ?? "repository";
  }
}

export class SupabaseDeploymentSterilizerShellActivationRepository
  implements DeploymentSterilizerShellActivationRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadSterilizerShellActivationSnapshot(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentSterilizerShellActivationSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        items: [],
        sterilizerShell: null,
        sterilizerLookup: notAttemptedSterilizerLookup(),
        aggregate: emptySterilizerShellActivationAggregate(),
      };
    }

    const items = await this.listItems(session.id);
    const sterilizerLookup = selectRunningSterilizerLookup(items);
    const sterilizers = sterilizerLookup.deploymentSterilizerKey
      ? await this.listSterilizers(input.clinicId, sterilizerLookup.deploymentSterilizerKey)
      : [];
    const sterilizerShell = sterilizers.length === 1 ? mapSterilizerShellActivationSterilizerRow(sterilizers[0]) : null;

    return {
      session: mapSterilizerShellActivationSessionRow(session),
      items: items.map(mapSterilizerShellActivationItemRow),
      sterilizerShell,
      sterilizerLookup: {
        ...sterilizerLookup,
        rowsReturned: sterilizers.length,
        result: sterilizerLookup.attempted
          ? sterilizers.length === 0
            ? "zero_rows"
            : sterilizers.length === 1
              ? "mapped"
              : "multiple_rows"
          : "not_attempted",
      },
      aggregate: aggregateSterilizerShellActivationRows(items, sterilizers),
    };
  }

  async activateSterilizerShellAtomically(
    command: DeploymentSterilizerShellActivationAtomicCommand,
  ): Promise<DeploymentSterilizerShellActivationAtomicResult> {
    const payload = sterilizerShellActivationRpcPayload(command);
    const { data, error } = await this.client.rpc(STERILIZER_ACTIVATION_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error, command.ownershipToken, "atomic_rpc");
    }

    return mapSterilizerShellActivationRpcResult(readSingleRpcRow(data, "atomic_rpc_response_mapping"));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<SterilizerShellActivationSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(STERILIZER_ACTIVATION_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunKey)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_session_lookup");
    }

    const rows = (data ?? []) as unknown as SterilizerShellActivationSessionRow[];
    assertAtMostOne(rows, "sterilizer shell activation session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly SterilizerShellActivationItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(STERILIZER_ACTIVATION_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error, null, "snapshot_item_listing");
    }

    return (data ?? []) as unknown as SterilizerShellActivationItemRow[];
  }

  private async listSterilizers(
    clinicId: string,
    deploymentSterilizerKey: string,
  ): Promise<readonly SterilizerShellActivationSterilizerRow[]> {
    const { data, error } = await this.client
      .from("sterilizers")
      .select(STERILIZER_ACTIVATION_STERILIZER_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_sterilizer_key", deploymentSterilizerKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_sterilizer_lookup");
    }

    return (data ?? []) as unknown as SterilizerShellActivationSterilizerRow[];
  }
}

export function mapSterilizerShellActivationSessionRow(
  row: SterilizerShellActivationSessionRow,
): DeploymentSterilizerShellActivationSessionSnapshot {
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

export function mapSterilizerShellActivationItemRow(
  row: SterilizerShellActivationItemRow,
): DeploymentSterilizerShellActivationItemSnapshot {
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

export function mapSterilizerShellActivationSterilizerRow(
  row: SterilizerShellActivationSterilizerRow,
): DeploymentSterilizerShellActivationSterilizerSnapshot {
  return {
    sterilizerId: row.id,
    clinicId: row.clinic_id,
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    active: row.active,
    placeholder: row.provisioning_source === "setup_draft" && row.provisioning_status === "planned" && row.active === false,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    archivedAt: null,
    deletedAt: null,
    currentState: sterilizerState(row),
  };
}

export function aggregateSterilizerShellActivationRows(
  items: readonly SterilizerShellActivationItemRow[],
  sterilizers: readonly SterilizerShellActivationSterilizerRow[],
): DeploymentSterilizerShellActivationAggregateSnapshot {
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
    sterilizerCandidateCount: sterilizers.length,
    duplicateSterilizerIdentityCount: duplicateCount(sterilizers.map((sterilizer) => `${sterilizer.clinic_id ?? "global"}:${sterilizer.deployment_sterilizer_key ?? "null"}`)),
  };
}

export function sterilizerShellActivationRpcPayload(
  command: DeploymentSterilizerShellActivationAtomicCommand,
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
    p_sterilizer_id: command.sterilizerId,
    p_expected_sterilizer_key: command.expectedSterilizerKey,
    p_expected_current_state: cloneRecord(command.expectedCurrentState),
    p_target_state: cloneRecord(command.targetState),
    p_proposed_activated_at: command.proposedActivatedAt,
  };
}

export function mapSterilizerShellActivationRpcResult(
  row: SterilizerShellActivationRpcRow,
): DeploymentSterilizerShellActivationAtomicResult {
  const status = readSterilizerShellActivationAtomicStatus(row.status);

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
    sterilizerId: row.sterilizer_id,
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    sterilizerStateBefore: readNullableRecord(row.sterilizer_state_before),
    sterilizerStateAfter: readNullableRecord(row.sterilizer_state_after),
    activatedAt: row.activated_at,
    issueCode: row.issue_code,
    message: row.message ?? "Sterilizer shell activation RPC returned no message.",
  };
}

export function readSingleRpcRow(data: unknown, layer = "rpc_response_mapping"): SterilizerShellActivationRpcRow {
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length !== 1) {
    throw new DeploymentSterilizerShellActivationRepositoryError({
      message: "Ambiguous sterilizer shell activation RPC response.",
      layer,
    });
  }

  const row = rows[0];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentSterilizerShellActivationRepositoryError({
      message: "Malformed sterilizer shell activation RPC response.",
      layer,
    });
  }

  return row as SterilizerShellActivationRpcRow;
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentSterilizerShellActivationRepositoryError({
      message: `Ambiguous ${label} rows prevent deterministic sterilizer shell activation.`,
    });
  }
}

function readSterilizerShellActivationAtomicStatus(
  value: string | null,
): DeploymentSterilizerShellActivationAtomicResult["status"] {
  const allowed = ["activated", "already_activated", "blocked", "conflict", "not_found", "error"] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentSterilizerShellActivationAtomicResult["status"];
  }

  throw new DeploymentSterilizerShellActivationRepositoryError({
    message: "Malformed sterilizer shell activation RPC status.",
    layer: "atomic_rpc_response_mapping",
  });
}

export function selectRunningSterilizerLookup(
  items: readonly SterilizerShellActivationItemRow[],
): DeploymentSterilizerShellActivationSterilizerLookupDiagnostics {
  const runningSterilizer = [...items]
    .sort(compareRows)
    .find((item) => item.execution_status === "running" && item.entity_type === "sterilizer_shell");

  if (!runningSterilizer) {
    return notAttemptedSterilizerLookup();
  }

  const deploymentSterilizerKey = readDeploymentSterilizerKey(runningSterilizer) ?? fallbackDeploymentSterilizerKey(runningSterilizer.entity_id);

  return {
    attempted: deploymentSterilizerKey !== null,
    result: deploymentSterilizerKey === null ? "not_attempted" : "zero_rows",
    rowsReturned: 0,
    deploymentSterilizerKey,
    sterilizerId: runningSterilizer.entity_id ?? null,
  };
}

function notAttemptedSterilizerLookup(): DeploymentSterilizerShellActivationSterilizerLookupDiagnostics {
  return {
    attempted: false,
    result: "not_attempted",
    rowsReturned: 0,
    deploymentSterilizerKey: null,
    sterilizerId: null,
  };
}

function readDeploymentSterilizerKey(item: SterilizerShellActivationItemRow): string | null {
  return readStringField(item.expected_current_state, "deploymentSterilizerKey") ??
    readStringField(item.expected_current_state, "deployment_sterilizer_key") ??
    readStringField(item.target_state, "deploymentSterilizerKey") ??
    readStringField(item.target_state, "deployment_sterilizer_key");
}

function fallbackDeploymentSterilizerKey(value: string | null): string | null {
  if (!value || isUuid(value)) {
    return null;
  }

  return value;
}

function readStringField(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sterilizerState(row: SterilizerShellActivationSterilizerRow): Record<string, unknown> {
  return {
    deploymentSterilizerKey: row.deployment_sterilizer_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active,
  };
}

function getSucceededPrefix(items: readonly SterilizerShellActivationItemRow[]): SterilizerShellActivationItemRow[] {
  const prefix: SterilizerShellActivationItemRow[] = [];
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

function hasLaterIntegrityIssue(item: SterilizerShellActivationItemRow): boolean {
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

function compareRows(left: SterilizerShellActivationItemRow, right: SterilizerShellActivationItemRow): number {
  return left.sequence - right.sequence || left.execution_item_key.localeCompare(right.execution_item_key);
}

function toRepositoryError(
  error: SupabaseErrorLike,
  sensitiveToken: string | null = null,
  layer = "repository",
): DeploymentSterilizerShellActivationRepositoryError {
  return new DeploymentSterilizerShellActivationRepositoryError({
    message: sanitizeDiagnostic(error.message || "Sterilizer shell activation repository query failed.", sensitiveToken) ?? "Sterilizer shell activation repository query failed.",
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