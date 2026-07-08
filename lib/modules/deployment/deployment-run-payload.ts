import type { DeploymentAuditEvidenceEnvelope } from "./deployment-audit-evidence-types";
import {
  hashDeploymentDraftInput,
  type DeploymentDraft,
} from "./deployment-draft";
import type { DeploymentRecoveryResult } from "./deployment-rollback-types";
import type { DeploymentLifecycleSummary } from "./deployment-state-machine-types";
import { DeploymentStatus } from "./deployment-types";
import type {
  DeploymentRunIdempotencyCheck,
  DeploymentRunIdempotencyResult,
  DeploymentRunMetadata,
  DeploymentRunRecord,
} from "./deployment-run-types";

export interface DeploymentRunPayloadBuildContext {
  id: string;
  deploymentRunId: string;
  clinicId?: string | null;
  idempotencyKey: string;
  payloadHash?: string;
  createdAt: string;
  startedAt?: string | null;
  retryOf?: string | null;
  deploymentVersion?: string;
  schemaVersion?: string;
  evidenceVersion?: string;
  metadata?: DeploymentRunMetadata;
}

export interface CreateDeploymentRunPersistencePayload {
  id: string;
  deploymentRunId: string;
  clinicId: string | null;
  idempotencyKey: string;
  payloadHash: string;
  lifecycleState: "ready";
  deploymentStatus: typeof DeploymentStatus.DRAFT;
  persistenceStatus: "pending";
  draftSnapshot: DeploymentDraft;
  auditEvidence: DeploymentAuditEvidenceEnvelope;
  rollbackRecovery: null;
  lifecycleSummary: DeploymentLifecycleSummary | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: null;
  failedAt: null;
  blockedAt: null;
  retryOf: string | null;
  metadata: DeploymentRunMetadata;
}

export interface StoreDeploymentRunAuditEvidencePayload {
  deploymentRunId: string;
  auditEvidence: DeploymentAuditEvidenceEnvelope;
  lifecycleSummary: DeploymentLifecycleSummary | null;
  rollbackRecovery: DeploymentRecoveryResult | null;
  metadata: DeploymentRunMetadata;
}

export interface AttachDeploymentRunRollbackRecoveryPayload {
  deploymentRunId: string;
  rollbackRecovery: DeploymentRecoveryResult;
  lifecycleSummary: DeploymentLifecycleSummary | null;
  metadata: DeploymentRunMetadata;
}

export function buildCreateDeploymentRunPersistencePayload(
  draft: DeploymentDraft,
  auditEvidence: DeploymentAuditEvidenceEnvelope,
  context: DeploymentRunPayloadBuildContext,
  lifecycleSummary: DeploymentLifecycleSummary | null = null,
): CreateDeploymentRunPersistencePayload {
  const payloadHash = context.payloadHash ?? hashDeploymentDraftInput(draft);

  return {
    id: context.id,
    deploymentRunId: context.deploymentRunId,
    clinicId: context.clinicId ?? null,
    idempotencyKey: context.idempotencyKey,
    payloadHash,
    lifecycleState: "ready",
    deploymentStatus: DeploymentStatus.DRAFT,
    persistenceStatus: "pending",
    draftSnapshot: draft,
    auditEvidence,
    rollbackRecovery: null,
    lifecycleSummary,
    createdAt: context.createdAt,
    startedAt: context.startedAt ?? null,
    completedAt: null,
    failedAt: null,
    blockedAt: null,
    retryOf: context.retryOf ?? null,
    metadata: buildDeploymentRunMetadata(context),
  };
}

export function buildStoreDeploymentRunAuditEvidencePayload(
  deploymentRunId: string,
  auditEvidence: DeploymentAuditEvidenceEnvelope,
  options: {
    lifecycleSummary?: DeploymentLifecycleSummary | null;
    rollbackRecovery?: DeploymentRecoveryResult | null;
    metadata?: DeploymentRunMetadata;
  } = {},
): StoreDeploymentRunAuditEvidencePayload {
  return {
    deploymentRunId,
    auditEvidence,
    lifecycleSummary: options.lifecycleSummary ?? null,
    rollbackRecovery: options.rollbackRecovery ?? null,
    metadata: options.metadata ?? {},
  };
}

export function buildAttachDeploymentRunRollbackRecoveryPayload(
  deploymentRunId: string,
  rollbackRecovery: DeploymentRecoveryResult,
  options: {
    lifecycleSummary?: DeploymentLifecycleSummary | null;
    metadata?: DeploymentRunMetadata;
  } = {},
): AttachDeploymentRunRollbackRecoveryPayload {
  return {
    deploymentRunId,
    rollbackRecovery,
    lifecycleSummary: options.lifecycleSummary ?? null,
    metadata: options.metadata ?? {},
  };
}

export function buildDeploymentRunRecord(
  payload: CreateDeploymentRunPersistencePayload,
): DeploymentRunRecord {
  return {
    ...payload,
  };
}

export function evaluateDeploymentRunIdempotency(
  check: DeploymentRunIdempotencyCheck,
): DeploymentRunIdempotencyResult {
  if (!check.idempotencyKey.trim() || !check.payloadHash.trim()) {
    return {
      decision: "reject_conflict",
      safeToReadExistingRun: false,
      safeToCreateNewRun: false,
      conflict: true,
      conflictReason: "invalid_request",
      existingRun: check.existingRun,
      message:
        "Deployment run idempotency requires both an idempotency key and payload hash.",
    };
  }

  if (!check.existingRun) {
    return {
      decision: "create_new_run",
      safeToReadExistingRun: false,
      safeToCreateNewRun: true,
      conflict: false,
      conflictReason: null,
      existingRun: null,
      message:
        "No deployment run exists for this idempotency key; a new evidence-first run may be created.",
    };
  }

  if (check.existingRun.payloadHash === check.payloadHash) {
    return {
      decision: "read_existing_run",
      safeToReadExistingRun: true,
      safeToCreateNewRun: false,
      conflict: false,
      conflictReason: null,
      existingRun: check.existingRun,
      message:
        "The idempotency key and payload hash match an existing deployment run; read the existing run.",
    };
  }

  return {
    decision: "reject_conflict",
    safeToReadExistingRun: false,
    safeToCreateNewRun: false,
    conflict: true,
    conflictReason: "same_key_different_payload",
    existingRun: check.existingRun,
    message:
      "The idempotency key already belongs to a different deployment payload and must be rejected.",
  };
}

function buildDeploymentRunMetadata(
  context: DeploymentRunPayloadBuildContext,
): DeploymentRunMetadata {
  return {
    ...(context.deploymentVersion
      ? { deploymentVersion: context.deploymentVersion }
      : {}),
    ...(context.schemaVersion ? { schemaVersion: context.schemaVersion } : {}),
    ...(context.evidenceVersion
      ? { evidenceVersion: context.evidenceVersion }
      : {}),
    ...(context.metadata ?? {}),
  };
}
