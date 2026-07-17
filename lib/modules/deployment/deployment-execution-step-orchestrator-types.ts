import type {
  DeploymentActivationExecutorContext,
  DeploymentActivationExecutorItem,
  DeploymentActivationExecutorResult,
} from "./deployment-activation-executor-types";

export type DeploymentExecutionStepOrchestratorContext = Readonly<DeploymentActivationExecutorContext>;
export type DeploymentExecutionStepOrchestratorItem = Readonly<DeploymentActivationExecutorItem>;
export type DeploymentExecutionStepOrchestratorStage =
  | "entity_execution"
  | "item_completion"
  | "dependency_progression"
  | "next_item_start";
export type DeploymentExecutionStepOrchestratorStatus =
  | "completed_step"
  | "blocked"
  | "conflict"
  | "not_found"
  | "unsupported"
  | "error";
export type DeploymentExecutionStepCompletionStatus = "completed" | "already_completed" | "blocked" | "conflict" | "not_found" | "error";
export type DeploymentExecutionStepProgressionStatus = "progressed" | "already_progressed" | "no_dependencies" | "blocked" | "conflict" | "not_found" | "error";
export type DeploymentExecutionStepNextStartStatus = "started" | "already_started" | "no_runnable_item" | "plan_complete" | "blocked" | "conflict" | "not_found" | "error";
export type DeploymentExecutionStepStageStatus = DeploymentActivationExecutorResult["status"] | DeploymentExecutionStepCompletionStatus | DeploymentExecutionStepProgressionStatus | DeploymentExecutionStepNextStartStatus;

export interface DeploymentExecutionStepOrchestratorIssue {
  code: string;
  severity: "blocker" | "warning";
  stage: DeploymentExecutionStepOrchestratorStage;
  message: string;
  diagnostics: Record<string, unknown> | null;
}

export interface DeploymentExecutionStepOrchestratorStageResult<TStatus extends string = string> {
  ok: boolean;
  status: TStatus;
  message: string;
  runnerId: string;
  issues: readonly DeploymentExecutionStepOrchestratorIssue[];
  diagnostics: Record<string, unknown> | null;
}

export interface DeploymentExecutionStepOrchestratorDownstream {
  entitiesActivated: number;
  itemsCompleted: number;
  dependenciesProgressed: number;
  itemsStarted: number;
  bindingsWritten: 0;
  assignmentsFinalized: 0;
  sessionsCompleted: 0;
  deploymentsFinalized: 0;
  rollbacksExecuted: 0;
}

export interface DeploymentExecutionStepOrchestratorResult {
  ok: boolean;
  status: DeploymentExecutionStepOrchestratorStatus;
  message: string;
  claimantId: string | null;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  deploymentKey: string | null;
  action: string | null;
  stoppedAtStage: DeploymentExecutionStepOrchestratorStage;
  completedStages: readonly DeploymentExecutionStepOrchestratorStage[];
  entityExecution: DeploymentActivationExecutorResult | null;
  itemCompletion: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus> | null;
  dependencyProgression: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus> | null;
  nextItemStart: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus> | null;
  issues: readonly DeploymentExecutionStepOrchestratorIssue[];
  blockers: number;
  conflicts: number;
  warnings: number;
  downstream: DeploymentExecutionStepOrchestratorDownstream;
}
