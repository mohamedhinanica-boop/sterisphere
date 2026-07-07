import type {
  DeploymentIdempotencyKey,
  DeploymentIdempotencyRequest,
  DeploymentIdempotencyResult,
  DeploymentStageIdempotencyMetadata,
} from "./deployment-idempotency-types";

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;

export function normalizeIdempotencyKey(
  key: DeploymentIdempotencyKey | null | undefined,
): DeploymentIdempotencyKey {
  return (key ?? "").trim();
}

export function isValidIdempotencyKey(
  key: DeploymentIdempotencyKey | null | undefined,
): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(normalizeIdempotencyKey(key));
}

export function isIdempotencyExpired(
  request: DeploymentIdempotencyRequest,
): boolean {
  const expiresAt = resolveExpiresAt(request);

  if (!expiresAt) {
    return false;
  }

  return Date.parse(expiresAt) <= Date.parse(request.requestedAt);
}

export function shouldCreateNewDeploymentRun(
  request: DeploymentIdempotencyRequest,
): boolean {
  return (
    isValidIdempotencyKey(request.idempotencyKey) &&
    !isIdempotencyExpired(request) &&
    !resolveExistingPayloadHash(request) &&
    !request.hasActiveDeploymentConflict
  );
}

export function shouldReplayExistingDeploymentRun(
  request: DeploymentIdempotencyRequest,
): boolean {
  const existingPayloadHash = resolveExistingPayloadHash(request);

  return Boolean(
    isValidIdempotencyKey(request.idempotencyKey) &&
      !isIdempotencyExpired(request) &&
      existingPayloadHash &&
      existingPayloadHash === request.payloadHash,
  );
}

export function shouldRejectIdempotencyConflict(
  request: DeploymentIdempotencyRequest,
): boolean {
  const existingPayloadHash = resolveExistingPayloadHash(request);

  return Boolean(
    !isValidIdempotencyKey(request.idempotencyKey) ||
      isIdempotencyExpired(request) ||
      request.hasActiveDeploymentConflict ||
      (existingPayloadHash && existingPayloadHash !== request.payloadHash),
  );
}

export function createSimulatedIdempotencyResult(
  request: DeploymentIdempotencyRequest,
): DeploymentIdempotencyResult {
  const normalizedKey = normalizeIdempotencyKey(request.idempotencyKey);
  const existingPayloadHash = resolveExistingPayloadHash(request);
  const deploymentRunId = resolveDeploymentRunId(request);
  const expiresAt = resolveExpiresAt(request);
  const existingStatus = resolveExistingStatus(request);
  const base = {
    idempotencyKey: normalizedKey,
    ...(request.clinicId ? { clinicId: request.clinicId } : {}),
    ...(deploymentRunId ? { deploymentRunId } : {}),
    payloadHash: request.payloadHash,
    requestedBy: request.requestedBy ?? null,
    requestedAt: request.requestedAt,
    expiresAt,
    ...(existingStatus ? { existingStatus } : {}),
    ...(existingPayloadHash ? { existingPayloadHash } : {}),
  };

  if (!normalizedKey) {
    return {
      ...base,
      status: "invalid",
      conflictReason: "missing_key",
      shouldCreateDeploymentRun: false,
      shouldReplayDeploymentRun: false,
      shouldRejectRequest: true,
      message: "Idempotency key is required.",
    };
  }

  if (!isValidIdempotencyKey(normalizedKey)) {
    return {
      ...base,
      status: "invalid",
      conflictReason: "invalid_key",
      shouldCreateDeploymentRun: false,
      shouldReplayDeploymentRun: false,
      shouldRejectRequest: true,
      message: "Idempotency key is invalid.",
    };
  }

  if (isIdempotencyExpired(request)) {
    return {
      ...base,
      status: "expired",
      conflictReason: "expired_key",
      shouldCreateDeploymentRun: false,
      shouldReplayDeploymentRun: false,
      shouldRejectRequest: true,
      message:
        "Idempotency key is expired and requires a new key or manual recovery.",
    };
  }

  if (request.hasActiveDeploymentConflict) {
    return {
      ...base,
      status: "conflict",
      conflictReason: "active_deployment_conflict",
      shouldCreateDeploymentRun: false,
      shouldReplayDeploymentRun: false,
      shouldRejectRequest: true,
      message:
        "New deployment run cannot be created while an active deployment conflict exists.",
    };
  }

  if (existingPayloadHash && existingPayloadHash !== request.payloadHash) {
    return {
      ...base,
      status: "conflict",
      conflictReason: "payload_hash_mismatch",
      shouldCreateDeploymentRun: false,
      shouldReplayDeploymentRun: false,
      shouldRejectRequest: true,
      message:
        "Idempotency key was already used with a different deployment payload.",
    };
  }

  if (existingPayloadHash === request.payloadHash) {
    return {
      ...base,
      status: "replay_same_request",
      conflictReason: null,
      shouldCreateDeploymentRun: false,
      shouldReplayDeploymentRun: true,
      shouldRejectRequest: false,
      message:
        "Existing deployment run reused for matching idempotency key and payload hash.",
    };
  }

  return {
    ...base,
    status: "new_request",
    conflictReason: null,
    shouldCreateDeploymentRun: true,
    shouldReplayDeploymentRun: false,
    shouldRejectRequest: false,
    message: "New deployment run may be created for this idempotency key.",
  };
}

