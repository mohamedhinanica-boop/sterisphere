import {
  hashDeploymentDraftInput,
  summarizeDeploymentDraft,
  type DeploymentDraft,
} from "./deployment-draft";
import { simulateDeploymentAuditEvidence } from "./deployment-audit-evidence";
import { validateDeploymentDraft } from "./deployment-draft-validation";
import {
  buildRollbackDryRunPayload,
  buildStageDryRunPayload,
  createEmptyDryRunPayloadMetadata,
} from "./deployment-dry-run";
import {
  createSimulatedIdempotencyResult,
  toDeploymentStageIdempotencyMetadata,
} from "./deployment-idempotency";
import type { DeploymentIdempotencyRecord } from "./deployment-idempotency-types";
import {
  createSimulatedDeploymentLock,
  toDeploymentStageLockMetadata,
} from "./deployment-lock";
import type { DeploymentLock } from "./deployment-lock-types";
import { simulateRollbackVerification } from "./deployment-rollback";
import type { DeploymentRollbackStatus } from "./deployment-rollback-types";
import { simulateDeploymentLifecycle } from "./deployment-state-machine";
import type {
  DeploymentExecutionResult,
  DeploymentRollbackResult,
  DeploymentSimulationContext,
  DeploymentSimulationOptions,
  DeploymentStageResult,
} from "./deployment-execution";
import {
  DEPLOYMENT_STAGES,
  type DeploymentStageDefinition,
} from "./deployment-stages";
import {
  DeploymentTransaction,
  isDeploymentTransactionStage,
} from "./deployment-transaction";
import type {
  DeploymentStageTransactionMetadata,
  DeploymentTransactionResult,
} from "./deployment-transaction-types";
import { DeploymentStage } from "./deployment-types";
import {
  createDeploymentRepository,
  type DeploymentRepositoryBuildContext,
  type DeploymentRepository,
} from "./repositories";

export interface DeploymentEngineOptions
  extends DeploymentSimulationOptions {
  repository?: DeploymentRepository;
  repositoryContext?: Partial<DeploymentRepositoryBuildContext>;
}

/**
 * In-memory implementation of the documented Deployment Engine sequence.
 *
 * Simulation performs no persistence, networking, authentication changes, or
 * application state mutation. execute() intentionally delegates to simulate()
 * until real stage handlers are introduced in a later persistence phase.
 */
export class DeploymentEngine {
  private readonly now: () => Date;
  private readonly stageHandlers: NonNullable<
    DeploymentSimulationOptions["stageHandlers"]
  >;
  private readonly repository: DeploymentRepository;
  private readonly repositoryContext: Partial<DeploymentRepositoryBuildContext>;
  private readonly requestedBy: string | null;
  private readonly lockExpiresAt: string | null | undefined;
  private readonly lockTtlSeconds: number | undefined;
  private readonly simulatedExistingLock: DeploymentLock | null;
  private readonly idempotencyExpiresAt: string | null | undefined;
  private readonly simulatedExistingIdempotency: DeploymentIdempotencyRecord | null;
  private readonly hasActiveDeploymentConflict: boolean;
  private readonly simulatedRollbackStatus: DeploymentRollbackStatus | undefined;

  constructor(
    private readonly draft: DeploymentDraft,
    options: DeploymentEngineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.stageHandlers = options.stageHandlers ?? {};
    this.repository =
      options.repository ?? createDeploymentRepository();
    this.repositoryContext = options.repositoryContext ?? {};
    this.requestedBy =
      options.requestedBy ?? this.repositoryContext.startedBy ?? null;
    this.lockExpiresAt = options.lockExpiresAt;
    this.lockTtlSeconds = options.lockTtlSeconds;
    this.simulatedExistingLock = options.simulatedExistingLock ?? null;
    this.idempotencyExpiresAt = options.idempotencyExpiresAt;
    this.simulatedExistingIdempotency =
      options.simulatedExistingIdempotency ?? null;
    this.hasActiveDeploymentConflict =
      options.hasActiveDeploymentConflict ?? false;
    this.simulatedRollbackStatus = options.simulatedRollbackStatus;
  }

  validate() {
    return validateDeploymentDraft(this.draft);
  }

