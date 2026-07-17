import type { DeploymentActivationExecutorResult, DeploymentActivationExecutorStatus } from "./deployment-activation-executor-types";
import { createDeploymentExecutionStepOrchestratorService } from "./deployment-execution-step-orchestrator-service";
import { TestDeploymentExecutionStepDependencyProgressionRunner, TestDeploymentExecutionStepEntityRunner, TestDeploymentExecutionStepItemCompletionRunner, TestDeploymentExecutionStepNextItemStartRunner } from "./deployment-execution-step-orchestrator-test-runners";
import type { DeploymentExecutionStepCompletionStatus, DeploymentExecutionStepNextStartStatus, DeploymentExecutionStepOrchestratorContext, DeploymentExecutionStepOrchestratorItem, DeploymentExecutionStepOrchestratorResult, DeploymentExecutionStepOrchestratorStageResult, DeploymentExecutionStepProgressionStatus } from "./deployment-execution-step-orchestrator-types";

export interface DeploymentExecutionStepOrchestratorHarnessScenario { name: string; passed: boolean; message: string }
export interface DeploymentExecutionStepOrchestratorHarnessResult { passed: boolean; scenarios: readonly DeploymentExecutionStepOrchestratorHarnessScenario[] }
const TOKEN = "sensitive-orchestrator-token";

export async function runDeploymentExecutionStepOrchestratorHarness(): Promise<DeploymentExecutionStepOrchestratorHarnessResult> {
  const scenarios = [
    await fullSequenceScenario(),
    ...(await entityGateScenarios()),
    ...(await completionGateScenarios()),
    ...(await progressionGateScenarios()),
    ...(await nextStartScenarios()),
    ...(await lifecycleScenarios()),
    await immutabilityScenario(),
    await tokenForwardingAndRedactionScenario(),
    await returnedEvidenceRedactionScenario(),
    ...(await thrownErrorScenarios()),
    await deterministicIssueOrderingScenario(),
    ...(await counterScenarios()),
    ...(await malformedScenarios()),
    runnerSurfaceScenario(),
    orchestratorSurfaceScenario(),
  ];
  return { passed: scenarios.every((current) => current.passed), scenarios };
}

async function fullSequenceScenario() {
  const harness = createHarness();
  const result = await execute(harness);
  return scenario("valid running item executes four stages in deterministic order", result.ok && result.status === "completed_step" && harness.order.join(",") === "entity_execution,item_completion,dependency_progression,next_item_start" && result.completedStages.join(",") === harness.order.join(",") && counts(harness).every((count) => count === 1), JSON.stringify(result.completedStages));
}

async function entityGateScenarios() {
  const cases: Array<[DeploymentActivationExecutorStatus, boolean]> = [["handled", true], ["already_applied", true], ["blocked", false], ["conflict", false], ["not_found", false], ["unsupported", false], ["error", false]];
  return Promise.all(cases.map(async ([status, continues]) => {
    const harness = createHarness({ entity: entityResult(status) });
    const result = await execute(harness);
    return scenario(`entity ${status} ${continues ? "continues" : "stops"} deterministically`, continues ? harness.completion.invocationCount === 1 : harness.completion.invocationCount === 0 && result.status === status, JSON.stringify(counts(harness)));
  }));
}

async function completionGateScenarios() {
  const cases: Array<[DeploymentExecutionStepCompletionStatus, boolean]> = [["completed", true], ["already_completed", true], ["blocked", false], ["conflict", false], ["not_found", false], ["error", false]];
  return Promise.all(cases.map(async ([status, continues]) => {
    const harness = createHarness({ completion: stageResult("item_completion", status, continues) });
    const result = await execute(harness);
    return scenario(`completion ${status} ${continues ? "continues" : "stops"} deterministically`, continues ? harness.progression.invocationCount === 1 : harness.progression.invocationCount === 0 && result.status === status, JSON.stringify(counts(harness)));
  }));
}

async function progressionGateScenarios() {
  const safe = new Set(["progressed", "already_progressed", "no_dependencies"]);
  const statuses: DeploymentExecutionStepProgressionStatus[] = ["progressed", "already_progressed", "no_dependencies", "blocked", "conflict", "not_found", "error"];
  return Promise.all(statuses.map(async (status) => {
    const continues = safe.has(status);
    const harness = createHarness({ progression: stageResult("dependency_progression", status, continues) });
    const result = await execute(harness);
    return scenario(`progression ${status} ${continues ? "continues" : "stops"} deterministically`, continues ? harness.next.invocationCount === 1 : harness.next.invocationCount === 0 && result.status === status, JSON.stringify(counts(harness)));
  }));
}

