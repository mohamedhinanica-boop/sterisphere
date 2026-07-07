import type {
  DeploymentLock,
  DeploymentLockRequest,
  DeploymentLockResult,
  DeploymentStageLockMetadata,
} from "./deployment-lock-types";

export function canAcquireDeploymentLock(
  request: DeploymentLockRequest,
): boolean {
  const existingLock = request.existingLock ?? null;

  return (
    hasValidLockRequest(request) &&
    (!existingLock ||
      (!isDeploymentLockActive(existingLock, request.requestedAt) &&
        !isDeploymentLockExpired(existingLock, request.requestedAt)))
  );
}

export function isDeploymentLockActive(
  lock: DeploymentLock,
  timestamp: string,
): boolean {
  return (
    (lock.status === "acquiring" || lock.status === "locked") &&
    !isDeploymentLockExpired(lock, timestamp) &&
    !lock.releasedAt
  );
}

export function isDeploymentLockExpired(
  lock: DeploymentLock,
  timestamp: string,
): boolean {
  if (!lock.expiresAt || lock.status === "released") {
    return false;
  }

  return Date.parse(lock.expiresAt) <= Date.parse(timestamp);
}

export function shouldReuseExistingDeploymentRun(
  request: DeploymentLockRequest,
): boolean {
  const existingLock = request.existingLock ?? null;

  return Boolean(
    existingLock &&
      isDeploymentLockActive(existingLock, request.requestedAt) &&
      existingLock.clinicId === request.clinicId &&
      existingLock.idempotencyKey === request.idempotencyKey,
  );
}

export function shouldRejectDuplicateDeployment(
  request: DeploymentLockRequest,
): boolean {
  const existingLock = request.existingLock ?? null;

  return Boolean(
    existingLock &&
      isDeploymentLockActive(existingLock, request.requestedAt) &&
      existingLock.clinicId === request.clinicId &&
      existingLock.idempotencyKey !== request.idempotencyKey,
  );
}

export function createSimulatedDeploymentLock(
  request: DeploymentLockRequest,
): DeploymentLockResult {
  const existingLock = request.existingLock ?? null;

  if (!hasValidLockRequest(request)) {
    return failedLockResult(
      request,
      "invalid_request",
      "Deployment lock request is incomplete.",
    );
  }

  if (shouldReuseExistingDeploymentRun(request) && existingLock) {
    return {
      status: existingLock.status,
      lock: existingLock,
      acquired: false,
      reusedExistingRun: true,
      rejectedDuplicate: false,
      failureReason: null,
      message:
        "Existing deployment run reused for matching idempotency key.",
    };
  }

  if (shouldRejectDuplicateDeployment(request) && existingLock) {
    return {
      status: "failed",
      lock: {
        ...existingLock,
        failureReason: "active_lock",
        message:
          "Active deployment lock belongs to a different idempotency key.",
      },
      acquired: false,
      reusedExistingRun: false,
      rejectedDuplicate: true,
      failureReason: "active_lock",
      message:
        "Duplicate deployment request rejected because another deployment lock is active.",
    };
  }

  if (
    existingLock &&
    isDeploymentLockExpired(existingLock, request.requestedAt)
  ) {
    return {
      status: "expired",
      lock: {
        ...existingLock,
        status: "expired",
        failureReason: "expired_lock_requires_recovery",
        message:
          "Existing deployment lock is expired and requires recovery review before retry.",
      },
      acquired: false,
      reusedExistingRun: false,
      rejectedDuplicate: true,
      failureReason: "expired_lock_requires_recovery",
      message:
        "Expired deployment lock requires recovery review before a new lock can be acquired.",
    };
  }

  const expiresAt =
    request.expiresAt ??
    (request.lockTtlSeconds
      ? addSeconds(request.requestedAt, request.lockTtlSeconds)
      : null);
  const lock: DeploymentLock = {
    clinicId: request.clinicId,
    deploymentRunId: request.deploymentRunId,
    idempotencyKey: request.idempotencyKey,
    requestedBy: request.requestedBy ?? null,
    acquiredAt: request.requestedAt,
    expiresAt,
    releasedAt: null,
    status: "locked",
    failureReason: null,
    message: "Simulated deployment lock acquired.",
  };

  return {
    status: lock.status,
    lock,
    acquired: true,
    reusedExistingRun: false,
    rejectedDuplicate: false,
    failureReason: null,
    message: lock.message,
  };
}

