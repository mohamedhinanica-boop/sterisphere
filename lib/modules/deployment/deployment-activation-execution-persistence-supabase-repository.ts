import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentActivationExecutionPersistenceCreateItemResult,
  DeploymentActivationExecutionPersistenceCreateSessionResult,
  DeploymentActivationExecutionPersistenceRepository,
} from "./deployment-activation-execution-persistence-repository";
import {
  cloneRecord,
  cloneRollbackBoundary,
  type CreateDeploymentActivationExecutionItemPayload,
  type CreateDeploymentActivationExecutionSessionPayload,
  type DeploymentActivationExecutionItemRecord,
  type DeploymentActivationExecutionRollbackStatus,
  type DeploymentActivationExecutionSessionRecord,
} from "./deployment-activation-execution-persistence-types";
import type {
  DeploymentActivationExecutionRollbackBoundary,
} from "./deployment-activation-execution-types";
import type {
  DeploymentActivationPlanAction,
  DeploymentActivationPlanEntityType,
} from "./deployment-activation-plan-types";

const SESSION_COLUMNS = [
  "id",
  "clinic_id",
  "deployment_run_record_id",
  "deployment_run_key",
  "execution_key",
  "plan_key",
  "payload_hash",
  "preparation_status",
  "execution_status",
  "execution_owner",
  "ownership_token",
  "lease_expires_at",
  "items_requested",
  "items_ready",
  "items_pending",
  "items_blocked",
  "reversible_items",
  "irreversible_items",
  "blockers",
  "warnings",
  "rollback_boundary",
  "preparation_evidence",
  "execution_metadata",
  "started_at",
  "completed_at",
  "failed_at",
  "created_at",
  "updated_at",
].join(",");

const ITEM_COLUMNS = [
  "id",
  "session_id",
  "clinic_id",
  "deployment_run_record_id",
  "deployment_run_key",
  "execution_key",
  "execution_item_key",
  "plan_item_key",
  "sequence",
  "dependency_level",
  "entity_type",
  "entity_id",
  "deployment_key",
  "action",
  "expected_current_state",
  "target_state",
  "dependency_keys",
  "execution_status",
  "attempt_count",
  "reversible",
  "rollback_action",
  "rollback_status",
  "error_code",
  "error_message",
  "execution_evidence",
  "started_at",
  "completed_at",
  "rolled_back_at",
  "created_at",
  "updated_at",
].join(",");

const DEPLOYMENT_RUN_COLUMNS = ["id", "clinic_id", "deployment_run_id"].join(",");

type DeploymentRunIdentityRow = {
  id: string;
  clinic_id: string | null;
  deployment_run_id: string | null;
};

export type DeploymentActivationExecutionSessionRow = {
  id: string;
  clinic_id: string;
  deployment_run_record_id: string;
  deployment_run_key: string;
  execution_key: string;
  plan_key: string;
  payload_hash: string | null;
  preparation_status: string;
  execution_status: string;
  execution_owner: string | null;
  ownership_token: string | null;
  lease_expires_at: string | null;
  items_requested: number;
  items_ready: number;
  items_pending: number;
  items_blocked: number;
  reversible_items: number;
  irreversible_items: number;
  blockers: number;
  warnings: number;
  rollback_boundary: unknown;
  preparation_evidence: unknown;
  execution_metadata: unknown;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DeploymentActivationExecutionItemRow = {
  id: string;
  session_id: string;
  clinic_id: string;
  deployment_run_record_id: string;
  deployment_run_key: string;
  execution_key: string;
  execution_item_key: string;
  plan_item_key: string;
  sequence: number;
  dependency_level: number | null;
  entity_type: string;
  entity_id: string | null;
  deployment_key: string | null;
  action: string;
  expected_current_state: unknown;
  target_state: unknown;
  dependency_keys: unknown;
  execution_status: string;
  attempt_count: number;
  reversible: boolean;
  rollback_action: string | null;
  rollback_status: string;
  error_code: string | null;
  error_message: string | null;
  execution_evidence: unknown;
  started_at: string | null;
  completed_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
  updated_at: string;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentActivationExecutionPersistenceRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentActivationExecutionPersistenceRepositoryError";
    this.code = code;
  }
}

