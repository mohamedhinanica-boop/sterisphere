import type { DeploymentActivationExecutorResult } from "./deployment-activation-executor-types";
import type {
  DeploymentExecutionStepOrchestratorRunners,
  DeploymentExecutionStepRunnerInput,
} from "./deployment-execution-step-orchestrator-runners";
import type {
  DeploymentExecutionStepCompletionStatus,
  DeploymentExecutionStepNextStartStatus,
  DeploymentExecutionStepOrchestratorContext,
  DeploymentExecutionStepOrchestratorDownstream,
  DeploymentExecutionStepOrchestratorIssue,
  DeploymentExecutionStepOrchestratorItem,
  DeploymentExecutionStepOrchestratorResult,
  DeploymentExecutionStepOrchestratorStage,
  DeploymentExecutionStepOrchestratorStageResult,
  DeploymentExecutionStepOrchestratorStatus,
  DeploymentExecutionStepProgressionStatus,
} from "./deployment-execution-step-orchestrator-types";

const STAGES: readonly DeploymentExecutionStepOrchestratorStage[] = ["entity_execution", "item_completion", "dependency_progression", "next_item_start"];
const ENTITY_SAFE = new Set(["handled", "already_applied"]);
const COMPLETION_SAFE = new Set(["completed", "already_completed"]);
const PROGRESSION_SAFE = new Set(["progressed", "already_progressed", "no_dependencies"]);
const NEXT_SAFE = new Set(["started", "already_started", "no_runnable_item", "plan_complete"]);
const ENTITY_STATUSES = new Set(["handled", "already_applied", "blocked", "conflict", "not_found", "unsupported", "error"]);
const COMPLETION_STATUSES = new Set(["completed", "already_completed", "blocked", "conflict", "not_found", "error"]);
const PROGRESSION_STATUSES = new Set(["progressed", "already_progressed", "no_dependencies", "blocked", "conflict", "not_found", "error"]);
const NEXT_STATUSES = new Set(["started", "already_started", "no_runnable_item", "plan_complete", "blocked", "conflict", "not_found", "error"]);

export class DeploymentExecutionStepOrchestratorService {
  constructor(private readonly runners: DeploymentExecutionStepOrchestratorRunners) {}

  async execute(input: { context: DeploymentExecutionStepOrchestratorContext; item: DeploymentExecutionStepOrchestratorItem }): Promise<DeploymentExecutionStepOrchestratorResult> {
    const context = clone(input.context);
    const item = clone(input.item);
    const lifecycleIssues = validateLifecycle(item);
    if (lifecycleIssues.length) return result(input, "blocked", "entity_execution", [], null, null, null, null, lifecycleIssues);

    const runnerInput = frozenInput(context, item);
    const entity = await this.runEntity(runnerInput);
    if (!ENTITY_SAFE.has(entity.status)) return result(input, overallStatus(entity.status), "entity_execution", [], entity, null, null, null, entityIssues(entity));

    const completion = await this.runStage("item_completion", this.runners.itemCompletion.runnerId, context.ownershipToken, COMPLETION_STATUSES, () => this.runners.itemCompletion.completeItem(runnerInput));
    if (!COMPLETION_SAFE.has(completion.status)) return result(input, overallStatus(completion.status), "item_completion", ["entity_execution"], entity, completion as CompletionResult, null, null, completion.issues);

    const progression = await this.runStage("dependency_progression", this.runners.dependencyProgression.runnerId, context.ownershipToken, PROGRESSION_STATUSES, () => this.runners.dependencyProgression.progressDependencies(runnerInput));
    if (!PROGRESSION_SAFE.has(progression.status)) return result(input, overallStatus(progression.status), "dependency_progression", ["entity_execution", "item_completion"], entity, completion as CompletionResult, progression as ProgressionResult, null, progression.issues);

    const nextStart = await this.runStage("next_item_start", this.runners.nextItemStart.runnerId, context.ownershipToken, NEXT_STATUSES, () => this.runners.nextItemStart.startNextItem(runnerInput));
    if (!NEXT_SAFE.has(nextStart.status)) return result(input, overallStatus(nextStart.status), "next_item_start", ["entity_execution", "item_completion", "dependency_progression"], entity, completion as CompletionResult, progression as ProgressionResult, nextStart as NextResult, nextStart.issues);

    return result(input, "completed_step", "next_item_start", STAGES, entity, completion as CompletionResult, progression as ProgressionResult, nextStart as NextResult, []);
  }