async function nextStartScenarios() {
  const safe = new Set(["started", "already_started", "no_runnable_item", "plan_complete"]);
  const statuses: DeploymentExecutionStepNextStartStatus[] = ["started", "already_started", "no_runnable_item", "plan_complete", "blocked", "conflict", "not_found", "error"];
  return Promise.all(statuses.map(async (status) => {
    const harness = createHarness({ next: stageResult("next_item_start", status, safe.has(status)) });
    const result = await execute(harness);
    const passed = safe.has(status) ? result.status === "completed_step" && result.downstream.sessionsCompleted === 0 && result.downstream.deploymentsFinalized === 0 : result.status === status;
    return scenario(`next item ${status} maps without finalization`, passed, JSON.stringify(result.downstream));
  }));
}

async function lifecycleScenarios() {
  const cases: Array<[string, Partial<DeploymentExecutionStepOrchestratorItem>]> = [["non-running", { executionStatus: "ready" }], ["attempt zero", { attemptCount: 0 }], ["attempt greater than one", { attemptCount: 2 }], ["missing startedAt", { startedAt: null }], ["completed", { completedAt: "2026-01-01T12:07:00.000Z" }], ["rolled back", { rolledBackAt: "2026-01-01T12:07:00.000Z" }], ["errorCode", { errorCode: "failed" }], ["errorMessage", { errorMessage: "failed" }]];
  return Promise.all(cases.map(async ([name, override]) => {
    const harness = createHarness();
    const result = await execute(harness, item(override));
    return scenario(`${name} is blocked before entity execution`, result.status === "blocked" && counts(harness).every((count) => count === 0), JSON.stringify(result.issues));
  }));
}

async function immutabilityScenario() {
  const harness = createHarness(); const sourceItem = item(); const sourceContext = context(); const before = JSON.stringify({ sourceItem, sourceContext });
  const result = await execute(harness, sourceItem, sourceContext);
  const captured = harness.entity.inputs[0];
  if (captured?.item.expectedCurrentState) captured.item.expectedCurrentState.active = true;
  if (captured?.item.targetState) captured.item.targetState.active = false;
  return scenario("context item state arrays and runner results remain immutable", before === JSON.stringify({ sourceItem, sourceContext }) && sourceItem.expectedCurrentState?.active === false && sourceItem.targetState?.active === true && sourceItem.dependencyKeys[0] === "clinic" && result.entityExecution?.status === "handled", "sources checked");
}

async function tokenForwardingAndRedactionScenario() {
  const harness = createHarness(); const result = await execute(harness);
  const forwarded = [harness.entity, harness.completion, harness.progression, harness.next].every((runner) => runner.inputs[0]?.context.ownershipToken === TOKEN);
  return scenario("ownership token is forwarded internally and absent from serialized result", forwarded && !JSON.stringify(result).includes(TOKEN), "forwarding checked");
}

async function returnedEvidenceRedactionScenario() {
  const harness = createHarness({ completion: stageResult("item_completion", "blocked", false, `blocked ${TOKEN}`, { nestedToken: TOKEN, safe: "kept" }) });
  const result = await execute(harness);
  return scenario("returned messages diagnostics and token-like fields are redacted", !JSON.stringify(result).includes(TOKEN) && JSON.stringify(result).includes("[redacted]") && result.itemCompletion?.diagnostics?.safe === "kept", JSON.stringify(result.itemCompletion));
}

async function thrownErrorScenarios() {
  const stages = ["entity", "completion", "progression", "next"] as const;
  return Promise.all(stages.map(async (stage) => {
    const harness = createHarness(); harness[stage].throwError = new Error(`thrown ${TOKEN}`); const result = await execute(harness);
    const expectedCalls = stage === "entity" ? [1,0,0,0] : stage === "completion" ? [1,1,0,0] : stage === "progression" ? [1,1,1,0] : [1,1,1,1];
    return scenario(`${stage} thrown error is redacted and never retried`, result.status === "error" && !JSON.stringify(result).includes(TOKEN) && counts(harness).join(",") === expectedCalls.join(","), JSON.stringify(counts(harness)));
  }));
}

async function deterministicIssueOrderingScenario() {
  const harness = createHarness(); const result = await execute(harness, item({ executionStatus: "ready", attemptCount: 0, startedAt: null, completedAt: "bad" }));
  const codes = result.issues.map((current) => current.code);
  return scenario("issues and completed stages use deterministic ordering", codes.join(",") === [...codes].sort().join(",") && result.completedStages.length === 0, codes.join(","));
}