export class SupabaseDeploymentActivationExecutionPersistenceRepository
  implements DeploymentActivationExecutionPersistenceRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findSessionByIdentity(input: {
    clinicId: string;
    deploymentRunId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionSessionRecord | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as DeploymentActivationExecutionSessionRow[];
    assertAtMostOne(rows, "activation execution session identity");

    return rows[0] ? mapSessionRow(rows[0]) : null;
  }

  async findSessionByDeploymentRun(input: {
    clinicId: string;
    deploymentRunId: string;
  }): Promise<DeploymentActivationExecutionSessionRecord | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as DeploymentActivationExecutionSessionRow[];
    assertAtMostOne(rows, "activation execution session deployment run");

    return rows[0] ? mapSessionRow(rows[0]) : null;
  }

  async createPreparedSession(
    payload: CreateDeploymentActivationExecutionSessionPayload,
  ): Promise<DeploymentActivationExecutionPersistenceCreateSessionResult> {
    if (
      payload.preparationStatus !== "ready" ||
      payload.executionStatus !== "prepared"
    ) {
      return {
        ok: false,
        session: null,
        message: "Only ready prepared activation execution sessions can be inserted.",
      };
    }

    const deploymentRun = await this.findDeploymentRunRecord(payload);

    if (!deploymentRun) {
      return {
        ok: false,
        session: null,
        message: "Deployment run record could not be resolved for activation execution persistence.",
      };
    }

    const insertPayload = sessionInsertPayload(payload, deploymentRun.id);
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .insert(insertPayload)
      .select(SESSION_COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findSessionByIdentity({
          clinicId: payload.clinicId,
          deploymentRunId: payload.deploymentRunId,
          executionKey: payload.executionKey,
        });

        return {
          ok: false,
          session: existing,
          message: "Prepared activation execution session already exists.",
        };
      }

      throw toRepositoryError(error);
    }

    return {
      ok: true,
      session: mapSessionRow(data as unknown as DeploymentActivationExecutionSessionRow),
      message: "Prepared activation execution session inserted.",
    };
  }

  async listExecutionItemsForSession(
    sessionId: string,
  ): Promise<readonly DeploymentActivationExecutionItemRecord[]> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true })
      .order("execution_item_key", { ascending: true });

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as DeploymentActivationExecutionItemRow[];
    assertNoDuplicateRows(rows, (row) => row.execution_item_key, "execution item key");
    assertNoDuplicateRows(rows, (row) => row.plan_item_key, "plan item key");
    assertNoDuplicateRows(rows, (row) => String(row.sequence), "execution item sequence");

    return rows.map(mapItemRow);
  }

  async findItemByExecutionItemKey(input: {
    sessionId: string;
    executionItemKey: string;
  }): Promise<DeploymentActivationExecutionItemRecord | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(ITEM_COLUMNS)
      .eq("session_id", input.sessionId)
      .eq("execution_item_key", input.executionItemKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as DeploymentActivationExecutionItemRow[];
    assertAtMostOne(rows, "activation execution item identity");

    return rows[0] ? mapItemRow(rows[0]) : null;
  }

  async createPreparedItem(
    payload: CreateDeploymentActivationExecutionItemPayload,
  ): Promise<DeploymentActivationExecutionPersistenceCreateItemResult> {
    if (!["ready", "pending"].includes(payload.executionStatus)) {
      return {
        ok: false,
        item: null,
        message: "Only ready or pending activation execution items can be inserted.",
      };
    }

    const session = await this.findSessionByIdentity({
      clinicId: payload.clinicId,
      deploymentRunId: payload.deploymentRunId,
      executionKey: payload.executionKey,
    });

    if (!session || session.id !== payload.sessionId) {
      return {
        ok: false,
        item: null,
        message: "Prepared activation execution item session could not be resolved.",
      };
    }

    const deploymentRun = await this.findDeploymentRunRecord({
      clinicId: payload.clinicId,
      deploymentRunId: payload.deploymentRunId,
    });

    if (!deploymentRun) {
      return {
        ok: false,
        item: null,
        message: "Deployment run record could not be resolved for activation execution item persistence.",
      };
    }

    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .insert(itemInsertPayload(payload, deploymentRun.id))
      .select(ITEM_COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findItemByExecutionItemKey({
          sessionId: payload.sessionId,
          executionItemKey: payload.executionItemKey,
        });

        return {
          ok: false,
          item: existing,
          message: "Prepared activation execution item already exists.",
        };
      }

      throw toRepositoryError(error);
    }

    return {
      ok: true,
      item: mapItemRow(data as unknown as DeploymentActivationExecutionItemRow),
      message: "Prepared activation execution item inserted.",
    };
  }

  private async findDeploymentRunRecord(input: {
    clinicId: string;
    deploymentRunId: string;
  }): Promise<DeploymentRunIdentityRow | null> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .select(DEPLOYMENT_RUN_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_id", input.deploymentRunId)
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as DeploymentRunIdentityRow[];
    assertAtMostOne(rows, "deployment run record identity");

    return rows[0] ?? null;
  }
}