  private async runEntity(input: DeploymentExecutionStepRunnerInput): Promise<DeploymentActivationExecutorResult> {
    try {
      const value = await this.runners.entityExecution.executeEntity(input);
      if (!value || !ENTITY_STATUSES.has(String(value.status))) return malformedEntity(this.runners.entityExecution.runnerId);
      return sanitize(value, input.context.ownershipToken);
    } catch (caught) {
      return malformedEntity(this.runners.entityExecution.runnerId, safeError(caught, input.context.ownershipToken));
    }
  }

  private async runStage<T extends string>(stage: DeploymentExecutionStepOrchestratorStage, runnerId: string, token: string, allowed: ReadonlySet<string>, invoke: () => Promise<DeploymentExecutionStepOrchestratorStageResult<T>> | DeploymentExecutionStepOrchestratorStageResult<T>): Promise<DeploymentExecutionStepOrchestratorStageResult<T | "error">> {
    try {
      const value = await invoke();
      if (!value || !allowed.has(String(value.status))) return stageError(stage, runnerId, "malformed_runner_result", "Runner returned an unknown or malformed status.");
      return sanitize(normalizeStage(value, stage, runnerId), token);
    } catch (caught) {
      return stageError(stage, runnerId, "runner_threw", safeError(caught, token));
    }
  }
}

export function createDeploymentExecutionStepOrchestratorService(runners: DeploymentExecutionStepOrchestratorRunners): DeploymentExecutionStepOrchestratorService { return new DeploymentExecutionStepOrchestratorService(runners); }

type CompletionResult = DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus>;
type ProgressionResult = DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus>;
type NextResult = DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus>;

function validateLifecycle(item: DeploymentExecutionStepOrchestratorItem): DeploymentExecutionStepOrchestratorIssue[] {
  const issues: DeploymentExecutionStepOrchestratorIssue[] = [];
  const add = (condition: boolean, code: string, message: string) => { if (condition) issues.push(issue(code, "entity_execution", message)); };
  add(item.executionStatus !== "running", "item_not_running", "Orchestration requires one already-running execution item.");
  add(item.attemptCount !== 1, "attempt_count_invalid", "Orchestration requires exactly one item attempt.");
  add(!item.startedAt || !Number.isFinite(Date.parse(item.startedAt)), "started_at_missing", "Orchestration requires valid started-at evidence.");
  add(item.completedAt !== null, "completion_evidence_present", "Completed items cannot be orchestrated again.");
  add(item.rolledBackAt !== null, "rollback_evidence_present", "Rolled-back items cannot be orchestrated.");
  add(item.errorCode !== null, "item_error_code_present", "Items with error-code evidence cannot be orchestrated.");
  add(item.errorMessage !== null, "item_error_message_present", "Items with error-message evidence cannot be orchestrated.");
  return issues.sort(compareIssue);
}

function result(input: { context: DeploymentExecutionStepOrchestratorContext; item: DeploymentExecutionStepOrchestratorItem }, status: DeploymentExecutionStepOrchestratorStatus, stoppedAtStage: DeploymentExecutionStepOrchestratorStage, completedStages: readonly DeploymentExecutionStepOrchestratorStage[], entityExecution: DeploymentActivationExecutorResult | null, itemCompletion: CompletionResult | null, dependencyProgression: ProgressionResult | null, nextItemStart: NextResult | null, stageIssues: readonly DeploymentExecutionStepOrchestratorIssue[]): DeploymentExecutionStepOrchestratorResult {
  const token = input.context.ownershipToken;
  const issues = sanitize([...stageIssues].sort(compareIssue), token);
  const downstream = counters(entityExecution, itemCompletion, dependencyProgression, nextItemStart);
  return sanitize({ ok: status === "completed_step", status, message: status === "completed_step" ? "Execution step completed all four permitted stages safely." : `Execution step stopped safely at ${stoppedAtStage}.`, claimantId: input.context.claimantId || null, clinicId: input.item.clinicId, deploymentRunKey: input.item.deploymentRunKey, sessionId: input.item.sessionId, executionKey: input.item.executionKey, planKey: input.item.planKey, itemId: input.item.itemId, executionItemKey: input.item.executionItemKey, planItemKey: input.item.planItemKey, sequence: input.item.sequence, entityType: input.item.entityType, entityId: input.item.entityId, deploymentKey: input.item.deploymentKey, action: input.item.action, stoppedAtStage, completedStages: [...completedStages], entityExecution, itemCompletion, dependencyProgression, nextItemStart, issues, blockers: issues.filter((current) => current.severity === "blocker").length, conflicts: status === "conflict" ? Math.max(1, issues.filter((current) => current.severity === "blocker").length) : 0, warnings: issues.filter((current) => current.severity === "warning").length, downstream }, token);
}