export function releaseSimulatedDeploymentLock(
  lock: DeploymentLock,
  releasedAt: string,
): DeploymentLockResult {
  if (!isDeploymentLockActive(lock, releasedAt)) {
    return {
      status: "failed",
      lock: {
        ...lock,
        failureReason: "not_locked",
        message: "Deployment lock cannot be released because it is not active.",
      },
      acquired: false,
      reusedExistingRun: false,
      rejectedDuplicate: false,
      failureReason: "not_locked",
      message: "Deployment lock cannot be released because it is not active.",
    };
  }

  const releasedLock: DeploymentLock = {
    ...lock,
    releasedAt,
    status: "released",
    message: "Simulated deployment lock released.",
  };

  return {
    status: releasedLock.status,
    lock: releasedLock,
    acquired: false,
    reusedExistingRun: false,
    rejectedDuplicate: false,
    failureReason: null,
    message: releasedLock.message,
  };
}

export function expireSimulatedDeploymentLock(
  lock: DeploymentLock,
  expiredAt: string,
): DeploymentLockResult {
  const expiredLock: DeploymentLock = {
    ...lock,
    expiresAt: lock.expiresAt ?? expiredAt,
    status: "expired",
    failureReason: "expired_lock_requires_recovery",
    message:
      "Simulated deployment lock expired and requires recovery review.",
  };

  return {
    status: expiredLock.status,
    lock: expiredLock,
    acquired: false,
    reusedExistingRun: false,
    rejectedDuplicate: true,
    failureReason: expiredLock.failureReason,
    message: expiredLock.message,
  };
}

export function toDeploymentStageLockMetadata(
  result: DeploymentLockResult,
): DeploymentStageLockMetadata {
  return {
    clinicId: result.lock.clinicId,
    deploymentRunId: result.lock.deploymentRunId,
    idempotencyKey: result.lock.idempotencyKey,
    requestedBy: result.lock.requestedBy,
    acquiredAt: result.lock.acquiredAt,
    expiresAt: result.lock.expiresAt,
    releasedAt: result.lock.releasedAt,
    status: result.status,
    failureReason: result.failureReason,
    message: result.message,
    reusedExistingRun: result.reusedExistingRun,
    rejectedDuplicate: result.rejectedDuplicate,
  };
}

function hasValidLockRequest(request: DeploymentLockRequest): boolean {
  return Boolean(
    request.clinicId &&
      request.deploymentRunId &&
      request.idempotencyKey &&
      request.requestedAt,
  );
}

function failedLockResult(
  request: DeploymentLockRequest,
  failureReason: DeploymentLockResult["failureReason"],
  message: string,
): DeploymentLockResult {
  const lock: DeploymentLock = {
    clinicId: request.clinicId,
    deploymentRunId: request.deploymentRunId,
    idempotencyKey: request.idempotencyKey,
    requestedBy: request.requestedBy ?? null,
    acquiredAt: null,
    expiresAt: request.expiresAt ?? null,
    releasedAt: null,
    status: "failed",
    failureReason,
    message,
  };

  return {
    status: "failed",
    lock,
    acquired: false,
    reusedExistingRun: false,
    rejectedDuplicate: true,
    failureReason,
    message,
  };
}

function addSeconds(timestamp: string, seconds: number): string {
  return new Date(Date.parse(timestamp) + seconds * 1000).toISOString();
}
