import type { DeploymentDraft } from "./deployment-draft";
import type { DeploymentDryRunPayloadMetadata } from "./deployment-dry-run";
import type {
  DeploymentStageExecutionStatus,
  DeploymentStageResult,
} from "./deployment-execution";
import type { DeploymentStageIdempotencyMetadata } from "./deployment-idempotency-types";
import type { DeploymentStageLockMetadata } from "./deployment-lock-types";
import type { DeploymentRecoveryResult } from "./deployment-rollback-types";
import type { DeploymentLifecycleSummary } from "./deployment-state-machine-types";
import type { DeploymentTransactionResult } from "./deployment-transaction-types";
import type {
  DeploymentStage,
  DeploymentSummary,
} from "./deployment-types";

export type DeploymentAuditEvidenceOutcome =
  | "succeeded"
  | "failed"
  | "partial"
  | "blocked";

export type DeploymentAuditEvidenceEventType =
  | "deployment_started"
  | "stage_succeeded"
  | "stage_failed"
  | "stage_skipped"
  | "idempotency_evaluated"
  | "lock_evaluated"
  | "transaction_recorded"
  | "rollback_verified"
  | "recovery_planned"
  | "deployment_completed";

export type DeploymentAuditEvidenceSeverity =
  | "info"
  | "warning"
  | "error";

export type DeploymentAuditEvidenceMetadataValue =
  | string
  | number
  | boolean
  | null;

export interface DeploymentAuditEvidenceSubject {
  clinicId: string | null;
  deploymentRunId: string | null;
  draftVersion: string;
  payloadHash: string;
}

export interface DeploymentAuditEvidenceActor {
  requestedBy: string | null;
}

export interface DeploymentAuditEvidenceEvent {
  id: string;
  type: DeploymentAuditEvidenceEventType;
  occurredAt: string;
  stage?: DeploymentStage;
  severity: DeploymentAuditEvidenceSeverity;
  message: string;
  metadata?: Readonly<
    Record<string, DeploymentAuditEvidenceMetadataValue>
  >;
}

export interface DeploymentAuditEvidenceStageSummary {
  stageId: DeploymentStage;
  stageDisplayName: string;
  status: DeploymentStageExecutionStatus;
  durationMs: number;
  messageCount: number;
  warningCount: number;
  payloadGenerated: boolean;
  payloadType: string | null;
}

export interface DeploymentAuditEvidenceSnapshot {
  draft: DeploymentDraft;
  deploymentSummary: DeploymentSummary;
  stageExecutionSummary: readonly DeploymentAuditEvidenceStageSummary[];
  dryRunDiagnostics: readonly DeploymentDryRunPayloadMetadata[];
  transaction: DeploymentTransactionResult | null;
  lockMetadata: readonly DeploymentStageLockMetadata[];
  idempotencyMetadata: readonly DeploymentStageIdempotencyMetadata[];
  rollbackVerification: DeploymentRecoveryResult["verification"] | null;
  recoveryPlan: DeploymentRecoveryResult["recoveryPlan"] | null;
  lifecycleSummary: DeploymentLifecycleSummary | null;
  finalOutcome: DeploymentAuditEvidenceOutcome;
}

export interface DeploymentAuditEvidenceIntegrity {
  evidenceVersion: string;
  generatedAt: string;
  immutableConcept: true;
  payloadHash: string;
  eventCount: number;
  stageCount: number;
  warningCount: number;
}

export interface DeploymentAuditEvidenceSummary {
  outcome: DeploymentAuditEvidenceOutcome;
  completedStageCount: number;
  failedStage: DeploymentStage | null;
  skippedStageCount: number;
  warningCount: number;
  rollbackRequired: boolean;
  rollbackVerified: boolean;
  manualRecoveryRequired: boolean;
  safeToRetry: boolean;
  retryDecision: string;
}

export interface DeploymentAuditEvidenceEnvelope {
  subject: DeploymentAuditEvidenceSubject;
  actor: DeploymentAuditEvidenceActor;
  snapshot: DeploymentAuditEvidenceSnapshot;
  integrity: DeploymentAuditEvidenceIntegrity;
  summary: DeploymentAuditEvidenceSummary;
  events: readonly DeploymentAuditEvidenceEvent[];
}

export interface DeploymentAuditEvidenceValidation {
  valid: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}
