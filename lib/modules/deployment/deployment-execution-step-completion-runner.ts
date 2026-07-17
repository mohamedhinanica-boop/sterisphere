import "server-only";

import type { DeploymentExecutionStepItemCompletionRunner, DeploymentExecutionStepItemCompletionRunnerInput } from "./deployment-execution-step-orchestrator-runners";
import type { DeploymentExecutionStepCompletionStatus, DeploymentExecutionStepOrchestratorIssue, DeploymentExecutionStepOrchestratorStageResult } from "./deployment-execution-step-orchestrator-types";

export interface ServerDeploymentExecutionStepCompletionBoundaryResult {
  status: DeploymentExecutionStepCompletionStatus | "not_attempted" | string;
  message: string;
  issues?: readonly ServerDeploymentExecutionStepBoundaryIssue[];
  diagnostics?: Record<string, unknown> | null;
}
export interface ServerDeploymentExecutionStepCompletionBoundary { completeCurrentItem(input: DeploymentExecutionStepItemCompletionRunnerInput): Promise<ServerDeploymentExecutionStepCompletionBoundaryResult> | ServerDeploymentExecutionStepCompletionBoundaryResult; }
export interface ServerDeploymentExecutionStepBoundaryIssue { code: string; severity: "blocker" | "warning"; message: string; diagnostics?: Record<string, unknown> | null; }

const STATUSES = new Set<DeploymentExecutionStepCompletionStatus>(["completed", "already_completed", "blocked", "conflict", "not_found", "error"]);
export class ServerDeploymentExecutionStepCompletionRunner implements DeploymentExecutionStepItemCompletionRunner {
  readonly runnerId = "server-deployment-execution-step-completion";
  constructor(private readonly boundary: ServerDeploymentExecutionStepCompletionBoundary) {}
  async completeItem(input: DeploymentExecutionStepItemCompletionRunnerInput): Promise<DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus>> {
    const result = await this.boundary.completeCurrentItem(input);
    const status = STATUSES.has(result.status as DeploymentExecutionStepCompletionStatus) ? result.status as DeploymentExecutionStepCompletionStatus : "error";
    return mapped("item_completion", this.runnerId, status, result, status === "error" && result.status !== "error");
  }
}

export function mapped<T extends string>(stage: "item_completion" | "dependency_progression" | "next_item_start", runnerId: string, status: T, result: { status: string; message: string; issues?: readonly ServerDeploymentExecutionStepBoundaryIssue[]; diagnostics?: Record<string, unknown> | null }, malformed: boolean): DeploymentExecutionStepOrchestratorStageResult<T> {
  const issues: DeploymentExecutionStepOrchestratorIssue[] = malformed
    ? [{ code: "malformed_production_status", severity: "blocker", stage, message: "Production boundary returned an unknown or malformed status.", diagnostics: null }]
    : (result.issues ?? []).map((issue) => ({ ...issue, stage, diagnostics: issue.diagnostics ?? null }));
  return { ok: !malformed && !["blocked", "conflict", "not_found", "error"].includes(status), status, message: malformed ? "Production boundary returned an unknown or malformed status." : result.message, runnerId, issues, diagnostics: result.diagnostics ?? null };
}