async function counterScenarios() {
  const cases: Array<[string, Partial<HarnessResults>, keyof DeploymentExecutionStepOrchestratorResult["downstream"], number]> = [
    ["handled", { entity: entityResult("handled") }, "entitiesActivated", 1], ["already_applied", { entity: entityResult("already_applied") }, "entitiesActivated", 0],
    ["completed", { completion: stageResult("item_completion", "completed", true) }, "itemsCompleted", 1], ["already_completed", { completion: stageResult("item_completion", "already_completed", true) }, "itemsCompleted", 0],
    ["progressed", { progression: stageResult("dependency_progression", "progressed", true) }, "dependenciesProgressed", 1], ["already_progressed", { progression: stageResult("dependency_progression", "already_progressed", true) }, "dependenciesProgressed", 0], ["no_dependencies", { progression: stageResult("dependency_progression", "no_dependencies", true) }, "dependenciesProgressed", 0],
    ["started", { next: stageResult("next_item_start", "started", true) }, "itemsStarted", 1], ["already_started", { next: stageResult("next_item_start", "already_started", true) }, "itemsStarted", 0], ["no_runnable_item", { next: stageResult("next_item_start", "no_runnable_item", true) }, "itemsStarted", 0], ["plan_complete", { next: stageResult("next_item_start", "plan_complete", true) }, "itemsStarted", 0],
  ];
  const scenarios = await Promise.all(cases.map(async ([name, configured, key, expected]) => { const result = await execute(createHarness(configured)); return scenario(`${name} derives only ${key} from typed status`, result.downstream[key] === expected, JSON.stringify(result.downstream)); }));
  const zero = await execute(createHarness()); scenarios.push(scenario("forbidden downstream counters remain zero", [zero.downstream.bindingsWritten, zero.downstream.assignmentsFinalized, zero.downstream.sessionsCompleted, zero.downstream.deploymentsFinalized, zero.downstream.rollbacksExecuted].every((value) => value === 0), JSON.stringify(zero.downstream)));
  return scenarios;
}

async function malformedScenarios() {
  const stages = ["entity", "completion", "progression", "next"] as const;
  return Promise.all(stages.map(async (stage) => {
    const harness = createHarness();
    if (stage === "entity") harness.entity.setResult({ ...entityResult("handled"), status: "mystery" } as unknown as DeploymentActivationExecutorResult);
    else if (stage === "completion") harness.completion.setResult({ ...stageResult("item_completion", "completed", true), status: "mystery" } as never);
    else if (stage === "progression") harness.progression.setResult({ ...stageResult("dependency_progression", "progressed", true), status: "mystery" } as never);
    else harness.next.setResult({ ...stageResult("next_item_start", "started", true), status: "mystery" } as never);
    const result = await execute(harness);
    return scenario(`malformed ${stage} result stops with deterministic error`, result.status === "error", result.stoppedAtStage);
  }));
}

function runnerSurfaceScenario() {
  const harness = createHarness(); const forbidden = ["repository", "rpc", "insert", "update", "upsert", "delete", "retry", "rollback", "finalize"];
  return scenario("runner interfaces expose no repository retry or unrelated mutation surface", [harness.entity, harness.completion, harness.progression, harness.next].every((runner) => forbidden.every((name) => !(name in runner))), "runner prototypes checked");
}
function orchestratorSurfaceScenario() {
  const prototype = Object.getPrototypeOf(createDeploymentExecutionStepOrchestratorService(createHarness())) as Record<string, unknown>; const forbidden = ["executePlan", "loop", "retry", "claim", "renew", "rollback", "finalize", "enqueue"];
  return scenario("orchestrator exposes one-step execution and no plan or background surface", forbidden.every((name) => !(name in prototype)), "orchestrator prototype checked");
}

