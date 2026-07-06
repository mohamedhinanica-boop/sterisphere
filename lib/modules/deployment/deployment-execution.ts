import type { DeploymentDraft } from "./deployment-draft";
import type { DeploymentDryRunPayloadMetadata } from "./deployment-dry-run";
import type { DeploymentRepositoryBuildContext } from "./repositories";
import type {
  DeploymentStage,
  DeploymentSummary,
} from "./deployment-types";

export type DeploymentStageExecutionStatus =
  | "succeeded"
  | "failed"
  | "skipped";

export interface DeploymentStageResult {
  stageId: DeploymentStage;
  stageDisplayName: string;
  status: DeploymentStageExecutionStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  messages: readonly string[];
  warnings: readonly string[];
  dryRunPayload?: DeploymentDryRunPayloadMetadata;
}

export interface DeploymentExecutionResult {
  status: "succeeded" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  completedStages: readonly DeploymentStageResult[];
  failedStage?: DeploymentStageResult;
  skippedStages: readonly DeploymentStageResult[];
  warnings: readonly string[];
  messages: readonly string[];
  rollbackRequired: boolean;
  rollbackDryRunPayload?: DeploymentDryRunPayloadMetadata;
  summary: DeploymentSummary;
}

export interface DeploymentSimulationContext {
  draft: DeploymentDraft;
  payloadHash: string;
  preparedAt: string;
  summary: DeploymentSummary;
  repositoryBuildContext: DeploymentRepositoryBuildContext;
}

export interface DeploymentStageSimulationOutcome {
  status?: "succeeded" | "failed";
  messages?: readonly string[];
  warnings?: readonly string[];
}

export type DeploymentStageSimulationHandler = (
  context: DeploymentSimulationContext,
) => DeploymentStageSimulationOutcome | void;

export interface DeploymentSimulationOptions {
  now?: () => Date;
  stageHandlers?: Partial<
    Record<DeploymentStage, DeploymentStageSimulationHandler>
  >;
}

export interface DeploymentRollbackResult {
  status: "succeeded";
  simulated: true;
  rollbackPerformed: false;
  messages: readonly string[];
  warnings: readonly string[];
  dryRunPayload?: DeploymentDryRunPayloadMetadata;
}
