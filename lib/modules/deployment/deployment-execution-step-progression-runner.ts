import "server-only";

import { mapped, type ServerDeploymentExecutionStepBoundaryIssue } from "./deployment-execution-step-completion-runner";
import type { DeploymentExecutionStepDependencyProgressionRunner, DeploymentExecutionStepDependencyProgressionRunnerInput } from "./deployment-execution-step-orchestrator-runners";
import type { DeploymentExecutionStepOrchestratorStageResult, DeploymentExecutionStepProgressionStatus } from "./deployment-execution-step-orchestrator-types";

export interface ServerDeploymentExecutionStepProgressionBoundaryResult { status: DeploymentExecutionStepProgressionStatus | "not_attempted" | string; message: string; issues?: readonly ServerDeploymentExecutionStepBoundaryIssue[]; diagnostics?: Record<string, unknown> | null; }
export interface ServerDeploymentExecutionStepProgressionBoundary { progressCurrentItemDependencies(input: DeploymentExecutionStepDependencyProgressionRunnerInput): Promise<ServerDeploymentExecutionStepProgressionBoundaryResult> | ServerDeploymentExecutionStepProgressionBoundaryResult; }
const STATUSES = new Set<DeploymentExecutionStepProgressionStatus>(["progressed", "already_progressed", "no_dependencies", "blocked", "conflict", "not_found", "error"]);
export class ServerDeploymentExecutionStepProgressionRunner implements DeploymentExecutionStepDependencyProgressionRunner {
  readonly runnerId = "server-deployment-execution-step-progression";
  constructor(private readonly boundary: ServerDeploymentExecutionStepProgressionBoundary) {}
  async progressDependencies(input: DeploymentExecutionStepDependencyProgressionRunnerInput): Promise<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus>> {
    const result = await this.boundary.progressCurrentItemDependencies(input);
    const status = STATUSES.has(result.status as DeploymentExecutionStepProgressionStatus) ? result.status as DeploymentExecutionStepProgressionStatus : "error";
    return mapped("dependency_progression", this.runnerId, status, result, status === "error" && result.status !== "error");
  }
}
