import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentHardwareShellActivationRepository,
} from "./deployment-hardware-shell-activation-repository";
import {
  emptyHardwareShellActivationAggregate,
  type DeploymentHardwareShellActivationAggregateSnapshot,
  type DeploymentHardwareShellActivationAtomicCommand,
  type DeploymentHardwareShellActivationAtomicResult,
  type DeploymentHardwareShellActivationItemSnapshot,
  type DeploymentHardwareShellActivationHardwareLookupDiagnostics,
  type DeploymentHardwareShellActivationHardwareSnapshot,
  type DeploymentHardwareShellActivationSessionSnapshot,
  type DeploymentHardwareShellActivationSnapshot,
} from "./deployment-hardware-shell-activation-types";

const HARDWARE_ACTIVATION_SESSION_COLUMNS = [
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

const HARDWARE_ACTIVATION_ITEM_COLUMNS = [
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

const HARDWARE_ACTIVATION_HARDWARE_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_hardware_key",
  "active",
  "provisioning_source",
  "provisioning_status",
  "status",
  "agent_id",
  "default_workstation_id",
  "current_workstation_id",
].join(",");

const HARDWARE_ACTIVATION_RPC_NAME = "activate_deployment_hardware_shell";
const REDACTED = "[redacted]";

export type HardwareShellActivationSessionRow = {
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

export type HardwareShellActivationItemRow = {
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

export type HardwareShellActivationHardwareRow = {
  id: string;
  clinic_id: string | null;
  deployment_hardware_key: string | null;
  active: boolean | null;
  provisioning_source: string | null;
  provisioning_status: string | null;
  status: string | null;
  agent_id: string | null;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
};

type HardwareShellActivationRpcRow = {
  status: string | null;
  clinic_id: string | null;
  deployment_run_key: string | null;
  session_id: string | null;
  execution_key: string | null;
  item_id: string | null;
  execution_item_key: string | null;
  plan_item_key: string | null;
  sequence: number | null;
  hardware_id: string | null;
  deployment_hardware_key: string | null;
  hardware_state_before: unknown;
  hardware_state_after: unknown;
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

export class DeploymentHardwareShellActivationRepositoryError extends Error {
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
    this.name = "DeploymentHardwareShellActivationRepositoryError";
    this.code = input.code ?? null;
    this.details = input.details ?? null;
    this.hint = input.hint ?? null;
    this.layer = input.layer ?? "repository";
  }
}

export class SupabaseDeploymentHardwareShellActivationRepository
  implements DeploymentHardwareShellActivationRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadHardwareShellActivationSnapshot(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<DeploymentHardwareShellActivationSnapshot> {
    const session = await this.findSession(input);

    if (!session) {
      return {
        session: null,
        items: [],
        hardwareShell: null,
        hardwareLookup: notAttemptedHardwareLookup(),
        aggregate: emptyHardwareShellActivationAggregate(),
      };
    }

    const items = await this.listItems(session.id);
    const hardwareLookup = selectRunningHardwareLookup(items);
    const hardwares = hardwareLookup.deploymentHardwareKey
      ? await this.listHardwares(input.clinicId, hardwareLookup.deploymentHardwareKey)
      : [];
    const hardwareShell = hardwares.length === 1 ? mapHardwareShellActivationHardwareRow(hardwares[0]) : null;

    return {
      session: mapHardwareShellActivationSessionRow(session),
      items: items.map(mapHardwareShellActivationItemRow),
      hardwareShell,
      hardwareLookup: {
        ...hardwareLookup,
        rowsReturned: hardwares.length,
        result: hardwareLookup.attempted
          ? hardwares.length === 0
            ? "zero_rows"
            : hardwares.length === 1
              ? "mapped"
              : "multiple_rows"
          : "not_attempted",
      },
      aggregate: aggregateHardwareShellActivationRows(items, hardwares),
    };
  }

  async activateHardwareShellAtomically(
    command: DeploymentHardwareShellActivationAtomicCommand,
  ): Promise<DeploymentHardwareShellActivationAtomicResult> {
    const payload = hardwareShellActivationRpcPayload(command);
    const { data, error } = await this.client.rpc(HARDWARE_ACTIVATION_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error, command.ownershipToken, "atomic_rpc");
    }

    return mapHardwareShellActivationRpcResult(readSingleRpcRow(data, "atomic_rpc_response_mapping"));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
  }): Promise<HardwareShellActivationSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(HARDWARE_ACTIVATION_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunKey)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_session_lookup");
    }

    const rows = (data ?? []) as unknown as HardwareShellActivationSessionRow[];
    assertAtMostOne(rows, "hardware shell activation session");

    return rows[0] ?? null;
  }

  private async listItems(sessionId: string): Promise<readonly HardwareShellActivationItemRow[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(HARDWARE_ACTIVATION_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error, null, "snapshot_item_listing");
    }

    return (data ?? []) as unknown as HardwareShellActivationItemRow[];
  }

  private async listHardwares(
    clinicId: string,
    deploymentHardwareKey: string,
  ): Promise<readonly HardwareShellActivationHardwareRow[]> {
    const { data, error } = await this.client
      .from("clinical_hardware_devices")
      .select(HARDWARE_ACTIVATION_HARDWARE_COLUMNS)
      .eq("clinic_id", clinicId)
      .eq("deployment_hardware_key", deploymentHardwareKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error, null, "snapshot_hardware_lookup");
    }

    return (data ?? []) as unknown as HardwareShellActivationHardwareRow[];
  }
}