  prepare(): DeploymentSimulationContext {
    const payloadHash = hashDeploymentDraftInput(this.draft);
    const timestamp =
      this.repositoryContext.timestamp ?? this.timestamp();
    const identifierSuffix = payloadHash.replace(/^draft-/, "");
    const clinicId =
      this.repositoryContext.clinicId ??
      `simulated-clinic-${identifierSuffix}`;
    const deploymentRunId =
      this.repositoryContext.deploymentRunId ??
      `simulated-run-${identifierSuffix}`;
    const idempotencyKey =
      this.repositoryContext.idempotencyKey ??
      `simulation-${payloadHash}`;

    return {
      draft: this.draft,
      payloadHash,
      preparedAt: timestamp,
      summary: summarizeDeploymentDraft(this.draft),
      repositoryBuildContext: {
        clinicId,
        deploymentRunId,
        ...(this.repositoryContext.startedBy
          ? { startedBy: this.repositoryContext.startedBy }
          : {}),
        idempotencyKey,
        timestamp,
        deploymentVersion:
          this.repositoryContext.deploymentVersion ??
          `draft-${this.draft.draftVersion}`,
        schemaVersion:
          this.repositoryContext.schemaVersion ??
          "simulation-schema-v1",
      },
      idempotencyRequest: {
        idempotencyKey,
        clinicId,
        deploymentRunId,
        payloadHash,
        requestedBy: this.requestedBy,
        requestedAt: timestamp,
        ...(this.idempotencyExpiresAt !== undefined
          ? { expiresAt: this.idempotencyExpiresAt }
          : {}),
        simulatedExistingIdempotency:
          this.simulatedExistingIdempotency,
        hasActiveDeploymentConflict: this.hasActiveDeploymentConflict,
      },
      lockRequest: {
        clinicId,
        deploymentRunId,
        idempotencyKey,
        requestedBy: this.requestedBy,
        requestedAt: timestamp,
        ...(this.lockExpiresAt !== undefined
          ? { expiresAt: this.lockExpiresAt }
          : {}),
        ...(this.lockTtlSeconds !== undefined
          ? { lockTtlSeconds: this.lockTtlSeconds }
          : {}),
        existingLock: this.simulatedExistingLock,
      },
    };
  }

