export type DeploymentIdempotencyStatus =
  | "new_request"
  | "replay_same_request"
  | "conflict"
  | "expired"
  | "invalid";

export type DeploymentIdempotencyKey = string;

export type DeploymentIdempotencyConflictReason =
  | "missing_key"
  | "invalid_key"
  | "payload_hash_mismatch"
  | "expired_key"
  | "active_deployment_conflict";

export interface DeploymentIdempotencyRecord {
  idempotencyKey: DeploymentIdempotencyKey;
  clinicId?: string;
  deploymentRunId?: string;
  payloadHash: string;
  requestedBy: string | null;
  requestedAt: string;
  expiresAt: string | null;
  existingStatus?: string;
  message: string;
}

export interface DeploymentIdempotencyRequest {
  idempotencyKey: DeploymentIdempotencyKey;
  clinicId?: string;
  deploymentRunId?: string;
  payloadHash: string;
  requestedBy?: string | null;
  requestedAt: string;
  expiresAt?: string | null;
  existingStatus?: string;
  existingPayloadHash?: string;
  existingDeploymentRunId?: string;
  simulatedExistingIdempotency?: DeploymentIdempotencyRecord | null;
  hasActiveDeploymentConflict?: boolean;
}

export interface DeploymentIdempotencyResult {
  status: DeploymentIdempotencyStatus;
  idempotencyKey: DeploymentIdempotencyKey;
  clinicId?: string;
  deploymentRunId?: string;
  payloadHash: string;
  requestedBy: string | null;
  requestedAt: string;
  expiresAt: string | null;
  existingStatus?: string;
  existingPayloadHash?: string;
  conflictReason: DeploymentIdempotencyConflictReason | null;
  shouldCreateDeploymentRun: boolean;
  shouldReplayDeploymentRun: boolean;
  shouldRejectRequest: boolean;
  message: string;
}

export interface DeploymentStageIdempotencyMetadata {
  idempotencyKey: DeploymentIdempotencyKey;
  clinicId?: string;
  deploymentRunId?: string;
  payloadHash: string;
  requestedBy: string | null;
  requestedAt: string;
  expiresAt: string | null;
  existingStatus?: string;
  existingPayloadHash?: string;
  status: DeploymentIdempotencyStatus;
  conflictReason: DeploymentIdempotencyConflictReason | null;
  message: string;
  shouldCreateDeploymentRun: boolean;
  shouldReplayDeploymentRun: boolean;
  shouldRejectRequest: boolean;
}