export function mapHardwareShellActivationSessionRow(
  row: HardwareShellActivationSessionRow,
): DeploymentHardwareShellActivationSessionSnapshot {
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

export function mapHardwareShellActivationItemRow(
  row: HardwareShellActivationItemRow,
): DeploymentHardwareShellActivationItemSnapshot {
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

export function mapHardwareShellActivationHardwareRow(
  row: HardwareShellActivationHardwareRow,
): DeploymentHardwareShellActivationHardwareSnapshot {
  return {
    hardwareId: row.id,
    clinicId: row.clinic_id,
    deploymentHardwareKey: row.deployment_hardware_key,
    active: row.active,
    planned: row.provisioning_source === "setup_draft" && row.provisioning_status === "planned" && row.active === false,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    operationalStatus: row.status,
    agentId: row.agent_id,
    defaultWorkstationId: row.default_workstation_id,
    currentWorkstationId: row.current_workstation_id,
    archivedAt: null,
    deletedAt: null,
    currentState: hardwareState(row),
  };
}

export function aggregateHardwareShellActivationRows(
  items: readonly HardwareShellActivationItemRow[],
  hardwares: readonly HardwareShellActivationHardwareRow[],
): DeploymentHardwareShellActivationAggregateSnapshot {
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
    hardwareCandidateCount: hardwares.length,
    duplicateHardwareIdentityCount: duplicateCount(hardwares.map((hardware) => `${hardware.clinic_id ?? "global"}:${hardware.deployment_hardware_key ?? "null"}`)),
  };
}

export function hardwareShellActivationRpcPayload(
  command: DeploymentHardwareShellActivationAtomicCommand,
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
    p_hardware_id: command.hardwareId,
    p_expected_hardware_key: command.expectedHardwareKey,
    p_expected_current_state: cloneRecord(command.expectedCurrentState),
    p_target_state: cloneRecord(command.targetState),
    p_proposed_activated_at: command.proposedActivatedAt,
  };
}

export function mapHardwareShellActivationRpcResult(
  row: HardwareShellActivationRpcRow,
): DeploymentHardwareShellActivationAtomicResult {
  const status = readHardwareShellActivationAtomicStatus(row.status);

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
    hardwareId: row.hardware_id,
    deploymentHardwareKey: row.deployment_hardware_key,
    hardwareStateBefore: readNullableRecord(row.hardware_state_before),
    hardwareStateAfter: readNullableRecord(row.hardware_state_after),
    activatedAt: row.activated_at,
    issueCode: row.issue_code,
    message: row.message ?? "Hardware shell activation RPC returned no message.",
  };
}

