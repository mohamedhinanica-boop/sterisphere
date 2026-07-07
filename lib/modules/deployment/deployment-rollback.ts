import type {
  DeploymentRecoveryClassification,
  DeploymentRecoveryPlan,
  DeploymentRecoveryResult,
  DeploymentRollbackCheckpoint,
  DeploymentRollbackStatus,
  DeploymentRollbackStep,
  DeploymentRollbackVerification,
} from "./deployment-rollback-types";
import type { DeploymentTransactionResult } from "./deployment-transaction-types";
import type { DeploymentStage } from "./deployment-types";

export interface SimulateRollbackVerificationInput {
  transaction: DeploymentTransactionResult;
  deploymentRunId: string;
  clinicId: string;
  failedStage: DeploymentStage;
  rollbackStartedAt: string;
  rollbackCompletedAt: string | null;
  verifiedAt: string;
  rollbackStatus?: DeploymentRollbackStatus;
}

export function verifyRollback(
  verification: DeploymentRollbackVerification,
): DeploymentRecoveryResult {
  const recoveryPlan = buildRecoveryPlan(verification);

  return {
    verification,
    recoveryPlan,
    safeToRetry: isRollbackComplete(verification),
    messages: [
      ...verification.messages,
      recoveryPlan.message,
    ],
  };
}

export function isRollbackComplete(
  verification: DeploymentRollbackVerification,
): boolean {
  return (
    verification.rollbackStatus === "completed" &&
    Boolean(verification.verifiedAt) &&
    !verification.manualRecoveryRequired &&
    verification.checkpoints.every((checkpoint) => checkpoint.verified)
  );
}

export function requiresManualRecovery(
  verification: DeploymentRollbackVerification,
): boolean {
  return (
    verification.manualRecoveryRequired ||
    verification.rollbackStatus === "partial" ||
    verification.rollbackStatus === "failed" ||
    verification.rollbackStatus === "manual_recovery_required"
  );
}

export function buildRecoveryPlan(
  verification: DeploymentRollbackVerification,
): DeploymentRecoveryPlan {
  const classification = classifyRecovery(verification);
  const retryAllowed = classification === "automatic_retry";

  return {
    transactionId: verification.transactionId,
    deploymentRunId: verification.deploymentRunId,
    clinicId: verification.clinicId,
    failedStage: verification.failedStage,
    classification,
    retryAllowed,
    actions: buildRecoveryActions(classification),
    message: buildRecoveryMessage(classification),
  };
}

export function simulateRollbackVerification(
  input: SimulateRollbackVerificationInput,
): DeploymentRecoveryResult {
  const rollbackStatus =
    input.rollbackStatus ??
    deriveRollbackStatus(input.transaction);
  const manualRecoveryRequired =
    rollbackStatus !== "completed";
  const checkpoints = input.transaction.checkpoints.map(
    (checkpoint): DeploymentRollbackCheckpoint => ({
      id: checkpoint.id,
      stageId: checkpoint.stageId,
      stageDisplayName: checkpoint.stageDisplayName,
      rolledBackAt:
        rollbackStatus === "completed"
          ? input.rollbackCompletedAt
          : null,
      verified: rollbackStatus === "completed",
      message:
        rollbackStatus === "completed"
          ? `${checkpoint.stageDisplayName} rollback checkpoint verified.`
          : `${checkpoint.stageDisplayName} rollback checkpoint requires recovery review.`,
    }),
  );
  const steps = input.transaction.steps
    .filter((step) => step.status === "rolled_back")
    .map(
      (step): DeploymentRollbackStep => ({
        id: step.id,
        stageId: step.stageId,
        stageDisplayName: step.stageDisplayName,
        status: rollbackStatus,
        verified: rollbackStatus === "completed",
        message:
          rollbackStatus === "completed"
            ? step.message
            : `${step.stageDisplayName} rollback step requires manual verification.`,
      }),
    );
  const verification: DeploymentRollbackVerification = {
    transactionId: input.transaction.transactionId,
    deploymentRunId: input.deploymentRunId,
    clinicId: input.clinicId,
    failedStage: input.failedStage,
    rollbackStartedAt: input.rollbackStartedAt,
    rollbackCompletedAt: input.rollbackCompletedAt,
    verifiedAt:
      rollbackStatus === "completed" ? input.verifiedAt : null,
    rollbackStatus,
    manualRecoveryRequired,
    checkpoints,
    steps,
    messages: [
      summarizeRollbackStatus(rollbackStatus),
      manualRecoveryRequired
        ? "Manual recovery is required before retry."
        : "Rollback verified; deployment is safe to retry.",
    ],
  };

  return verifyRollback(verification);
}

export function summarizeRollback(
  verification: DeploymentRollbackVerification,
): string {
  return [
    `Rollback ${verification.rollbackStatus} for run ${verification.deploymentRunId}.`,
    `${verification.checkpoints.length} checkpoints verified: ${verification.checkpoints.filter((checkpoint) => checkpoint.verified).length}.`,
    verification.manualRecoveryRequired
      ? "Manual recovery required."
      : "Safe to retry.",
  ].join(" ");
}

function deriveRollbackStatus(
  transaction: DeploymentTransactionResult,
): DeploymentRollbackStatus {
  if (transaction.status !== "rolled_back") {
    return "manual_recovery_required";
  }

  if (
    transaction.checkpoints.length > 0 &&
    transaction.rollbackCheckpointCount < transaction.checkpoints.length
  ) {
    return "partial";
  }

  return "completed";
}

function classifyRecovery(
  verification: DeploymentRollbackVerification,
): DeploymentRecoveryClassification {
  if (isRollbackComplete(verification)) {
    return "automatic_retry";
  }

  if (verification.rollbackStatus === "partial") {
    return "manual_cleanup";
  }

  if (verification.rollbackStatus === "failed") {
    return "engineering_support";
  }

  return "manual_verification";
}

function buildRecoveryActions(
  classification: DeploymentRecoveryClassification,
): readonly string[] {
  switch (classification) {
    case "automatic_retry":
      return [
        "Confirm deployment draft remains reviewed.",
        "Start a new deployment attempt with a fresh idempotency decision.",
      ];
    case "manual_verification":
      return [
        "Verify clinic deployment status remains non-operational.",
        "Review deployment run evidence before retry.",
      ];
    case "manual_cleanup":
      return [
        "Identify rollback checkpoints that were not verified.",
        "Clean up or quarantine partial clinic configuration.",
        "Record manual recovery evidence before retry.",
      ];
    case "engineering_support":
      return [
        "Block deployment retry.",
        "Escalate to engineering support.",
        "Verify data consistency before changing deployment status.",
      ];
  }
}

function buildRecoveryMessage(
  classification: DeploymentRecoveryClassification,
): string {
  switch (classification) {
    case "automatic_retry":
      return "Rollback verification completed; automatic retry is allowed.";
    case "manual_verification":
      return "Manual verification is required before retry.";
    case "manual_cleanup":
      return "Manual cleanup is required before retry.";
    case "engineering_support":
      return "Deployment is blocked until administrator or engineering intervention completes.";
  }
}

function summarizeRollbackStatus(
  status: DeploymentRollbackStatus,
): string {
  switch (status) {
    case "completed":
      return "Rollback completed and verification passed.";
    case "partial":
      return "Rollback completed partially and requires manual cleanup.";
    case "failed":
      return "Rollback failed and deployment is blocked.";
    case "manual_recovery_required":
      return "Rollback state requires manual recovery.";
    case "pending":
      return "Rollback verification is pending.";
    case "running":
      return "Rollback verification is running.";
  }
}