function counters(entity: DeploymentActivationExecutorResult | null, completion: CompletionResult | null, progression: ProgressionResult | null, next: NextResult | null): DeploymentExecutionStepOrchestratorDownstream { return { entitiesActivated: entity?.status === "handled" ? 1 : 0, itemsCompleted: completion?.status === "completed" ? 1 : 0, dependenciesProgressed: progression?.status === "progressed" ? 1 : 0, itemsStarted: next?.status === "started" ? 1 : 0, bindingsWritten: 0, assignmentsFinalized: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 }; }
function overallStatus(status: string): DeploymentExecutionStepOrchestratorStatus { return status === "blocked" ? "blocked" : status === "conflict" ? "conflict" : status === "not_found" ? "not_found" : status === "unsupported" ? "unsupported" : "error"; }
function entityIssues(value: DeploymentActivationExecutorResult): DeploymentExecutionStepOrchestratorIssue[] { return value.issues.map((current): DeploymentExecutionStepOrchestratorIssue => ({ code: current.code, severity: current.severity, stage: "entity_execution", message: current.message, diagnostics: current.diagnostics ?? null })).sort(compareIssue); }
function malformedEntity(runnerId: string, message = "Entity runner returned an unknown or malformed status."): DeploymentActivationExecutorResult { return { ok: false, status: "error", message, dispatchKey: "", claimantId: null, clinicId: null, deploymentRunKey: null, sessionId: null, executionKey: null, itemId: null, executionItemKey: null, planItemKey: null, sequence: null, entityType: null, entityId: null, deploymentKey: null, action: null, handlerId: runnerId, handledCount: 0, reusedCount: 0, unsupportedCount: 0, conflicts: 0, blockers: 1, warnings: 0, issues: [{ code: "handler_error", severity: "blocker", message, dispatchKey: null, handlerId: runnerId, sessionId: null, executionKey: null, executionItemKey: null, planItemKey: null, sequence: null }], handlerEvidence: null, downstream: { entitiesActivated: 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0, bindingsWritten: 0, assignmentsFinalized: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 } }; }
function normalizeStage<T extends string>(value: DeploymentExecutionStepOrchestratorStageResult<T>, stage: DeploymentExecutionStepOrchestratorStage, runnerId: string): DeploymentExecutionStepOrchestratorStageResult<T> { return { ok: value.ok, status: value.status, message: value.message, runnerId, issues: [...(value.issues ?? [])].map((current) => ({ ...current, stage })).sort(compareIssue), diagnostics: value.diagnostics ?? null }; }
function stageError(stage: DeploymentExecutionStepOrchestratorStage, runnerId: string, code: string, message: string): DeploymentExecutionStepOrchestratorStageResult<"error"> { const current = issue(code, stage, message); return { ok: false, status: "error", message, runnerId, issues: [current], diagnostics: null }; }
function issue(code: string, stage: DeploymentExecutionStepOrchestratorStage, message: string): DeploymentExecutionStepOrchestratorIssue { return { code, severity: "blocker", stage, message, diagnostics: null }; }
function compareIssue(left: DeploymentExecutionStepOrchestratorIssue, right: DeploymentExecutionStepOrchestratorIssue): number { return STAGES.indexOf(left.stage) - STAGES.indexOf(right.stage) || left.severity.localeCompare(right.severity) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message); }
function frozenInput(context: DeploymentExecutionStepOrchestratorContext, item: DeploymentExecutionStepOrchestratorItem): DeploymentExecutionStepRunnerInput { return Object.freeze({ context: Object.freeze(clone(context)), item: Object.freeze(clone(item)) }); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function sanitize<T>(value: T, token: string): T { return sanitizeValue(value, token) as T; }
function sanitizeValue(value: unknown, token: string): unknown { if (typeof value === "string") return token ? value.split(token).join("[redacted]") : value; if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, token)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, key.toLowerCase().includes("token") ? "[redacted]" : sanitizeValue(entry, token)])); return value; }
function safeError(caught: unknown, token: string): string { const message = caught instanceof Error ? caught.message : "Runner failed safely."; return token ? message.split(token).join("[redacted]") : message; }
