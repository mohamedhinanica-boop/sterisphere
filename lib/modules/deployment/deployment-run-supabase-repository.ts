import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeploymentAuditEvidenceEnvelope } from "./deployment-audit-evidence-types";
import type { DeploymentDraft } from "./deployment-draft";
import type {
  AttachDeploymentRunRollbackRecoveryPayload,
  CreateDeploymentRunPersistencePayload,
  StoreDeploymentRunAuditEvidencePayload,
} from "./deployment-run-payload";
import {
  evaluateDeploymentRunIdempotency,
} from "./deployment-run-payload";
import type {
  DeploymentRunMetadata,
  DeploymentRunPersistenceResult,
  DeploymentRunPersistenceStatus,
  DeploymentRunRecord,
  DeploymentRunStatusUpdatePayload,
} from "./deployment-run-types";
import type { DeploymentRunRepository } from "./deployment-run-repository";
import type { DeploymentRecoveryResult } from "./deployment-rollback-types";
import type {
  DeploymentLifecycleState,
  DeploymentLifecycleSummary,
} from "./deployment-state-machine-types";
import type { DeploymentStatus } from "./deployment-types";

type DeploymentRunDatabasePayload = {
  id: string;
  deployment_run_id: string;
  clinic_id: string | null;
  idempotency_key: string;
  payload_hash: string;
  lifecycle_state: DeploymentLifecycleState;
  deployment_status: DeploymentStatus;
  draft_snapshot: DeploymentDraft;
  audit_evidence: DeploymentAuditEvidenceEnvelope;
  rollback_recovery: DeploymentRecoveryResult | null;
  lifecycle_summary: DeploymentLifecycleSummary | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  blocked_at: string | null;
  retry_of: string | null;
  metadata: DeploymentRunMetadata;
};

type DeploymentRunDatabaseRow = DeploymentRunDatabasePayload;

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

export class DeploymentRunRepositoryError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "DeploymentRunRepositoryError";
    this.code = code;
  }
}

export class DeploymentRunIdempotencyConflictError extends DeploymentRunRepositoryError {
  readonly existingRun: DeploymentRunRecord | null;

  constructor(message: string, existingRun: DeploymentRunRecord | null) {
    super(message, "deployment_run_idempotency_conflict");
    this.name = "DeploymentRunIdempotencyConflictError";
    this.existingRun = existingRun;
  }
}

export class SupabaseDeploymentRunRepository
  implements DeploymentRunRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async findByDeploymentRunId(
    deploymentRunId: string,
  ): Promise<DeploymentRunRecord | null> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .select("*")
      .eq("deployment_run_id", deploymentRunId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapDeploymentRunRowToRecord(data) : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<DeploymentRunRecord | null> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) {
      throw toRepositoryError(error);
    }

    return data ? mapDeploymentRunRowToRecord(data) : null;
  }

  async createDeploymentRun(
    payload: CreateDeploymentRunPersistencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    const existingRun = await this.findByIdempotencyKey(
      payload.idempotencyKey,
    );
    const idempotencyResult = evaluateDeploymentRunIdempotency({
      idempotencyKey: payload.idempotencyKey,
      payloadHash: payload.payloadHash,
      existingRun,
    });

    if (idempotencyResult.safeToReadExistingRun) {
      return {
        ok: true,
        deploymentRun: idempotencyResult.existingRun,
        message: idempotencyResult.message,
      };
    }

    if (idempotencyResult.conflict) {
      throw new DeploymentRunIdempotencyConflictError(
        idempotencyResult.message,
        idempotencyResult.existingRun,
      );
    }

    const { data, error } = await this.client
      .from("deployment_runs")
      .insert(mapCreatePayloadToDatabasePayload(payload))
      .select("*")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return this.resolveCreateConflictAfterUniqueViolation(payload);
      }

      throw toRepositoryError(error);
    }

    return {
      ok: true,
      deploymentRun: mapDeploymentRunRowToRecord(data),
      message: "Deployment run evidence record created.",
    };
  }

  async storeAuditEvidence(
    payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateAuditEvidence(payload);
  }

  async updateAuditEvidence(
    payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateDeploymentRunFields(payload.deploymentRunId, {
      audit_evidence: payload.auditEvidence,
      lifecycle_summary: payload.lifecycleSummary,
      rollback_recovery: payload.rollbackRecovery,
      metadata: payload.metadata,
    });
  }

  async attachRollbackRecovery(
    payload: AttachDeploymentRunRollbackRecoveryPayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateDeploymentRunFields(payload.deploymentRunId, {
      rollback_recovery: payload.rollbackRecovery,
      lifecycle_summary: payload.lifecycleSummary,
      metadata: payload.metadata,
    });
  }

  async updateLifecycleState(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateDeploymentRunFields(payload.deploymentRunId, {
      lifecycle_state: payload.lifecycleState,
      deployment_status: payload.deploymentStatus,
      metadata: payload.metadata,
    });
  }

  async markStarted(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateDeploymentRunFields(payload.deploymentRunId, {
      lifecycle_state: payload.lifecycleState,
      deployment_status: payload.deploymentStatus,
      started_at: payload.updatedAt,
      metadata: payload.metadata,
    });
  }

  async markCompleted(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateDeploymentRunFields(payload.deploymentRunId, {
      lifecycle_state: payload.lifecycleState,
      deployment_status: payload.deploymentStatus,
      completed_at: payload.updatedAt,
      metadata: payload.metadata,
    });
  }

  async markFailed(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateDeploymentRunFields(payload.deploymentRunId, {
      lifecycle_state: payload.lifecycleState,
      deployment_status: payload.deploymentStatus,
      failed_at: payload.updatedAt,
      metadata: payload.metadata,
    });
  }

  async markBlocked(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateDeploymentRunFields(payload.deploymentRunId, {
      lifecycle_state: payload.lifecycleState,
      deployment_status: payload.deploymentStatus,
      blocked_at: payload.updatedAt,
      metadata: payload.metadata,
    });
  }

  private async resolveCreateConflictAfterUniqueViolation(
    payload: CreateDeploymentRunPersistencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    const existingRun = await this.findByIdempotencyKey(
      payload.idempotencyKey,
    );
    const idempotencyResult = evaluateDeploymentRunIdempotency({
      idempotencyKey: payload.idempotencyKey,
      payloadHash: payload.payloadHash,
      existingRun,
    });

    if (idempotencyResult.safeToReadExistingRun) {
      return {
        ok: true,
        deploymentRun: idempotencyResult.existingRun,
        message: idempotencyResult.message,
      };
    }

    throw new DeploymentRunIdempotencyConflictError(
      idempotencyResult.message,
      idempotencyResult.existingRun,
    );
  }

  private async updateDeploymentRunFields(
    deploymentRunId: string,
    fields: Partial<DeploymentRunDatabasePayload>,
  ): Promise<DeploymentRunPersistenceResult> {
    const { data, error } = await this.client
      .from("deployment_runs")
      .update(removeUndefinedFields(fields))
      .eq("deployment_run_id", deploymentRunId)
      .select("*")
      .single();

    if (error) {
      throw toRepositoryError(error);
    }

    return {
      ok: true,
      deploymentRun: mapDeploymentRunRowToRecord(data),
      message: "Deployment run evidence record updated.",
    };
  }
}

