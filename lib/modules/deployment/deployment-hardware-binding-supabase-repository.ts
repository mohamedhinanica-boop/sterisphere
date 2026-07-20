import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentHardwareBindingRepository } from "./deployment-hardware-binding-repository";
import type {
  DeploymentHardwareBindingAtomicCommand,
  DeploymentHardwareBindingAtomicResult,
  DeploymentHardwareBindingSnapshot,
  DeploymentHardwareBindingSnapshotQuery,
  DeploymentHardwareBindingState,
  DeploymentHardwareBindingStateKind,
  DeploymentHardwareBindingStatus,
  DeploymentHardwareBindingTargetType,
} from "./deployment-hardware-binding-types";

const RPC_NAME = "bind_deployment_hardware_target";
const HARDWARE_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_hardware_key",
  "default_workstation_id",
  "current_workstation_id",
  "default_sterilizer_id",
  "current_sterilizer_id",
].join(",");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HardwareBindingRow = {
  id: string;
  clinic_id: string;
  deployment_hardware_key: string;
  default_workstation_id: string | null;
  current_workstation_id: string | null;
  default_sterilizer_id: string | null;
  current_sterilizer_id: string | null;
};

type HardwareBindingRpcRow = {
  status?: unknown;
  binding_written?: unknown;
  hardware_id?: unknown;
  deployment_hardware_key?: unknown;
  target_id?: unknown;
  target_type?: unknown;
  target_deployment_key?: unknown;
  previous_state?: unknown;
  resulting_state?: unknown;
  binding_timestamp?: unknown;
  issue_code?: unknown;
  message?: unknown;
};

export class DeploymentHardwareBindingRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentHardwareBindingRepositoryError";
  }
}

export class SupabaseDeploymentHardwareBindingRepository
  implements DeploymentHardwareBindingRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadHardwareBindingSnapshot(
    query: DeploymentHardwareBindingSnapshotQuery,
  ): Promise<DeploymentHardwareBindingSnapshot> {
    const { data, error } = await this.client
      .from("clinical_hardware_devices")
      .select(HARDWARE_COLUMNS)
      .eq("clinic_id", query.clinicId)
      .eq("id", query.hardwareId)
      .eq("deployment_hardware_key", query.deploymentHardwareKey)
      .limit(2);

    if (error) {
      throw new DeploymentHardwareBindingRepositoryError(
        "Hardware binding snapshot lookup failed.",
      );
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length > 1) {
      throw new DeploymentHardwareBindingRepositoryError(
        "Hardware binding snapshot identity is ambiguous.",
      );
    }
    if (rows.length === 0) {
      return emptySnapshot();
    }

    return mapHardwareBindingSnapshotRow(rows[0]);
  }

  async bindHardwareAtomically(
    command: DeploymentHardwareBindingAtomicCommand,
  ): Promise<DeploymentHardwareBindingAtomicResult> {
    const { data, error } = await this.client.rpc(
      RPC_NAME,
      hardwareBindingRpcPayload(command),
    );

    if (error) {
      throw new DeploymentHardwareBindingRepositoryError(
        sanitizeMessage("Atomic hardware binding RPC failed.", command.ownershipToken),
      );
    }

    return mapHardwareBindingRpcResult(data, command);
  }
}

export function hardwareBindingRpcPayload(
  command: DeploymentHardwareBindingAtomicCommand,
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
    p_target_type: command.targetType,
    p_target_id: command.targetId,
    p_expected_target_deployment_key: command.expectedTargetDeploymentKey,
    p_expected_current_state: cloneRecord(command.expectedCurrentState),
    p_target_state: cloneRecord(command.targetState),
    p_proposed_bound_at: command.proposedBoundAt,
  };
}

export function mapHardwareBindingRpcResult(
  data: unknown,
  command: DeploymentHardwareBindingAtomicCommand,
): DeploymentHardwareBindingAtomicResult {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length !== 1 || !isRecord(rows[0])) {
    throw malformed("response cardinality");
  }
  const row = rows[0] as HardwareBindingRpcRow;
  const status = readStatus(row.status);
  const bindingWritten = readBoolean(row.binding_written, "binding_written");
  const hardwareId = readUuid(row.hardware_id, "hardware_id");
  const deploymentHardwareKey = readString(row.deployment_hardware_key, "deployment_hardware_key");
  const targetId = readUuid(row.target_id, "target_id");
  const targetType = readTargetType(row.target_type);
  const targetDeploymentKey = readString(row.target_deployment_key, "target_deployment_key");
  const previousState = readNullableBindingState(row.previous_state, "previous_state");
  const resultingState = readNullableBindingState(row.resulting_state, "resulting_state");
  const bindingTimestamp = readNullableTimestamp(row.binding_timestamp);
  const issueCode = readNullableString(row.issue_code, "issue_code");
  const message = sanitizeMessage(readString(row.message, "message"), command.ownershipToken);

  if (
    hardwareId !== command.hardwareId ||
    deploymentHardwareKey !== command.expectedHardwareKey ||
    targetId !== command.targetId ||
    targetType !== command.targetType ||
    targetDeploymentKey !== command.expectedTargetDeploymentKey
  ) {
    throw malformed("inconsistent target identity");
  }
  const successful = status === "bound" || status === "already_bound";
  if (successful && (!previousState || !resultingState || !bindingTimestamp)) {
    throw malformed("successful state evidence");
  }
  if (bindingWritten !== (status === "bound")) {
    throw malformed("binding write status");
  }

  return {
    ok: successful,
    status,
    bindingWritten,
    hardwareId,
    deploymentHardwareKey,
    targetType,
    targetId,
    targetDeploymentKey,
    previousState,
    resultingState,
    bindingTimestamp,
    issueCode,
    message,
  };
}

