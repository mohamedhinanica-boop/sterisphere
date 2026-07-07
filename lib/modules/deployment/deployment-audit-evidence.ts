import type { DeploymentDraft } from "./deployment-draft";
import type { DeploymentDryRunPayloadMetadata } from "./deployment-dry-run";
import type {
  DeploymentAuditEvidenceEnvelope,
  DeploymentAuditEvidenceEvent,
  DeploymentAuditEvidenceOutcome,
  DeploymentAuditEvidenceStageSummary,
  DeploymentAuditEvidenceSummary,
  DeploymentAuditEvidenceValidation,
} from "./deployment-audit-evidence-types";
import type {
  DeploymentExecutionResult,
  DeploymentStageResult,
} from "./deployment-execution";
import type { DeploymentStageIdempotencyMetadata } from "./deployment-idempotency-types";
import type { DeploymentStageLockMetadata } from "./deployment-lock-types";
import type { DeploymentStage } from "./deployment-types";

export interface BuildDeploymentAuditEvidenceEnvelopeInput {
  draft: DeploymentDraft;
  execution: DeploymentExecutionResult;
  generatedAt: string;
  evidenceVersion?: string;
}

export function buildDeploymentAuditEvidenceEnvelope(
  input: BuildDeploymentAuditEvidenceEnvelopeInput,
): DeploymentAuditEvidenceEnvelope {
  const allStages = collectStages(input.execution);
  const idempotencyMetadata = allStages
    .map((stage) => stage.idempotency)
    .filter(isIdempotencyMetadata);
  const lockMetadata = allStages
    .map((stage) => stage.lock)
    .filter(isLockMetadata);
  const dryRunDiagnostics = allStages
    .map((stage) => stage.dryRunPayload)
    .filter(isDryRunPayloadMetadata);
  const rollbackVerification =
    input.execution.rollbackRecovery?.verification ?? null;
  const recoveryPlan =
    input.execution.rollbackRecovery?.recoveryPlan ?? null;
  const subject = {
    clinicId:
      rollbackVerification?.clinicId ??
      lockMetadata[0]?.clinicId ??
      idempotencyMetadata[0]?.clinicId ??
      null,
    deploymentRunId:
      rollbackVerification?.deploymentRunId ??
      lockMetadata[0]?.deploymentRunId ??
      idempotencyMetadata[0]?.deploymentRunId ??
      null,
    draftVersion: input.draft.draftVersion,
    payloadHash:
      idempotencyMetadata[0]?.payloadHash ??
      input.execution.transaction?.transactionId.replace(
        /^simulated-transaction-/,
        "",
      ) ??
      "payload-hash-unavailable",
  };
  const actor = {
    requestedBy:
      idempotencyMetadata[0]?.requestedBy ??
      lockMetadata[0]?.requestedBy ??
      null,
  };
  const finalOutcome = determineOutcome(input.execution);
  const summary = summarizeDeploymentAuditEvidenceParts(
    input.execution,
    finalOutcome,
  );
  const events = buildEvents(
    input.execution,
    allStages,
    input.generatedAt,
  );

  return {
    subject,
    actor,
    snapshot: {
      draft: input.draft,
      deploymentSummary: input.execution.summary,
      stageExecutionSummary: allStages.map(toStageSummary),
      dryRunDiagnostics,
      transaction: input.execution.transaction ?? null,
      lockMetadata,
      idempotencyMetadata,
      rollbackVerification,
      recoveryPlan,
      lifecycleSummary: input.execution.lifecycleSummary ?? null,
      finalOutcome,
    },
    integrity: {
      evidenceVersion: input.evidenceVersion ?? "deployment-audit-evidence-v1",
      generatedAt: input.generatedAt,
      immutableConcept: true,
      payloadHash: subject.payloadHash,
      eventCount: events.length,
      stageCount: allStages.length,
      warningCount: input.execution.warnings.length,
    },
    summary,
    events,
  };
}

export function appendDeploymentAuditEvidenceEvent(
  envelope: DeploymentAuditEvidenceEnvelope,
  event: DeploymentAuditEvidenceEvent,
): DeploymentAuditEvidenceEnvelope {
  const events = [...envelope.events, event];

  return {
    ...envelope,
    events,
    integrity: {
      ...envelope.integrity,
      eventCount: events.length,
    },
  };
}

export function summarizeDeploymentAuditEvidence(
  envelope: DeploymentAuditEvidenceEnvelope,
): DeploymentAuditEvidenceSummary {
  return envelope.summary;
}

