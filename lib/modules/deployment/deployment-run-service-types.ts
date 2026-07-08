import type { DeploymentAuditEvidenceEnvelope } from "./deployment-audit-evidence-types";
import type { DeploymentDraft } from "./deployment-draft";
import type {
  DeploymentLifecycleSummary,
} from "./deployment-state-machine-types";
import type {
  DeploymentRunIdempotencyConflictReason,
  DeploymentRunMetadata,
  DeploymentRunRecord,
} from "./deployment-run-types";

export type DeploymentRunPersistenceDecisionStatus =
  | "create"
  | "reuse"
  | "conflict"
  | "rejected"
  | "not_found";

export type DeploymentRunPersistenceDecisionReason =
  | "new_idempotency_key"
  | "same_key_same_payload"
  | DeploymentRunIdempotencyConflictReason
  | "missing_idempotency_key"
  | "invalid_idempotency_key"
  | "missing_payload_hash"
  | "missing_resume_identifier"
  | "deployment_run_not_found";

export interface DeploymentRunPersistenceDecision {
  status: DeploymentRunPersistenceDecisionStatus;
  reason: DeploymentRunPersistenceDecisionReason;
  idempotencyKey: string | null;
  payloadHash: string | null;
  existingRun: DeploymentRunRecord | null;
  canCreate: boolean;
  canReuse: boolean;
  conflict: boolean;
  rejected: boolean;
  message: string;
}

export interface DeploymentRunCreateCommand {
  id: string;
  deploymentRunId: string;
  clinicId?: string | null;
  idempotencyKey: string;
  payloadHash?: string;
  draft: DeploymentDraft;
  auditEvidence: DeploymentAuditEvidenceEnvelope;
  lifecycleSummary?: DeploymentLifecycleSummary | null;
  createdAt: string;
  startedAt?: string | null;
  retryOf?: string | null;
  deploymentVersion?: string;
  schemaVersion?: string;
  evidenceVersion?: string;
  metadata?: DeploymentRunMetadata;
}

export type DeploymentRunCreateResultStatus =
  | "created"
  | "reused"
  | "conflict"
  | "rejected";

export interface DeploymentRunCreateResult {
  ok: boolean;
  status: DeploymentRunCreateResultStatus;
  decision: DeploymentRunPersistenceDecision;
  deploymentRun: DeploymentRunRecord | null;
  message: string;
}

export interface DeploymentRunResumeCommand {
  deploymentRunId?: string;
  idempotencyKey?: string;
  expectedPayloadHash?: string;
}

export type DeploymentRunResumeResultStatus =
  | "resumed"
  | "not_found"
  | "conflict"
  | "rejected";

export interface DeploymentRunResumeResult {
  ok: boolean;
  status: DeploymentRunResumeResultStatus;
  decision: DeploymentRunPersistenceDecision;
  deploymentRun: DeploymentRunRecord | null;
  message: string;
}