  simulate(): DeploymentExecutionResult {
    const startedAt = this.timestamp();
    const startedAtMs = Date.parse(startedAt);
    const validation = this.validate();
    const summary = summarizeDeploymentDraft(this.draft);

    if (!validation.valid) {
      const skippedStages = DEPLOYMENT_STAGES.map((stage) =>
        this.createSkippedStage(
          stage,
          startedAt,
          "Skipped because deployment draft validation failed.",
        ),
      );
      const completedAt = this.timestamp();
      const result: DeploymentExecutionResult = {
        status: "failed",
        startedAt,
        completedAt,
        durationMs: elapsedMilliseconds(startedAtMs, completedAt),
        completedStages: [],
        skippedStages,
        warnings: validation.errors.map((error) => error.message),
        messages: [
          "Deployment simulation stopped before stage execution.",
        ],
        rollbackRequired: false,
        summary,
      };

      const lifecycleSummary = simulateDeploymentLifecycle({
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        status: result.status,
        rollbackRequired: result.rollbackRequired,
        clinicId: null,
        deploymentRunId: null,
      });
      const resultWithLifecycle: DeploymentExecutionResult = {
        ...result,
        lifecycleSummary,
      };

      return {
        ...resultWithLifecycle,
        auditEvidence: simulateDeploymentAuditEvidence(
          this.draft,
          resultWithLifecycle,
          completedAt,
        ),
      };
    }

    const context = this.prepare();
    let completedStages: DeploymentStageResult[] = [];
    const skippedStages: DeploymentStageResult[] = [];
    const warnings: string[] = [];
    const messages: string[] = [];
    let failedStage: DeploymentStageResult | undefined;
    const transaction = new DeploymentTransaction({
      transactionId: `simulated-transaction-${context.payloadHash}`,
      startedAt: context.preparedAt,
    });
    let transactionResult: DeploymentTransactionResult | undefined;

    for (const [index, stage] of DEPLOYMENT_STAGES.entries()) {
      const participatesInTransaction =
        isDeploymentTransactionStage(stage.id);

      if (participatesInTransaction && !transactionResult) {
        transactionResult = transaction.begin(this.timestamp());
      }

      let result = this.simulateStage(stage, context);

      if (result.status === "failed") {
        if (transactionResult) {
          transactionResult = transaction.abort(
            result.completedAt,
            `${stage.displayName} failed; simulated deployment transaction aborted.`,
          );
          transactionResult = transaction.rollback(
            this.timestamp(),
            `${stage.displayName} failed; simulated deployment transaction rolled back.`,
          );
          result = this.withTransactionMetadata(
            result,
            transactionResult,
          );
          completedStages = completedStages.map((completedStage) =>
            completedStage.transaction
              ? this.withTransactionMetadata(
                  completedStage,
                  transactionResult as DeploymentTransactionResult,
                )
              : completedStage,
          );
        }

        failedStage = result;
        warnings.push(...result.warnings);
        messages.push(...result.messages);

        const skippedAt = result.completedAt;
        for (const remainingStage of DEPLOYMENT_STAGES.slice(index + 1)) {
          skippedStages.push(
            this.createSkippedStage(
              remainingStage,
              skippedAt,
              `Skipped after ${stage.displayName} failed.`,
            ),
          );
        }
        break;
      }

      if (participatesInTransaction && transactionResult) {
        const checkpoint = transaction.recordCheckpoint({
          stageId: stage.id,
          stageDisplayName: stage.displayName,
          recordedAt: result.completedAt,
          message: `${stage.displayName} checkpoint recorded in simulated transaction.`,
        });
        transactionResult = transaction.result();
        result = this.withTransactionMetadata(
          result,
          transactionResult,
          checkpoint.id,
        );
      }

      completedStages.push(result);
      warnings.push(...result.warnings);
      messages.push(...result.messages);
    }

    const completedAt = this.timestamp();
    if (!failedStage && transactionResult) {
      transactionResult = transaction.commit(completedAt);
      completedStages = completedStages.map((completedStage) =>
        completedStage.transaction
          ? this.withTransactionMetadata(
              completedStage,
              transactionResult as DeploymentTransactionResult,
              completedStage.transaction.checkpointId,
            )
          : completedStage,
      );
    }

    const rollbackRequired = Boolean(
      failedStage &&
        completedStages.some(
          (stage) => stage.stageId !== DeploymentStage.VALIDATION,
        ),
    );
    const rollbackDryRunPayload =
      rollbackRequired && failedStage
        ? buildRollbackDryRunPayload(
            context,
            failedStage.stageId,
            completedStages.map((stage) => stage.stageId),
          )
        : undefined;
    const rollbackRecovery =
      failedStage && transactionResult?.status === "rolled_back"
        ? simulateRollbackVerification({
            transaction: transactionResult,
            deploymentRunId:
              context.repositoryBuildContext.deploymentRunId ??
              "simulated-run-unavailable",
            clinicId:
              context.repositoryBuildContext.clinicId ??
              "simulated-clinic-unavailable",
            failedStage: failedStage.stageId,
            rollbackStartedAt: failedStage.completedAt,
            rollbackCompletedAt: transactionResult.completedAt,
            verifiedAt: this.timestamp(),
            ...(this.simulatedRollbackStatus
              ? { rollbackStatus: this.simulatedRollbackStatus }
              : {}),
          })
        : undefined;

    const result: DeploymentExecutionResult = {
      status: failedStage ? "failed" : "succeeded",
      startedAt,
      completedAt,
      durationMs: elapsedMilliseconds(startedAtMs, completedAt),
      completedStages,
      ...(failedStage ? { failedStage } : {}),
      skippedStages,
      warnings,
      messages,
      rollbackRequired,
      ...(rollbackDryRunPayload ? { rollbackDryRunPayload } : {}),
      ...(rollbackRecovery ? { rollbackRecovery } : {}),
      ...(transactionResult ? { transaction: transactionResult } : {}),
      summary: context.summary,
    };

    const lifecycleSummary = simulateDeploymentLifecycle({
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      status: result.status,
      rollbackRequired: result.rollbackRequired,
      rollbackVerified: result.rollbackRecovery?.safeToRetry,
      manualRecoveryRequired:
        result.rollbackRecovery?.verification.manualRecoveryRequired,
      ...(failedStage ? { failedStage: failedStage.stageId } : {}),
      clinicId: context.repositoryBuildContext.clinicId ?? null,
      deploymentRunId:
        context.repositoryBuildContext.deploymentRunId ?? null,
    });
    const resultWithLifecycle: DeploymentExecutionResult = {
      ...result,
      lifecycleSummary,
    };

    return {
      ...resultWithLifecycle,
      auditEvidence: simulateDeploymentAuditEvidence(
        this.draft,
        resultWithLifecycle,
        completedAt,
      ),
    };
  }

