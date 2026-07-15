import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeploymentClinicActivationRepository,
} from "./deployment-clinic-activation-repository";
import type {
  DeploymentClinicActivationAtomicCommand,
  DeploymentClinicActivationAtomicResult,
  DeploymentClinicActivationClinicSnapshot,
  DeploymentClinicActivationItemSnapshot,
  DeploymentClinicActivationSessionSnapshot,
  DeploymentClinicActivationIssueDiagnostics,
  DeploymentClinicActivationSnapshot,
} from "./deployment-clinic-activation-types";

const CLINIC_ACTIVATION_SESSION_COLUMNS = [
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
].join(",");

const CLINIC_ACTIVATION_ITEM_COLUMNS = [
  "id",
  "session_id",
  "execution_item_key",
  "plan_item_key",
  "sequence",
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

const CLINIC_ACTIVATION_CLINIC_COLUMNS = [
  "id",
  "deployment_status",
  "deployed_at",
].join(",");

const CLINIC_ACTIVATION_RPC_NAME = "activate_deployment_clinic";

type ClinicActivationSessionRow = {
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
};

export type ClinicActivationItemRow = {
  id: string;
  session_id: string;
  execution_item_key: string;
  plan_item_key: string;
  sequence: number;
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

type ClinicActivationClinicRow = {
  id: string;
  deployment_status: string | null;
  deployed_at: string | null;
};

type ClinicActivationDeploymentRunLinkRow = {
  deployment_run_id: string;
  clinic_id: string | null;
};

type ClinicActivationRpcRow = {
  status: string | null;
  clinic_id: string | null;
  deployment_run_key: string | null;
  session_id: string | null;
  execution_key: string | null;
  item_id: string | null;
  execution_item_key: string | null;
  plan_item_key: string | null;
  clinic_state_before: unknown;
  clinic_state_after: unknown;
  activated_at: string | null;
  issue_code: string | null;
  message: string | null;
};

interface SupabaseErrorLike {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class DeploymentClinicActivationRepositoryError extends Error {
  readonly code: string | null;
  readonly diagnostics: DeploymentClinicActivationIssueDiagnostics;

  constructor(
    message: string,
    code: string | null = null,
    diagnostics: DeploymentClinicActivationIssueDiagnostics = {
      layer: "repository",
      errorCode: code,
      errorMessage: message,
    },
  ) {
    super(message);
    this.name = "DeploymentClinicActivationRepositoryError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export class SupabaseDeploymentClinicActivationRepository
  implements DeploymentClinicActivationRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async loadClinicActivationSnapshot(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
    itemId: string;
    executionItemKey: string;
    planItemKey: string;
  }): Promise<DeploymentClinicActivationSnapshot> {
    const [session, clinic, runLink] = await Promise.all([
      this.findSession(input),
      this.findClinic(input.clinicId),
      this.findDeploymentRunLink(input.deploymentRunId, input.clinicId),
    ]);
    const item = session ? await this.findItem(input, session.id) : null;

    return {
      session: session ? mapClinicActivationSessionRow(session) : null,
      item: item ? mapClinicActivationItemRow(item) : null,
      clinic: clinic ? mapClinicActivationClinicRow(clinic, runLink) : null,
    };
  }

  async activateClinicAtomically(
    command: DeploymentClinicActivationAtomicCommand,
  ): Promise<DeploymentClinicActivationAtomicResult> {
    const payload = clinicActivationRpcPayload(command);
    const { data, error } = await this.client.rpc(CLINIC_ACTIVATION_RPC_NAME, payload);

    if (error) {
      throw toRepositoryError(error, command.ownershipToken);
    }

    return mapClinicActivationRpcResult(readSingleRpcRow(data));
  }

  private async findSession(input: {
    clinicId: string;
    deploymentRunId: string;
    sessionId: string;
    executionKey: string;
  }): Promise<ClinicActivationSessionRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_sessions")
      .select(CLINIC_ACTIVATION_SESSION_COLUMNS)
      .eq("clinic_id", input.clinicId)
      .eq("deployment_run_key", input.deploymentRunId)
      .eq("id", input.sessionId)
      .eq("execution_key", input.executionKey)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClinicActivationSessionRow[];
    assertAtMostOne(rows, "clinic activation session");

    return rows[0] ?? null;
  }

  private async findItem(input: {
    itemId: string;
    executionItemKey: string;
    planItemKey: string;
  }, sessionId: string): Promise<ClinicActivationItemRow | null> {
    const { data, error } = await this.client
      .from("deployment_activation_execution_items")
      .select(CLINIC_ACTIVATION_ITEM_COLUMNS)
      .eq("session_id", sessionId)
      .eq("id", input.itemId)
      .eq("execution_item_key", input.executionItemKey)
      .eq("plan_item_key", input.planItemKey)
      .order("sequence", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClinicActivationItemRow[];
    assertAtMostOne(rows, "clinic activation item");

    return rows[0] ?? null;
  }

  private async findClinic(clinicId: string): Promise<ClinicActivationClinicRow | null> {
    const { data, error } = await this.client
      .from("clinics")
      .select(CLINIC_ACTIVATION_CLINIC_COLUMNS)
      .eq("id", clinicId)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClinicActivationClinicRow[];
    assertAtMostOne(rows, "clinic activation clinic");

    return rows[0] ?? null;
  }

  private async findDeploymentRunLink(
    deploymentRunId: string,
    clinicId: string,
  ): Promise<ClinicActivationDeploymentRunLinkRow | null> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .select("deployment_run_id,clinic_id")
      .eq("deployment_run_id", deploymentRunId)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true })
      .limit(2);

    if (error) {
      throw toRepositoryError(error);
    }

    const rows = (data ?? []) as unknown as ClinicActivationDeploymentRunLinkRow[];
    assertAtMostOne(rows, "clinic activation deployment run link");

    return rows[0] ?? null;
  }
}