interface HarnessResults { entity: DeploymentActivationExecutorResult; completion: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepCompletionStatus>; progression: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepProgressionStatus>; next: DeploymentExecutionStepOrchestratorStageResult<DeploymentExecutionStepNextStartStatus> }
interface Harness { order: string[]; entity: TestDeploymentExecutionStepEntityRunner; completion: TestDeploymentExecutionStepItemCompletionRunner; progression: TestDeploymentExecutionStepDependencyProgressionRunner; next: TestDeploymentExecutionStepNextItemStartRunner; entityExecution: TestDeploymentExecutionStepEntityRunner; itemCompletion: TestDeploymentExecutionStepItemCompletionRunner; dependencyProgression: TestDeploymentExecutionStepDependencyProgressionRunner; nextItemStart: TestDeploymentExecutionStepNextItemStartRunner }
function createHarness(input: Partial<HarnessResults> = {}): Harness { const order: string[] = []; const entity = new TestDeploymentExecutionStepEntityRunner(input.entity ?? entityResult("handled"), order); const completion = new TestDeploymentExecutionStepItemCompletionRunner(input.completion ?? stageResult("item_completion", "completed", true), order); const progression = new TestDeploymentExecutionStepDependencyProgressionRunner(input.progression ?? stageResult("dependency_progression", "progressed", true), order); const next = new TestDeploymentExecutionStepNextItemStartRunner(input.next ?? stageResult("next_item_start", "started", true), order); return { order, entity, completion, progression, next, entityExecution: entity, itemCompletion: completion, dependencyProgression: progression, nextItemStart: next }; }
async function execute(harness: Harness, sourceItem = item(), sourceContext = context()) { return createDeploymentExecutionStepOrchestratorService(harness).execute({ item: sourceItem, context: sourceContext }); }
function counts(harness: Harness) { return [harness.entity.invocationCount, harness.completion.invocationCount, harness.progression.invocationCount, harness.next.invocationCount]; }
function stageResult<T extends string>(stage: "item_completion" | "dependency_progression" | "next_item_start", status: T, ok: boolean, message = `${stage} ${status}`, diagnostics: Record<string, unknown> | null = null): DeploymentExecutionStepOrchestratorStageResult<T> { return { ok, status, message, runnerId: `configured-${stage}`, issues: ok ? [] : [{ code: `${stage}_${status}`, severity: "blocker", stage, message, diagnostics }], diagnostics }; }
function entityResult(status: DeploymentActivationExecutorStatus): DeploymentActivationExecutorResult { const ok = status === "handled" || status === "already_applied"; return { ok, status, message: `entity ${status}`, dispatchKey: "clinic:activate", claimantId: "orchestrator", clinicId: "clinic-orchestrator", deploymentRunKey: "deployment-run-orchestrator", sessionId: "session-orchestrator", executionKey: "execution-orchestrator", itemId: "item-orchestrator", executionItemKey: "execution-orchestrator:clinic", planItemKey: "plan-orchestrator:clinic", sequence: 1, entityType: "clinic", entityId: "clinic-orchestrator", deploymentKey: "clinic-orchestrator", action: "activate", handlerId: "test-handler", handledCount: status === "handled" ? 1 : 0, reusedCount: status === "already_applied" ? 1 : 0, unsupportedCount: status === "unsupported" ? 1 : 0, conflicts: status === "conflict" ? 1 : 0, blockers: ok ? 0 : 1, warnings: 0, issues: ok ? [] : [{ code: status === "unsupported" ? "unsupported_execution_handler" : status === "conflict" ? "handler_conflict" : status === "not_found" ? "handler_not_found" : status === "error" ? "handler_error" : "handler_blocked", severity: "blocker", message: `entity ${status}`, dispatchKey: "clinic:activate", handlerId: "test-handler", sessionId: "session-orchestrator", executionKey: "execution-orchestrator", executionItemKey: "execution-orchestrator:clinic", planItemKey: "plan-orchestrator:clinic", sequence: 1 }], handlerEvidence: null, downstream: { entitiesActivated: 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0, bindingsWritten: 0, assignmentsFinalized: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 } }; }
function context(): DeploymentExecutionStepOrchestratorContext { return { claimantId: "orchestrator", ownershipToken: TOKEN, leaseExpiresAt: "2026-01-01T12:15:00.000Z", executedAt: "2026-01-01T12:06:00.000Z" }; }
function item(input: Partial<DeploymentExecutionStepOrchestratorItem> = {}): DeploymentExecutionStepOrchestratorItem { return { clinicId: "clinic-orchestrator", deploymentRunKey: "deployment-run-orchestrator", sessionId: "session-orchestrator", executionKey: "execution-orchestrator", planKey: "plan-orchestrator", itemId: "item-orchestrator", executionItemKey: "execution-orchestrator:clinic", planItemKey: "plan-orchestrator:clinic", sequence: 1, entityType: "clinic", entityId: "clinic-orchestrator", deploymentKey: "clinic-orchestrator", action: "activate", executionStatus: "running", attemptCount: 1, startedAt: "2026-01-01T12:05:00.000Z", completedAt: null, rolledBackAt: null, errorCode: null, errorMessage: null, expectedCurrentState: { active: false }, targetState: { active: true }, dependencyKeys: ["clinic"], reversible: false, rollbackBehavior: null, ...input }; }
function scenario(name: string, passed: boolean, message: string): DeploymentExecutionStepOrchestratorHarnessScenario { return { name, passed, message }; }