export function mapCreatePayloadToDatabasePayload(
  payload: CreateDeploymentRunPersistencePayload,
): DeploymentRunDatabasePayload {
  return {
    id: payload.id,
    deployment_run_id: payload.deploymentRunId,
    clinic_id: payload.clinicId,
    idempotency_key: payload.idempotencyKey,
    payload_hash: payload.payloadHash,
    lifecycle_state: payload.lifecycleState,
    deployment_status: payload.deploymentStatus,
    draft_snapshot: payload.draftSnapshot,
    audit_evidence: payload.auditEvidence,
    rollback_recovery: payload.rollbackRecovery,
    lifecycle_summary: payload.lifecycleSummary,
    created_at: payload.createdAt,
    started_at: payload.startedAt,
    completed_at: payload.completedAt,
    failed_at: payload.failedAt,
    blocked_at: payload.blockedAt,
    retry_of: payload.retryOf,
    metadata: payload.metadata,
  };
}

export function mapDeploymentRunRowToRecord(
  row: DeploymentRunDatabaseRow,
): DeploymentRunRecord {
  return {
    id: row.id,
    deploymentRunId: row.deployment_run_id,
    clinicId: row.clinic_id,
    idempotencyKey: row.idempotency_key,
    payloadHash: row.payload_hash,
    lifecycleState: row.lifecycle_state,
    deploymentStatus: row.deployment_status,
    persistenceStatus: derivePersistenceStatus(row),
    draftSnapshot: row.draft_snapshot,
    auditEvidence: row.audit_evidence,
    rollbackRecovery: row.rollback_recovery,
    lifecycleSummary: row.lifecycle_summary,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    blockedAt: row.blocked_at,
    retryOf: row.retry_of,
    metadata: row.metadata,
  };
}

function derivePersistenceStatus(
  row: DeploymentRunDatabaseRow,
): DeploymentRunPersistenceStatus {
  if (row.blocked_at || row.lifecycle_state === "blocked") {
    return "blocked";
  }

  if (row.failed_at || row.deployment_status === "failed") {
    return "failed";
  }

  if (row.completed_at || row.lifecycle_state === "completed") {
    return "succeeded";
  }

  if (
    row.started_at ||
    row.lifecycle_state === "locked" ||
    row.lifecycle_state === "executing"
  ) {
    return "running";
  }

  return "pending";
}

function removeUndefinedFields<T extends Record<string, unknown>>(
  fields: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function isUniqueViolation(error: SupabaseErrorLike): boolean {
  return error.code === "23505";
}

function toRepositoryError(
  error: SupabaseErrorLike,
): DeploymentRunRepositoryError {
  return new DeploymentRunRepositoryError(error.message, error.code ?? null);
}