export function readSingleRpcRow(data: unknown, layer = "rpc_response_mapping"): HardwareShellActivationRpcRow {
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length !== 1) {
    throw new DeploymentHardwareShellActivationRepositoryError({
      message: "Ambiguous hardware shell activation RPC response.",
      layer,
    });
  }

  const row = rows[0];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentHardwareShellActivationRepositoryError({
      message: "Malformed hardware shell activation RPC response.",
      layer,
    });
  }

  return row as HardwareShellActivationRpcRow;
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentHardwareShellActivationRepositoryError({
      message: `Ambiguous ${label} rows prevent deterministic hardware shell activation.`,
    });
  }
}

function readHardwareShellActivationAtomicStatus(
  value: string | null,
): DeploymentHardwareShellActivationAtomicResult["status"] {
  const allowed = ["activated", "already_activated", "blocked", "conflict", "not_found", "error"] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentHardwareShellActivationAtomicResult["status"];
  }

  throw new DeploymentHardwareShellActivationRepositoryError({
    message: "Malformed hardware shell activation RPC status.",
    layer: "atomic_rpc_response_mapping",
  });
}

export function selectRunningHardwareLookup(
  items: readonly HardwareShellActivationItemRow[],
): DeploymentHardwareShellActivationHardwareLookupDiagnostics {
  const runningHardware = [...items]
    .sort(compareRows)
    .find((item) => item.execution_status === "running" && item.entity_type === "hardware_shell");

  if (!runningHardware) {
    return notAttemptedHardwareLookup();
  }

  const deploymentHardwareKey = readDeploymentHardwareKey(runningHardware);

  return {
    attempted: deploymentHardwareKey !== null,
    result: deploymentHardwareKey === null ? "not_attempted" : "zero_rows",
    rowsReturned: 0,
    deploymentHardwareKey,
    hardwareId: runningHardware.entity_id ?? null,
  };
}

function notAttemptedHardwareLookup(): DeploymentHardwareShellActivationHardwareLookupDiagnostics {
  return {
    attempted: false,
    result: "not_attempted",
    rowsReturned: 0,
    deploymentHardwareKey: null,
    hardwareId: null,
  };
}

function readDeploymentHardwareKey(item: HardwareShellActivationItemRow): string | null {
  return readStringField(item.expected_current_state, "deploymentHardwareKey") ??
    readStringField(item.expected_current_state, "deployment_hardware_key");
}


function readStringField(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}


function hardwareState(row: HardwareShellActivationHardwareRow): Record<string, unknown> {
  return {
    deploymentHardwareKey: row.deployment_hardware_key,
    provisioningSource: row.provisioning_source,
    provisioningStatus: row.provisioning_status,
    active: row.active,
    operationalStatus: row.status,
    agentId: row.agent_id,
    defaultWorkstationId: row.default_workstation_id,
    currentWorkstationId: row.current_workstation_id,
  };
}

function getSucceededPrefix(items: readonly HardwareShellActivationItemRow[]): HardwareShellActivationItemRow[] {
  const prefix: HardwareShellActivationItemRow[] = [];
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

function hasLaterIntegrityIssue(item: HardwareShellActivationItemRow): boolean {
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

function compareRows(left: HardwareShellActivationItemRow, right: HardwareShellActivationItemRow): number {
  return left.sequence - right.sequence || left.execution_item_key.localeCompare(right.execution_item_key);
}

function toRepositoryError(
  error: SupabaseErrorLike,
  sensitiveToken: string | null = null,
  layer = "repository",
): DeploymentHardwareShellActivationRepositoryError {
  return new DeploymentHardwareShellActivationRepositoryError({
    message: sanitizeDiagnostic(error.message || "Hardware shell activation repository query failed.", sensitiveToken) ?? "Hardware shell activation repository query failed.",
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