export function sessionInsertPayload(
  payload: CreateDeploymentActivationExecutionSessionPayload,
  deploymentRunRecordId: string,
): Record<string, unknown> {
  return omitNullDefaultTimestamps({
    clinic_id: payload.clinicId,
    deployment_run_record_id: deploymentRunRecordId,
    deployment_run_key: payload.deploymentRunId,
    execution_key: payload.executionKey,
    plan_key: payload.planKey,
    payload_hash: payload.payloadHash,
    preparation_status: payload.preparationStatus,
    execution_status: payload.executionStatus,
    execution_owner: payload.executionOwner,
    ownership_token: payload.ownershipToken,
    lease_expires_at: payload.leaseExpiresAt,
    items_requested: payload.itemsRequested,
    items_ready: payload.itemsReady,
    items_pending: payload.itemsPending,
    items_blocked: payload.itemsBlocked,
    reversible_items: payload.reversibleItems,
    irreversible_items: payload.irreversibleItems,
    blockers: payload.blockers,
    warnings: payload.warnings,
    rollback_boundary: cloneRollbackBoundary(payload.rollbackBoundary),
    preparation_evidence: cloneRecord(payload.preparationEvidence),
    execution_metadata: cloneRecord(payload.executionMetadata),
    started_at: payload.startedAt,
    completed_at: payload.completedAt,
    failed_at: payload.failedAt,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  });
}

export function itemInsertPayload(
  payload: CreateDeploymentActivationExecutionItemPayload,
  deploymentRunRecordId: string,
): Record<string, unknown> {
  return omitNullDefaultTimestamps({
    session_id: payload.sessionId,
    clinic_id: payload.clinicId,
    deployment_run_record_id: deploymentRunRecordId,
    deployment_run_key: payload.deploymentRunId,
    execution_key: payload.executionKey,
    execution_item_key: payload.executionItemKey,
    plan_item_key: payload.planItemKey,
    sequence: payload.sequence,
    dependency_level: payload.dependencyLevel,
    entity_type: payload.entityType,
    entity_id: payload.entityId,
    deployment_key: payload.deploymentKey,
    action: payload.action,
    expected_current_state: cloneRecord(payload.expectedCurrentState),
    target_state: cloneRecord(payload.targetState),
    dependency_keys: [...payload.dependencyKeys],
    execution_status: payload.executionStatus,
    attempt_count: payload.attemptCount,
    reversible: payload.reversible,
    rollback_action: payload.rollbackAction,
    rollback_status: payload.rollbackStatus,
    error_code: payload.errorCode,
    error_message: payload.errorMessage,
    execution_evidence: cloneRecord(payload.executionEvidence),
    started_at: payload.startedAt,
    completed_at: payload.completedAt,
    rolled_back_at: payload.rolledBackAt,
    created_at: payload.createdAt,
    updated_at: payload.updatedAt,
  });
}

