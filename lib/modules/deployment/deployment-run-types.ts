import type { DeploymentAuditEvidenceEnvelope } from "./deployment-audit-evidence-types";
import type { DeploymentDraft } from "./deployment-draft";
import type { DeploymentRecoveryResult } from "./deployment-rollback-types";
import type {
  DeploymentLifecycleState,
  DeploymentLifecycleSummary,
} from "./deployment-state-machine-types";
import type { DeploymentStatus } from "./deployment-types";

export type DeploymentRunPersistenceStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled";

export type DeploymentRunIdempotencyDecision =
  | "create_new_run"
  | "read_existing_run"
  | "reject_conflict";

export type DeploymentRunIdempotencyConflictReason =
  | "same_key_different_payload"
  | "missing_existing_run"
  | "invalid_request";

export type DeploymentRunMetadataValue =
  | string
  | number
  | boolean
  | null;

export type DeploymentRunMetadata = Readonly<
  Record<string, DeploymentRunMetadataValue>
>;

export interface DeploymentRunRecord {
  id: string;
  deploymentRunId: string;
  clinicId: string | null;
  idempotencyKey: string;
  payloadHash: string;
  lifecycleState: DeploymentLifecycleState;
  deploymentStatus: DeploymentStatus;
  persistenceStatus: DeploymentRunPersistenceStatus;
  draftSnapshot: DeploymentDraft;
  auditEvidence: DeploymentAuditEvidenceEnvelope;
  rollbackRecovery: DeploymentRecoveryResult | null;
  lifecycleSummary: DeploymentLifecycleSummary | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  blockedAt: string | null;
  retryOf: string | null;
  metadata: DeploymentRunMetadata;
}

export interface DeploymentRunIdempotencyCheck {
  idempotencyKey: string;
  payloadHash: string;
  existingRun: DeploymentRunRecord | null;
}

export interface DeploymentRunIdempotencyResult {
  decision: DeploymentRunIdempotencyDecision;
  safeToReadExistingRun: boolean;
  safeToCreateNewRun: boolean;
  conflict: boolean;
  conflictReason: DeploymentRunIdempotencyConflictReason | null;
  existingRun: DeploymentRunRecord | null;
  message: string;
}

export interface DeploymentRunPersistenceResult {
  ok: boolean;
  deploymentRun: DeploymentRunRecord | null;
  message: string;
}

export interface DeploymentRunStatusUpdatePayload {
  deploymentRunId: string;
  lifecycleState: DeploymentLifecycleState;
  deploymentStatus: DeploymentStatus;
  persistenceStatus: DeploymentRunPersistenceStatus;
  updatedAt: string;
  metadata?: DeploymentRunMetadata;
}
