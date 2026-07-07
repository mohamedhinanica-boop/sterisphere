export type DeploymentLockStatus =
  | "unlocked"
  | "acquiring"
  | "locked"
  | "released"
  | "expired"
  | "failed";

export type DeploymentLockFailureReason =
  | "active_lock"
  | "expired_lock_requires_recovery"
  | "idempotency_conflict"
  | "invalid_request"
  | "not_locked";

export interface DeploymentLock {
  clinicId: string;
  deploymentRunId: string;
  idempotencyKey: string;
  requestedBy: string | null;
  acquiredAt: string | null;
  expiresAt: string | null;
  releasedAt: string | null;
  status: DeploymentLockStatus;
  failureReason: DeploymentLockFailureReason | null;
  message: string;
}

export interface DeploymentLockRequest {
  clinicId: string;
  deploymentRunId: string;
  idempotencyKey: string;
  requestedBy?: string | null;
  requestedAt: string;
  expiresAt?: string | null;
  lockTtlSeconds?: number;
  existingLock?: DeploymentLock | null;
}

export interface DeploymentLockResult {
  status: DeploymentLockStatus;
  lock: DeploymentLock;
  acquired: boolean;
  reusedExistingRun: boolean;
  rejectedDuplicate: boolean;
  failureReason: DeploymentLockFailureReason | null;
  message: string;
}

export interface DeploymentStageLockMetadata {
  clinicId: string;
  deploymentRunId: string;
  idempotencyKey: string;
  requestedBy: string | null;
  acquiredAt: string | null;
  expiresAt: string | null;
  releasedAt: string | null;
  status: DeploymentLockStatus;
  failureReason: DeploymentLockFailureReason | null;
  message: string;
  reusedExistingRun: boolean;
  rejectedDuplicate: boolean;
}
