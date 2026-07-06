import {
  hashDeploymentDraftInput,
  summarizeDeploymentDraft,
  type DeploymentDraft,
} from "./deployment-draft";
import { validateDeploymentDraft } from "./deployment-draft-validation";
import {
  buildRollbackDryRunPayload,
  buildStageDryRunPayload,
  createEmptyDryRunPayloadMetadata,
} from "./deployment-dry-run";
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

  constructor(
    private readonly draft: DeploymentDraft,
    options: DeploymentEngineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.stageHandlers = options.stageHandlers ?? {};
    this.repository =
      options.repository ?? createDeploymentRepository();
    this.repositoryContext = options.repositoryContext ?? {};
  }

  validate() {
    return validateDeploymentDraft(this.draft);
  }

  prepare(): DeploymentSimulationContext {
    const payloadHash = hashDeploymentDraftInput(this.draft);
    const timestamp =
      this.repositoryContext.timestamp ?? this.timestamp();
    const identifierSuffix = payloadHash.replace(/^draft-/, "");

    return {
      draft: this.draft,
      payloadHash,
      preparedAt: timestamp,
      summary: summarizeDeploymentDraft(this.draft),
      repositoryBuildContext: {
        clinicId:
          this.repositoryContext.clinicId ??
          `simulated-clinic-${identifierSuffix}`,
        deploymentRunId:
          this.repositoryContext.deploymentRunId ??
          `simulated-run-${identifierSuffix}`,
        ...(this.repositoryContext.startedBy
          ? { startedBy: this.repositoryContext.startedBy }
          : {}),
        idempotencyKey:
          this.repositoryContext.idempotencyKey ??
          `simulation-${payloadHash}`,
        timestamp,
        deploymentVersion:
          this.repositoryContext.deploymentVersion ??
          `draft-${this.draft.draftVersion}`,
        schemaVersion:
          this.repositoryContext.schemaVersion ??
          "simulation-schema-v1",
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

      return {
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
    }

    const context = this.prepare();
    const completedStages: DeploymentStageResult[] = [];
    const skippedStages: DeploymentStageResult[] = [];
    const warnings: string[] = [];
    const messages: string[] = [];
    let failedStage: DeploymentStageResult | undefined;

    for (const [index, stage] of DEPLOYMENT_STAGES.entries()) {
      const result = this.simulateStage(stage, context);

      if (result.status === "failed") {
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

      completedStages.push(result);
      warnings.push(...result.warnings);
      messages.push(...result.messages);
    }

    const completedAt = this.timestamp();
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

    return {
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
      summary: context.summary,
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
      const outcome = this.stageHandlers[stage.id]?.(context);
      const completedAt = this.timestamp();
      const status = outcome?.status ?? "succeeded";

      return {
        stageId: stage.id,
        stageDisplayName: stage.displayName,
        status,
        startedAt,
        completedAt,
        durationMs: elapsedMilliseconds(startedAtMs, completedAt),
        messages:
          outcome?.messages ??
          (status === "succeeded"
            ? [stage.simulationMessage]
            : [`${stage.displayName} simulation failed.`]),
        warnings: outcome?.warnings ?? [],
        dryRunPayload,
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