export function toDeploymentStageIdempotencyMetadata(
  result: DeploymentIdempotencyResult,
): DeploymentStageIdempotencyMetadata {
  return {
    idempotencyKey: result.idempotencyKey,
    ...(result.clinicId ? { clinicId: result.clinicId } : {}),
    ...(result.deploymentRunId
      ? { deploymentRunId: result.deploymentRunId }
      : {}),
    payloadHash: result.payloadHash,
    requestedBy: result.requestedBy,
    requestedAt: result.requestedAt,
    expiresAt: result.expiresAt,
    ...(result.existingStatus
      ? { existingStatus: result.existingStatus }
      : {}),
    ...(result.existingPayloadHash
      ? { existingPayloadHash: result.existingPayloadHash }
      : {}),
    status: result.status,
    conflictReason: result.conflictReason,
    message: result.message,
    shouldCreateDeploymentRun: result.shouldCreateDeploymentRun,
    shouldReplayDeploymentRun: result.shouldReplayDeploymentRun,
    shouldRejectRequest: result.shouldRejectRequest,
  };
}

function resolveExistingPayloadHash(
  request: DeploymentIdempotencyRequest,
): string | undefined {
  return (
    request.existingPayloadHash ??
    matchingSimulatedRecord(request)?.payloadHash
  );
}

function resolveDeploymentRunId(
  request: DeploymentIdempotencyRequest,
): string | undefined {
  return (
    request.existingDeploymentRunId ??
    matchingSimulatedRecord(request)?.deploymentRunId ??
    request.deploymentRunId
  );
}

function resolveExistingStatus(
  request: DeploymentIdempotencyRequest,
): string | undefined {
  return (
    request.existingStatus ??
    matchingSimulatedRecord(request)?.existingStatus
  );
}

function resolveExpiresAt(
  request: DeploymentIdempotencyRequest,
): string | null {
  return (
    request.expiresAt ??
    matchingSimulatedRecord(request)?.expiresAt ??
    null
  );
}

function matchingSimulatedRecord(
  request: DeploymentIdempotencyRequest,
) {
  const record = request.simulatedExistingIdempotency;

  if (
    !record ||
    normalizeIdempotencyKey(record.idempotencyKey) !==
      normalizeIdempotencyKey(request.idempotencyKey)
  ) {
    return undefined;
  }

  return record;
}
