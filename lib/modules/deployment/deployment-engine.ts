import {
  hashDeploymentDraftInput,
  summarizeDeploymentDraft,
  type DeploymentDraft,
} from "./deployment-draft";
import { validateDeploymentDraft } from "./deployment-draft-validation";
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

  constructor(
    private readonly draft: DeploymentDraft,
    options: DeploymentSimulationOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.stageHandlers = options.stageHandlers ?? {};
  }

  validate() {
    return validateDeploymentDraft(this.draft);
  }

  prepare(): DeploymentSimulationContext {
    return {
      draft: this.draft,
      payloadHash: hashDeploymentDraftInput(this.draft),
      preparedAt: this.timestamp(),
      summary: summarizeDeploymentDraft(this.draft),
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

    try {
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
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

export function createSimulatedDeploymentEngine(
  draft: DeploymentDraft,
  options: DeploymentSimulationOptions = {},
): DeploymentEngine {
  return new DeploymentEngine(draft, options);
}

export function simulateDeployment(
  draft: DeploymentDraft,
  options: DeploymentSimulationOptions = {},
): DeploymentExecutionResult {
  return createSimulatedDeploymentEngine(draft, options).simulate();
}

function elapsedMilliseconds(startedAtMs: number, completedAt: string) {
  return Math.max(0, Date.parse(completedAt) - startedAtMs);
}
