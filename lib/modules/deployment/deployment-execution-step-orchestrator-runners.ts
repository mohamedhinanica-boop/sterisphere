import type { DeploymentActivationExecutorResult } from "./deployment-activation-executor-types";
import type {
  DeploymentExecutionStepCompletionStatus,
  DeploymentExecutionStepNextStartStatus,
  DeploymentExecutionStepOrchestratorContext,
  DeploymentExecutionStepOrchestratorItem,
  DeploymentExecutionStepOrchestratorStageResult,
  DeploymentExecutionStepProgressionStatus,
} from "./deployment-execution-step-orchestrator-types";

export interface DeploymentExecutionStepRunnerInput {
  context: DeploymentExecutionStepOrchestratorContext;
  item: DeploymentExecutionStepOrchestratorItem;
}

export interface DeploymentExecutionStepEntityRunner {
  readonly runnerId: string;
  executeEntity(input: DeploymentExecutionStepRunnerInput): Promise<DeploymentActivationExecutorResult> | DeploymentActivationExecutorResult;
}

export interface DeploymentExecutionStepItemCompletionRunner {
  readonly runnerId: string;
  completeItem(input: DeploymentExecutionStepRunnerInput): Promise<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus>> | DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus>;
}

export interface DeploymentExecutionStepDependencyProgressionRunner {
  readonly runnerId: string;
  progressDependencies(input: DeploymentExecutionStepRunnerInput): Promise<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus>> | DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus>;
}

export interface DeploymentExecutionStepNextItemStartRunner {
  readonly runnerId: string;
  startNextItem(input: DeploymentExecutionStepRunnerInput): Promise<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus>> | DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus>;
}

export interface DeploymentExecutionStepOrchestratorRunners {
  entityExecution: DeploymentExecutionStepEntityRunner;
  itemCompletion: DeploymentExecutionStepItemCompletionRunner;
  dependencyProgression: DeploymentExecutionStepDependencyProgressionRunner;
  nextItemStart: DeploymentExecutionStepNextItemStartRunner;
}