export function validateDeploymentAuditEvidence(
  envelope: DeploymentAuditEvidenceEnvelope,
): DeploymentAuditEvidenceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!envelope.integrity.immutableConcept) {
    errors.push("Audit evidence must be immutable in concept.");
  }

  if (!envelope.subject.payloadHash) {
    errors.push("Audit evidence requires a payload hash.");
  }

  if (!envelope.subject.draftVersion) {
    errors.push("Audit evidence requires a draft version.");
  }

  if (envelope.integrity.eventCount !== envelope.events.length) {
    errors.push("Audit evidence event count does not match events.");
  }

  if (envelope.integrity.stageCount !== envelope.snapshot.stageExecutionSummary.length) {
    errors.push("Audit evidence stage count does not match stage summary.");
  }

  if (
    envelope.summary.rollbackRequired &&
    !envelope.snapshot.rollbackVerification
  ) {
    warnings.push("Rollback was required but no rollback verification is attached.");
  }

  if (
    envelope.summary.manualRecoveryRequired &&
    !envelope.snapshot.recoveryPlan
  ) {
    errors.push("Manual recovery requires a recovery plan.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function simulateDeploymentAuditEvidence(
  draft: DeploymentDraft,
  execution: DeploymentExecutionResult,
  generatedAt = execution.completedAt,
): DeploymentAuditEvidenceEnvelope {
  return buildDeploymentAuditEvidenceEnvelope({
    draft,
    execution,
    generatedAt,
  });
}

function isDryRunPayloadMetadata(
  metadata: DeploymentDryRunPayloadMetadata | undefined,
): metadata is DeploymentDryRunPayloadMetadata {
  return Boolean(metadata);
}

function isIdempotencyMetadata(
  metadata: DeploymentStageIdempotencyMetadata | undefined,
): metadata is DeploymentStageIdempotencyMetadata {
  return Boolean(metadata);
}

function isLockMetadata(
  metadata: DeploymentStageLockMetadata | undefined,
): metadata is DeploymentStageLockMetadata {
  return Boolean(metadata);
}

function collectStages(
  execution: DeploymentExecutionResult,
): readonly DeploymentStageResult[] {
  return [
    ...execution.completedStages,
    ...(execution.failedStage ? [execution.failedStage] : []),
    ...execution.skippedStages,
  ];
}

function toStageSummary(
  stage: DeploymentStageResult,
): DeploymentAuditEvidenceStageSummary {
  return {
    stageId: stage.stageId,
    stageDisplayName: stage.stageDisplayName,
    status: stage.status,
    durationMs: stage.durationMs,
    messageCount: stage.messages.length,
    warningCount: stage.warnings.length,
    payloadGenerated: stage.dryRunPayload?.payloadGenerated ?? false,
    payloadType: stage.dryRunPayload?.payloadType ?? null,
  };
}

function determineOutcome(
  execution: DeploymentExecutionResult,
): DeploymentAuditEvidenceOutcome {
  if (execution.status === "succeeded") {
    return "succeeded";
  }

  if (execution.rollbackRecovery?.recoveryPlan.classification === "engineering_support") {
    return "blocked";
  }

  if (execution.rollbackRecovery?.recoveryPlan.classification === "manual_cleanup") {
    return "partial";
  }

  return "failed";
}

function summarizeDeploymentAuditEvidenceParts(
  execution: DeploymentExecutionResult,
  outcome: DeploymentAuditEvidenceOutcome,
): DeploymentAuditEvidenceSummary {
  const rollbackVerified =
    execution.rollbackRecovery?.safeToRetry ?? false;
  const manualRecoveryRequired =
    execution.rollbackRecovery?.verification.manualRecoveryRequired ??
    false;

  return {
    outcome,
    completedStageCount: execution.completedStages.length,
    failedStage: execution.failedStage?.stageId ?? null,
    skippedStageCount: execution.skippedStages.length,
    warningCount: execution.warnings.length,
    rollbackRequired: execution.rollbackRequired,
    rollbackVerified,
    manualRecoveryRequired,
    safeToRetry:
      execution.status === "failed"
        ? rollbackVerified && !manualRecoveryRequired
        : false,
    retryDecision: buildRetryDecision(
      execution,
      rollbackVerified,
      manualRecoveryRequired,
    ),
  };
}

function buildRetryDecision(
  execution: DeploymentExecutionResult,
  rollbackVerified: boolean,
  manualRecoveryRequired: boolean,
): string {
  if (execution.status === "succeeded") {
    return "No retry needed; deployment simulation succeeded.";
  }

  if (!execution.rollbackRequired) {
    return "Retry may proceed after correcting the blocking condition; no deployment work was rolled back.";
  }

  if (rollbackVerified && !manualRecoveryRequired) {
    return "Retry may proceed after rollback verification.";
  }

  return "Retry is blocked until rollback recovery evidence is reviewed.";
}

function buildEvents(
  execution: DeploymentExecutionResult,
  stages: readonly DeploymentStageResult[],
  generatedAt: string,
): readonly DeploymentAuditEvidenceEvent[] {
  const events: DeploymentAuditEvidenceEvent[] = [
    {
      id: "deployment-started",
      type: "deployment_started",
      occurredAt: execution.startedAt,
      severity: "info",
      message: "Deployment execution evidence collection started.",
    },
  ];

  for (const [index, stage] of stages.entries()) {
    events.push({
      id: `stage-${index + 1}-${stage.stageId}`,
      type:
        stage.status === "succeeded"
          ? "stage_succeeded"
          : stage.status === "failed"
            ? "stage_failed"
            : "stage_skipped",
      occurredAt: stage.completedAt,
      stage: stage.stageId,
      severity: stage.status === "failed" ? "error" : "info",
      message: stage.messages[0] ?? `${stage.stageDisplayName} ${stage.status}.`,
      metadata: {
        durationMs: stage.durationMs,
        warningCount: stage.warnings.length,
        payloadGenerated: stage.dryRunPayload?.payloadGenerated ?? false,
      },
    });

    if (stage.idempotency) {
      events.push({
        id: `idempotency-${stage.stageId}`,
        type: "idempotency_evaluated",
        occurredAt: stage.completedAt,
        stage: stage.stageId,
        severity: stage.idempotency.shouldRejectRequest ? "error" : "info",
        message: stage.idempotency.message,
        metadata: {
          status: stage.idempotency.status,
          shouldReplayDeploymentRun:
            stage.idempotency.shouldReplayDeploymentRun,
          shouldCreateDeploymentRun:
            stage.idempotency.shouldCreateDeploymentRun,
        },
      });
    }

    if (stage.lock) {
      events.push({
        id: `lock-${stage.stageId}`,
        type: "lock_evaluated",
        occurredAt: stage.completedAt,
        stage: stage.stageId,
        severity: stage.lock.rejectedDuplicate ? "error" : "info",
        message: stage.lock.message,
        metadata: {
          status: stage.lock.status,
          reusedExistingRun: stage.lock.reusedExistingRun,
          rejectedDuplicate: stage.lock.rejectedDuplicate,
        },
      });
    }
  }

  if (execution.transaction) {
    events.push({
      id: "transaction-recorded",
      type: "transaction_recorded",
      occurredAt: execution.transaction.completedAt ?? generatedAt,
      severity: "info",
      message: `Deployment transaction ${execution.transaction.status}.`,
      metadata: {
        checkpointCount: execution.transaction.checkpoints.length,
        rollbackCheckpointCount:
          execution.transaction.rollbackCheckpointCount,
      },
    });
  }

  if (execution.rollbackRecovery) {
    events.push(
      {
        id: "rollback-verified",
        type: "rollback_verified",
        occurredAt:
          execution.rollbackRecovery.verification.verifiedAt ??
          generatedAt,
        severity:
          execution.rollbackRecovery.verification.manualRecoveryRequired
            ? "warning"
            : "info",
        message:
          execution.rollbackRecovery.messages[0] ??
          "Rollback verification evidence recorded.",
        metadata: {
          rollbackStatus:
            execution.rollbackRecovery.verification.rollbackStatus,
          manualRecoveryRequired:
            execution.rollbackRecovery.verification.manualRecoveryRequired,
        },
      },
      {
        id: "recovery-planned",
        type: "recovery_planned",
        occurredAt: generatedAt,
        severity:
          execution.rollbackRecovery.recoveryPlan.retryAllowed
            ? "info"
            : "warning",
        message: execution.rollbackRecovery.recoveryPlan.message,
        metadata: {
          classification:
            execution.rollbackRecovery.recoveryPlan.classification,
          retryAllowed:
            execution.rollbackRecovery.recoveryPlan.retryAllowed,
        },
      },
    );
  }

  events.push({
    id: "deployment-completed",
    type: "deployment_completed",
    occurredAt: execution.completedAt,
    severity: execution.status === "succeeded" ? "info" : "error",
    message: `Deployment simulation ${execution.status}.`,
    metadata: {
      rollbackRequired: execution.rollbackRequired,
      warningCount: execution.warnings.length,
    },
  });

  return events;
}
