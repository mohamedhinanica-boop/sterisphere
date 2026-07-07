import type { DeploymentDraft } from "./deployment-draft";
import type { DeploymentDryRunPayloadMetadata } from "./deployment-dry-run";
import type {
  DeploymentLock,
  DeploymentLockRequest,
  DeploymentStageLockMetadata,
} from "./deployment-lock-types";
import type { DeploymentRepositoryBuildContext } from "./repositories";
import type {
  DeploymentStageTransactionMetadata,
  DeploymentTransactionResult,
} from "./deployment-transaction-types";
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
  lock?: DeploymentStageLockMetadata;
  transaction?: DeploymentStageTransactionMetadata;
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
  transaction?: DeploymentTransactionResult;
  summary: DeploymentSummary;
}

export interface DeploymentSimulationContext {
  draft: DeploymentDraft;
  payloadHash: string;
  preparedAt: string;
  summary: DeploymentSummary;
  repositoryBuildContext: DeploymentRepositoryBuildContext;
  lockRequest: DeploymentLockRequest;
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
  requestedBy?: string | null;
  lockExpiresAt?: string | null;
  lockTtlSeconds?: number;
  simulatedExistingLock?: DeploymentLock | null;
}

export interface DeploymentRollbackResult {
  status: "succeeded";
  simulated: true;
  rollbackPerformed: false;
  messages: readonly string[];
  warnings: readonly string[];
  dryRunPayload?: DeploymentDryRunPayloadMetadata;
}