export function mapClinicActivationSessionRow(
  row: ClinicActivationSessionRow,
): DeploymentClinicActivationSessionSnapshot {
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
  };
}

export function mapClinicActivationItemRow(
  row: ClinicActivationItemRow,
): DeploymentClinicActivationItemSnapshot {
  return {
    itemId: row.id,
    sessionId: row.session_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    sequence: row.sequence,
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
    expectedCurrentState: readRecord(row.expected_current_state),
    targetState: readRecord(row.target_state),
  };
}

export function mapClinicActivationClinicRow(
  row: ClinicActivationClinicRow,
  runLink: ClinicActivationDeploymentRunLinkRow | null,
): DeploymentClinicActivationClinicSnapshot {
  const deploymentStatus = row.deployment_status;

  return {
    id: row.id,
    clinicId: row.id,
    deploymentRunId: runLink?.deployment_run_id ?? null,
    deploymentStatus,
    deployedAt: row.deployed_at,
    active: deploymentStatus === "deployed",
    provisioningSource: deploymentStatus === "draft" ? "setup_draft" : null,
    provisioningStatus: deploymentStatus === "draft" ? "planned" : deploymentStatus,
    archivedAt: null,
    deletedAt: null,
    currentState: {
      clinicId: row.id,
      deploymentStatus,
    },
  };
}

export function clinicActivationRpcPayload(
  command: DeploymentClinicActivationAtomicCommand,
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
    p_expected_item_started_at: command.expectedItemStartedAt,
    p_expected_attempt_count: command.expectedAttemptCount,
    p_expected_current_state: cloneRecord(command.expectedCurrentState),
    p_target_state: cloneRecord(command.targetState),
    p_proposed_activated_at: command.proposedActivatedAt,
  };
}

export function mapClinicActivationRpcResult(
  row: ClinicActivationRpcRow,
): DeploymentClinicActivationAtomicResult {
  const status = readClinicActivationStatus(row.status);

  return {
    ok: status === "activated" || status === "already_activated",
    status,
    clinicId: row.clinic_id,
    deploymentRunId: row.deployment_run_key,
    sessionId: row.session_id,
    executionKey: row.execution_key,
    itemId: row.item_id,
    executionItemKey: row.execution_item_key,
    planItemKey: row.plan_item_key,
    clinicStateBefore: readNullableRecord(row.clinic_state_before),
    clinicStateAfter: readNullableRecord(row.clinic_state_after),
    activatedAt: row.activated_at,
    issueCode: row.issue_code,
    message: row.message ?? "Clinic activation RPC returned no message.",
  };
}

function readSingleRpcRow(data: unknown): ClinicActivationRpcRow {
  const rows = Array.isArray(data) ? data : [data];

  if (rows.length !== 1) {
    throw new DeploymentClinicActivationRepositoryError(
      "Ambiguous clinic activation RPC response.",
      null,
      {
        layer: "response_mapping",
        exceptionType: "DeploymentClinicActivationRepositoryError",
        exceptionMessage: "Ambiguous clinic activation RPC response.",
      },
    );
  }

  const row = rows[0];

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new DeploymentClinicActivationRepositoryError(
      "Malformed clinic activation RPC response.",
      null,
      {
        layer: "response_mapping",
        exceptionType: "DeploymentClinicActivationRepositoryError",
        exceptionMessage: "Malformed clinic activation RPC response.",
      },
    );
  }

  return row as ClinicActivationRpcRow;
}

function readClinicActivationStatus(
  value: string | null,
): DeploymentClinicActivationAtomicResult["status"] {
  const allowed = [
    "activated",
    "already_activated",
    "blocked",
    "conflict",
    "not_found",
    "error",
  ] as const;

  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as DeploymentClinicActivationAtomicResult["status"];
  }

  throw new DeploymentClinicActivationRepositoryError(
    "Malformed clinic activation RPC status.",
    null,
    {
      layer: "response_mapping",
      exceptionType: "DeploymentClinicActivationRepositoryError",
      exceptionMessage: "Malformed clinic activation RPC status.",
    },
  );
}

export function assertAtMostOne(rows: readonly unknown[], label: string): void {
  if (rows.length > 1) {
    throw new DeploymentClinicActivationRepositoryError(
      `Ambiguous ${label} rows prevent deterministic clinic activation.`,
      null,
      {
        layer: "response_mapping",
        exceptionType: "DeploymentClinicActivationRepositoryError",
        exceptionMessage: `Ambiguous ${label} rows prevent deterministic clinic activation.`,
      },
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
    ? cloneRecord(value as Record<string, unknown>)
    : {};
}

function readNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? cloneRecord(value as Record<string, unknown>)
    : null;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function redactSensitiveDiagnostic(
  value: string | null,
  sensitiveToken: string | null,
): string | null {
  if (!value || !sensitiveToken) {
    return value;
  }

  return value.split(sensitiveToken).join("[redacted]");
}
function toRepositoryError(
  error: SupabaseErrorLike,
  sensitiveToken: string | null = null,
): DeploymentClinicActivationRepositoryError {
  return new DeploymentClinicActivationRepositoryError(
    "Clinic activation repository query failed.",
    error.code ?? null,
    {
      layer: "rpc",
      errorCode: error.code ?? null,
      errorMessage: redactSensitiveDiagnostic(error.message, sensitiveToken),
      errorDetails: redactSensitiveDiagnostic(error.details ?? null, sensitiveToken),
      errorHint: redactSensitiveDiagnostic(error.hint ?? null, sensitiveToken),
    },
  );
}
