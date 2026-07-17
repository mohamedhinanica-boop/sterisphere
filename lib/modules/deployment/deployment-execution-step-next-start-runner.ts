import "server-only";

import { mapped, type ServerDeploymentExecutionStepBoundaryIssue } from "./deployment-execution-step-completion-runner";
import type { DeploymentExecutionStepNextItemStartRunner, DeploymentExecutionStepNextItemStartRunnerInput } from "./deployment-execution-step-orchestrator-runners";
import type { DeploymentExecutionStepNextStartStatus, DeploymentExecutionStepOrchestratorStageResult } from "./deployment-execution-step-orchestrator-types";

export interface ServerDeploymentExecutionStepNextStartBoundaryResult { status: DeploymentExecutionStepNextStartStatus | "not_attempted" | string; message: string; issues?: readonly ServerDeploymentExecutionStepBoundaryIssue[]; diagnostics?: Record<string, unknown> | null; }
export interface ServerDeploymentExecutionStepNextStartBoundary { startAtMostOneNextItem(input: DeploymentExecutionStepNextItemStartRunnerInput): Promise<ServerDeploymentExecutionStepNextStartBoundaryResult> | ServerDeploymentExecutionStepNextStartBoundaryResult; }
const STATUSES = new Set<DeploymentExecutionStepNextStartStatus>(["started", "already_started", "no_runnable_item", "plan_complete", "blocked", "conflict", "not_found", "error"]);
export class ServerDeploymentExecutionStepNextStartRunner implements DeploymentExecutionStepNextItemStartRunner {
  readonly runnerId = "server-deployment-execution-step-next-start";
  constructor(private readonly boundary: ServerDeploymentExecutionStepNextStartBoundary) {}
  async startNextItem(input: DeploymentExecutionStepNextItemStartRunnerInput): Promise<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus>> {
    const result = await this.boundary.startAtMostOneNextItem(input);
    const status = STATUSES.has(result.status as DeploymentExecutionStepNextStartStatus) ? result.status as DeploymentExecutionStepNextStartStatus : "error";
    return mapped("next_item_start", this.runnerId, status, result, status === "error" && result.status !== "error");
  }
}