export function mapSessionRow(
  row: DeploymentActivationExecutionSessionRow,
): DeploymentActivationExecutionSessionRecord {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    deploymentRunId: row.deployment_run_key,
    executionKey: row.execution_key,
    planKey: row.plan_key,
    payloadHash: row.payload_hash,
    preparationStatus: readLiteral(row.preparation_status, ["ready"], "preparation_status"),
    executionStatus: readLiteral(row.execution_status, ["prepared", "claimed", "running", "partially_completed", "completed", "failed", "rollback_required", "rolling_back", "rolled_back", "cancelled"], "execution_status"),
    executionOwner: row.execution_owner,
    ownershipToken: row.ownership_token,
    leaseExpiresAt: row.lease_expires_at,
    itemsRequested: row.items_requested,
    itemsReady: row.items_ready,
    itemsPending: row.items_pending,
    itemsBlocked: row.items_blocked,
    reversibleItems: row.reversible_items,
    irreversibleItems: row.irreversible_items,
    blockers: row.blockers,
    warnings: row.warnings,
    rollbackBoundary: readRollbackBoundary(row.rollback_boundary),
    preparationEvidence: readRecord(row.preparation_evidence, "preparation_evidence"),
    executionMetadata: readRecord(row.execution_metadata, "execution_metadata"),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapItemRow(
  row: DeploymentActivationExecutionItemRow,
): DeploymentActivationExecutionItemRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    clinicId: row.clinic_id,
    deploymentRunId: row.deployment_run_key,
    executionKey: row.execution_key,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
    dependencyLevel: row.dependency_level ?? 0,
    entityType: readEntityType(row.entity_type),
    entityId: row.entity_id,
    deploymentKey: row.deployment_key,
    action: readAction(row.action),
    expectedCurrentState: readRecord(row.expected_current_state, "expected_current_state"),
    targetState: readRecord(row.target_state, "target_state"),
    dependencyKeys: readStringArray(row.dependency_keys, "dependency_keys"),
    executionStatus: readLiteral(row.execution_status, ["ready", "pending", "running", "succeeded", "failed", "skipped", "rollback_pending", "rolled_back"], "execution_status"),
    attemptCount: row.attempt_count,
    reversible: row.reversible,
    rollbackAction: row.rollback_action,
    rollbackStatus: readLiteral(row.rollback_status, ["not_started", "not_supported", "pending", "completed", "failed"], "rollback_status") as DeploymentActivationExecutionRollbackStatus,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    executionEvidence: readRecord(row.execution_evidence, "execution_evidence"),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    rolledBackAt: row.rolled_back_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentActivationExecutionPersistenceRepositoryError(
      `Ambiguous ${label} rows prevent deterministic activation execution persistence.`,
    );
  }
}

function assertNoDuplicateRows<Row>(
  rows: readonly Row[],
  getKey: (row: Row) => string,
  label: string,
): void {
  const seen = new Set<string>();

  for (const row of rows) {
    const key = getKey(row);

    if (seen.has(key)) {
      throw new DeploymentActivationExecutionPersistenceRepositoryError(
        `Duplicate ${label} rows prevent deterministic activation execution persistence.`,
      );
    }

    seen.add(key);
  }
}

function omitNullDefaultTimestamps(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };

  if (next.created_at === null) {
    delete next.created_at;
  }

  if (next.updated_at === null) {
    delete next.updated_at;
  }

  return next;
}

function readRollbackBoundary(value: unknown): DeploymentActivationExecutionRollbackBoundary {
  const record = readRecord(value, "rollback_boundary");

  return {
    lastReversibleSequence: readNullableNumber(record.lastReversibleSequence),
    firstIrreversibleSequence: readNullableNumber(record.firstIrreversibleSequence),
    rollbackSupportedItemKeys: readStringArray(record.rollbackSupportedItemKeys, "rollbackSupportedItemKeys"),
    rollbackUnsupportedItemKeys: readStringArray(record.rollbackUnsupportedItemKeys, "rollbackUnsupportedItemKeys"),
    wouldCrossIrreversibleBoundary: record.wouldCrossIrreversibleBoundary === true,
  };
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DeploymentActivationExecutionPersistenceRepositoryError(
      `Malformed ${label} JSON object in activation execution persistence row.`,
    );
  }

  return cloneRecord(value as Record<string, unknown>);
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new DeploymentActivationExecutionPersistenceRepositoryError(
      `Malformed ${label} JSON array in activation execution persistence row.`,
    );
  }

  return [...value];
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readLiteral<const T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
): T {
  if (allowed.includes(value as T)) {
    return value as T;
  }

  throw new DeploymentActivationExecutionPersistenceRepositoryError(
    `Unexpected ${label} value in activation execution persistence row.`,
  );
}

function readAction(value: string): DeploymentActivationPlanAction {
  return readLiteral(value, ["activate", "link", "bind", "finalize", "no_op"], "action");
}

function readEntityType(value: string): DeploymentActivationPlanEntityType {
  return readLiteral(
    value,
    [
      "deployment_run",
      "clinic",
      "clinic_settings",
      "provider_shell",
      "sterilizer_shell",
      "workstation_shell",
      "hardware_shell",
      "hardware_assignment",
      "hardware_binding",
      "activation_plan",
    ],
    "entity_type",
  );
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentActivationExecutionPersistenceRepositoryError {
  return new DeploymentActivationExecutionPersistenceRepositoryError(
    "Activation execution persistence repository query failed.",
    error.code ?? null,
  );
}