  execute(): DeploymentExecutionResult {
    return this.simulate();
  }

  rollback(): DeploymentRollbackResult {
    return {
      status: "succeeded",
      simulated: true,
      rollbackPerformed: false,
      messages: [
        "Simulated rollback completed without changing application or database state.",
      ],
      warnings: [],
    };
  }

  private simulateStage(
    stage: DeploymentStageDefinition,
    context: DeploymentSimulationContext,
  ): DeploymentStageResult {
    const startedAt = this.timestamp();
    const startedAtMs = Date.parse(startedAt);
    let dryRunPayload = createEmptyDryRunPayloadMetadata();

    try {
      dryRunPayload = buildStageDryRunPayload(stage.id, context);
      const idempotencyResult =
        stage.id === DeploymentStage.CREATE_RUN
          ? createSimulatedIdempotencyResult({
              ...context.idempotencyRequest,
              requestedAt: startedAt,
            })
          : null;
      const lockResult =
        stage.id === DeploymentStage.LOCK
          ? createSimulatedDeploymentLock({
              ...context.lockRequest,
              requestedAt: startedAt,
            })
          : null;
      const outcome = this.stageHandlers[stage.id]?.(context);
      const completedAt = this.timestamp();
      const status =
        idempotencyResult?.shouldRejectRequest ||
        lockResult?.status === "failed" ||
        lockResult?.status === "expired"
          ? "failed"
          : (outcome?.status ?? "succeeded");

      return {
        stageId: stage.id,
        stageDisplayName: stage.displayName,
        status,
        startedAt,
        completedAt,
        durationMs: elapsedMilliseconds(startedAtMs, completedAt),
        messages:
          outcome?.messages ??
          (idempotencyResult
            ? [idempotencyResult.message]
            : lockResult
              ? [lockResult.message]
              : status === "succeeded"
                ? [stage.simulationMessage]
              : [`${stage.displayName} simulation failed.`]),
        warnings: outcome?.warnings ?? [],
        dryRunPayload,
        ...(idempotencyResult
          ? {
              idempotency:
                toDeploymentStageIdempotencyMetadata(idempotencyResult),
            }
          : {}),
        ...(lockResult
          ? { lock: toDeploymentStageLockMetadata(lockResult) }
          : {}),
      };
    } catch (error) {
      const completedAt = this.timestamp();

      return {
        stageId: stage.id,
        stageDisplayName: stage.displayName,
        status: "failed",
        startedAt,
        completedAt,
        durationMs: elapsedMilliseconds(startedAtMs, completedAt),
        messages: [
          error instanceof Error
            ? `${stage.displayName} simulation threw: ${error.message}`
            : `${stage.displayName} simulation threw an unexpected error.`,
        ],
        warnings: [],
        dryRunPayload,
      };
    }
  }

  private createSkippedStage(
    stage: DeploymentStageDefinition,
    timestamp: string,
    message: string,
  ): DeploymentStageResult {
    return {
      stageId: stage.id,
      stageDisplayName: stage.displayName,
      status: "skipped",
      startedAt: timestamp,
      completedAt: timestamp,
      durationMs: 0,
      messages: [message],
      warnings: [],
      dryRunPayload: createEmptyDryRunPayloadMetadata(
        "No repository payload was generated because this stage was skipped.",
      ),
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private withTransactionMetadata(
    result: DeploymentStageResult,
    transaction: DeploymentTransactionResult,
    checkpointId = result.transaction?.checkpointId,
  ): DeploymentStageResult {
    const metadata: DeploymentStageTransactionMetadata = {
      transactionId: transaction.transactionId,
      ...(checkpointId ? { checkpointId } : {}),
      transactionStatus: transaction.status,
      rollbackCheckpointCount: transaction.rollbackCheckpointCount,
    };

    return {
      ...result,
      transaction: metadata,
    };
  }
}

export function createSimulatedDeploymentEngine(
  draft: DeploymentDraft,
  options: DeploymentEngineOptions = {},
): DeploymentEngine {
  return new DeploymentEngine(draft, options);
}

export function simulateDeployment(
  draft: DeploymentDraft,
  options: DeploymentEngineOptions = {},
): DeploymentExecutionResult {
  return createSimulatedDeploymentEngine(draft, options).simulate();
}

function elapsedMilliseconds(startedAtMs: number, completedAt: string) {
  return Math.max(0, Date.parse(completedAt) - startedAtMs);
}