export function mapHardwareBindingSnapshotRow(row: unknown): DeploymentHardwareBindingSnapshot {
  if (!isRecord(row)) {
    throw malformed("snapshot row");
  }
  const typed = row as HardwareBindingRow;
  const state: DeploymentHardwareBindingState = {
    defaultWorkstationId: readNullableUuid(typed.default_workstation_id, "default_workstation_id"),
    currentWorkstationId: readNullableUuid(typed.current_workstation_id, "current_workstation_id"),
    defaultSterilizerId: readNullableUuid(typed.default_sterilizer_id, "default_sterilizer_id"),
    currentSterilizerId: readNullableUuid(typed.current_sterilizer_id, "current_sterilizer_id"),
  };
  return {
    hardwareId: readUuid(typed.id, "id"),
    clinicId: readUuid(typed.clinic_id, "clinic_id"),
    deploymentHardwareKey: readString(typed.deployment_hardware_key, "deployment_hardware_key"),
    currentWorkstationId: state.currentWorkstationId,
    currentSterilizerId: state.currentSterilizerId,
    bindingState: state,
    bindingKind: normalizeBindingKind(state),
  };
}

export function normalizeBindingKind(
  state: DeploymentHardwareBindingState,
): DeploymentHardwareBindingStateKind {
  const workstation = state.defaultWorkstationId !== null || state.currentWorkstationId !== null;
  const sterilizer = state.defaultSterilizerId !== null || state.currentSterilizerId !== null;
  if (workstation && sterilizer) return "invalid_mixed";
  if (!workstation && !sterilizer) return "unbound";
  if (workstation) {
    return state.defaultWorkstationId !== null &&
      state.defaultWorkstationId === state.currentWorkstationId
      ? "workstation_bound"
      : "invalid_partial";
  }
  return state.defaultSterilizerId !== null &&
    state.defaultSterilizerId === state.currentSterilizerId
    ? "sterilizer_bound"
    : "invalid_partial";
}

function emptySnapshot(): DeploymentHardwareBindingSnapshot {
  return {
    hardwareId: null,
    deploymentHardwareKey: null,
    clinicId: null,
    currentWorkstationId: null,
    currentSterilizerId: null,
    bindingState: null,
    bindingKind: null,
  };
}

function readNullableBindingState(value: unknown, field: string): DeploymentHardwareBindingState | null {
  if (value === null) return null;
  if (!isRecord(value)) throw malformed(field);
  return {
    defaultWorkstationId: readNullableUuid(value.defaultWorkstationId, `${field}.defaultWorkstationId`),
    currentWorkstationId: readNullableUuid(value.currentWorkstationId, `${field}.currentWorkstationId`),
    defaultSterilizerId: readNullableUuid(value.defaultSterilizerId, `${field}.defaultSterilizerId`),
    currentSterilizerId: readNullableUuid(value.currentSterilizerId, `${field}.currentSterilizerId`),
  };
}

function readStatus(value: unknown): DeploymentHardwareBindingStatus {
  const allowed: readonly DeploymentHardwareBindingStatus[] = [
    "bound", "already_bound", "blocked", "conflict", "not_found", "error",
  ];
  if (typeof value !== "string" || !allowed.includes(value as DeploymentHardwareBindingStatus)) {
    throw malformed("status");
  }
  return value as DeploymentHardwareBindingStatus;
}

function readTargetType(value: unknown): DeploymentHardwareBindingTargetType {
  if (value !== "workstation" && value !== "sterilizer") throw malformed("target_type");
  return value;
}

function readUuid(value: unknown, field: string): string {
  const result = readString(value, field);
  if (!UUID.test(result)) throw malformed(field);
  return result;
}

function readNullableUuid(value: unknown, field: string): string | null {
  return value === null ? null : readUuid(value, field);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw malformed(field);
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  return value === null ? null : readString(value, field);
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw malformed(field);
  return value;
}

function readNullableTimestamp(value: unknown): string | null {
  if (value === null) return null;
  const timestamp = readString(value, "binding_timestamp");
  if (Number.isNaN(Date.parse(timestamp))) throw malformed("binding_timestamp");
  return timestamp;
}

function malformed(field: string): DeploymentHardwareBindingRepositoryError {
  return new DeploymentHardwareBindingRepositoryError(
    `Malformed hardware binding RPC evidence: ${field}.`,
  );
}

function sanitizeMessage(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
