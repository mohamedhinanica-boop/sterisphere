import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";
import type { DeploymentHardwareBindingDependencyProgressionResult } from "./deployment-hardware-binding-dependency-progression";
import type { DeploymentHardwareBindingSuccessorStartResult } from "./deployment-hardware-binding-successor-start";
import {
  executeHardwareBindingExecutionStep,
  type DeploymentHardwareBindingExecutionStepBoundaries,
  type DeploymentHardwareBindingExecutionStepInput,
} from "./deployment-hardware-binding-execution-step";

export interface DeploymentHardwareBindingExecutionStepHarnessScenario { name: string; passed: boolean; message: string }
export interface DeploymentHardwareBindingExecutionStepHarnessResult { passed: boolean; scenarios: readonly DeploymentHardwareBindingExecutionStepHarnessScenario[] }

const ID = {
  clinic: "00000000-0000-4000-8000-000000000001",
  hardware: "00000000-0000-4000-8000-000000000002",
  target: "00000000-0000-4000-8000-000000000003",
  item: "00000000-0000-4000-8000-000000000004",
  successorHardware: "00000000-0000-4000-8000-000000000005",
  successorItem: "00000000-0000-4000-8000-000000000006",
};
const TOKEN = "ownership-token-secret";
const TIMES = ["2026-01-01T12:02:00.000Z", "2026-01-01T12:03:00.000Z", "2026-01-01T12:04:00.000Z", "2026-01-01T12:05:00.000Z"];

type Overrides = {
  input?: Partial<DeploymentHardwareBindingExecutionStepInput>;
  running?: Partial<ServerDeploymentActivationExecutionNextItemStartResult>;
  prepared?: Partial<DeploymentActivationExecutionItem>;
  binding?: Partial<DeploymentHardwareBindingExecutionResult>;
  completion?: Partial<DeploymentHardwareBindingItemCompletionResult>;
  progression?: Partial<DeploymentHardwareBindingDependencyProgressionResult>;
  start?: Partial<DeploymentHardwareBindingSuccessorStartResult>;
};

export async function runDeploymentHardwareBindingExecutionStepHarness(): Promise<DeploymentHardwareBindingExecutionStepHarnessResult> {
  const scenarios = [
    await successTarget("new Workstation-target binding", "workstation"),
    await successTarget("new Sterilizer-target binding", "sterilizer"),
    await replay(),
    await stops("binding failure stops later stages", { binding: { ok: false, status: "blocked", issueCode: "binding_failed" } }, "binding"),
    await stops("completion failure stops later stages", { completion: { ok: false, status: "blocked", issueCode: "completion_failed" } }, "binding,completion"),
    await stops("progression failure stops successor start", { progression: { ok: false, status: "blocked", issueCode: "progression_failed" } }, "binding,completion,progression"),
    await terminal(),
    await eligibility("missing running item rejected", { input: { runningItems: [] } }, "running_item_missing"),
    await eligibility("multiple running items rejected", { input: { runningItems: [running(), running({ itemId: ID.successorItem })] } }, "multiple_running_items"),
    await eligibility("wrong running entity type rejected", { running: { entityType: "hardware_shell" } }, "entity_type_invalid"),
    await eligibility("wrong action rejected", { running: { action: "activate" } }, "action_invalid"),
    await eligibility("ownership missing rejected", { input: { ownershipToken: null } }, "ownership_invalid"),
    await eligibility("stale lease rejected", { input: { claim: claim({ leaseExpiresAt: "2026-01-01T12:00:00.000Z" }) } }, "lease_invalid"),
    await failureCode("binding completion identity mismatch rejected", { completion: { itemId: ID.successorItem } }, "completion_response_malformed"),
    await failureCode("completion progression identity mismatch rejected", { progression: { sourceItemId: ID.successorItem } }, "progression_response_malformed"),
    await failureCode("progression start successor mismatch rejected", { start: { successorItemId: ID.item } }, "successor_start_response_malformed"),
    await failureCode("malformed binding response rejected", { binding: { bindingTimestamp: null } }, "binding_response_malformed"),
    await failureCode("malformed completion response rejected", { completion: { completedAt: null } }, "completion_response_malformed"),
    await failureCode("malformed progression response rejected", { progression: { successorStatus: "pending" } }, "progression_response_malformed"),
    await failureCode("malformed start response rejected", { start: { attemptCount: 2 } }, "successor_start_response_malformed"),
    await unknownStatuses(),
    await callCount("binding boundary called exactly once", "binding", 1),
    await callCount("completion boundary called exactly once after binding", "completion", 1),
    await callCount("progression boundary called exactly once after completion", "progression", 1),
    await callCount("start boundary called exactly once with successor", "start", 1),
    await terminalCallCount(),
    await outcome("successor remains running", (r) => r.successorStatus === "running"),
    await outcome("successor binding is never executed", (r, h) => r.sequence === 41 && r.successorSequence === 42 && h.calls.binding === 1),
    await outcome("no second source item processed", (r, h) => r.sequence === 41 && h.calls.binding === 1),
    await outcome("no loop or recursive invocation", (_r, h) => h.order.join(",") === "binding,completion,progression,start"),
    await timestampOrdering(),
    await outcome("source remains completed", (r) => r.itemCompleted && r.completionStatus === "completed"),
    await inputImmutability(),
    await outcome("finalized remains zero", (r) => r.downstream.finalized === 0),
    await outcome("rolledBack remains zero", (r) => r.downstream.rolledBack === 0),
    await outcome("no session completion occurs", (r) => !("sessionsCompleted" in r.downstream)),
    await outcome("no deployment finalization occurs", (r) => r.downstream.finalized === 0),
    await tokenAbsent(),
    await diagnosticsAbsent(),
    await outcome("RC10.4-RC10.7 boundaries remain independently callable", (_r, h) => typeof h.boundaries.executeBinding === "function" && typeof h.boundaries.completeItem === "function" && typeof h.boundaries.progressDependencies === "function" && typeof h.boundaries.startSuccessor === "function"),
  ];
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

async function successTarget(name: string, targetType: "workstation" | "sterilizer") {
  const targetDeploymentKey = targetType === "workstation" ? "workstation-008" : "sterilizer-001";
  const currentState = { deploymentHardwareKey: "hardware-002", hardwareId: ID.hardware, targetDeploymentKey, targetId: null, targetType };
  const targetState = { hardwareId: ID.hardware, targetDeploymentKey, targetId: ID.target, targetType };
  const h = harness({ prepared: { currentState, targetState }, binding: { targetType, targetDeploymentKey }, completion: { targetType, targetDeploymentKey }, progression: { targetType, targetDeploymentKey } });
  const result = await executeHardwareBindingExecutionStep(h.boundaries, h.input);
  return scenario(name, result.ok && result.status === "completed_step" && h.order.join(",") === "binding,completion,progression,start", JSON.stringify(result));
}
async function replay() {
  const h = harness({ binding: { status: "already_bound", bindingStatus: "already_bound", bindingWritten: false }, completion: { status: "already_completed", completedCount: 0, reusedCount: 1 }, progression: { status: "already_progressed", progressedAt: null, progressedCount: 0, reusedCount: 1 }, start: { status: "already_started", startedCount: 0, reusedCount: 1 } });
  const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input);
  return scenario("exact replay reuses all completed stages", r.ok && r.bindingReused && r.itemCompletionReused && r.dependencyProgressionReused && r.successorStartReused && Object.values(h.calls).every((count) => count === 1), JSON.stringify(r.downstream));
}
async function stops(name: string, overrides: Overrides, expectedOrder: string) { const h = harness(overrides); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario(name, !r.ok && h.order.join(",") === expectedOrder, JSON.stringify({ status: r.status, order: h.order })); }
async function terminal() { const h = terminalHarness(); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario("no-successor terminal result skips start safely", r.ok && r.status === "completed_terminal_step" && h.calls.start === 0 && r.successorItemId === null, JSON.stringify(r)); }
async function eligibility(name: string, overrides: Overrides, code: string) { const h = harness(overrides); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario(name, !r.ok && r.issueCode === code && Object.values(h.calls).every((count) => count === 0), JSON.stringify(r)); }
async function failureCode(name: string, overrides: Overrides, code: string) { const h = harness(overrides); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario(name, !r.ok && r.issueCode === code, JSON.stringify(r)); }
async function unknownStatuses() { const cases: Overrides[] = [{ binding: { status: "mystery" as never } }, { completion: { status: "mystery" as never } }, { progression: { status: "mystery" as never } }, { start: { status: "mystery" as never } }]; const results = await Promise.all(cases.map(async (o) => executeHardwareBindingExecutionStep(harness(o).boundaries, harness(o).input))); return scenario("unknown status at every stage rejected", results.every((r) => !r.ok && r.status === "error"), JSON.stringify(results.map((r) => r.issueCode))); }
async function callCount(name: string, key: keyof Harness["calls"], expected: number) { const h = harness(); await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario(name, h.calls[key] === expected, JSON.stringify(h.calls)); }
async function terminalCallCount() { const h = terminalHarness(); await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario("start boundary not called without successor", h.calls.start === 0, JSON.stringify(h.calls)); }
async function outcome(name: string, check: (result: Awaited<ReturnType<typeof executeHardwareBindingExecutionStep>>, harness: Harness) => boolean) { const h = harness(); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario(name, check(r, h), JSON.stringify({ result: r, calls: h.calls })); }
async function timestampOrdering() { const h = harness(); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); const values = [r.bindingTimestamp, r.completedAt, r.progressedAt, r.startedAt].map((v) => Date.parse(v!)); return scenario("timestamp ordering enforced", r.ok && values.every(Number.isFinite) && values.every((v, i) => i === 0 || v >= values[i - 1]), JSON.stringify(values)); }
async function inputImmutability() { const h = harness(); const before = JSON.stringify(h.input); await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario("unrelated items remain unchanged", JSON.stringify(h.input) === before, JSON.stringify(h.input.preparedExecutionItems)); }
async function tokenAbsent() { const h = harness(); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario("ownership token absent from evidence", !JSON.stringify(r).includes(TOKEN) && !("ownershipToken" in r), JSON.stringify(r)); }
async function diagnosticsAbsent() { const h = harness({ binding: { ok: false, status: "error", message: `raw database ${TOKEN}`, issueCode: "repository_error" } }); const r = await executeHardwareBindingExecutionStep(h.boundaries, h.input); return scenario("raw repository diagnostics absent from evidence", !JSON.stringify(r).includes(TOKEN) && !JSON.stringify(r).includes("raw database"), JSON.stringify(r)); }

type Harness = { input: DeploymentHardwareBindingExecutionStepInput; boundaries: DeploymentHardwareBindingExecutionStepBoundaries; calls: Record<"binding" | "completion" | "progression" | "start", number>; order: string[] };
function harness(overrides: Overrides = {}): Harness {
  const source = running(overrides.running);
  const preparedItem = prepared(overrides.prepared);
  const bindingResult = binding(overrides.binding);
  const completionResult = completion(bindingResult, overrides.completion);
  const progressionResult = progression(completionResult, bindingResult, overrides.progression);
  const startResult = start(progressionResult, overrides.start);
  const calls = { binding: 0, completion: 0, progression: 0, start: 0 };
  const order: string[] = [];
  let clock = 0;
  const boundaries: DeploymentHardwareBindingExecutionStepBoundaries = {
    now: () => TIMES[Math.min(clock++, TIMES.length - 1)],
    executeBinding: async () => { calls.binding++; order.push("binding"); return bindingResult; },
    completeItem: async () => { calls.completion++; order.push("completion"); return completionResult; },
    progressDependencies: async () => { calls.progression++; order.push("progression"); return progressionResult; },
    startSuccessor: async () => { calls.start++; order.push("start"); return startResult; },
  };
  const baseInput: DeploymentHardwareBindingExecutionStepInput = { clinicId: ID.clinic, deploymentRunKey: "run-001", sessionId: "session-001", executionKey: "execution-001", planKey: "plan-001", claim: claim(), ownershipToken: TOKEN, runningItems: [source], preparedExecutionItems: [preparedItem], requestedAt: "2026-01-01T12:01:30.000Z" };
  const patchedInput = { ...baseInput, ...overrides.input };
  if (overrides.running) patchedInput.runningItems = [source];
  if (overrides.prepared) patchedInput.preparedExecutionItems = [preparedItem];
  return { input: patchedInput, boundaries, calls, order };
}
function terminalHarness(): Harness { return harness({ progression: { ok: false, status: "not_found", issueCode: "next_item_missing", successorItemId: null, successorExecutionItemKey: null, successorPlanItemKey: null, successorSequence: null, successorEntityType: null, successorEntityId: null, successorAction: null, successorStatus: null, progressedAt: null, progressedCount: 0 } }); }
function claim(patch: Partial<ServerDeploymentActivationExecutionClaimResult> = {}): ServerDeploymentActivationExecutionClaimResult { return { ok: true, status: "claimed", sessionId: "session-001", executionKey: "execution-001", planKey: "plan-001", claimantId: "executor-001", persistedOwnerId: "executor-001", leaseExpiresAt: "2026-01-01T12:10:00.000Z", claimMode: "fresh", ownershipResult: "claimed", sessionClaimed: 1, sessionReused: 0, sessionReclaimed: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], downstream: { sessionsClaimed: 1, sessionsReused: 0, sessionsReclaimed: 0, itemsStarted: 0, itemsSucceeded: 0, entitiesActivated: 0, bindingsWritten: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 }, message: "claimed", ...patch } as ServerDeploymentActivationExecutionClaimResult; }
function running(patch: Partial<ServerDeploymentActivationExecutionNextItemStartResult> = {}): ServerDeploymentActivationExecutionNextItemStartResult { return { ok: true, status: "started", message: "started", claimantId: "executor-001", clinicId: ID.clinic, deploymentRunKey: "run-001", sessionId: "session-001", executionKey: "execution-001", planKey: "plan-001", itemId: ID.item, executionItemKey: "execution-001:binding-002", planItemKey: "plan-001:binding-002", sequence: 41, entityType: "hardware_binding", entityId: ID.hardware, action: "bind", attemptCount: 1, startedAt: "2026-01-01T12:01:00.000Z", leaseExpiresAt: "2026-01-01T12:10:00.000Z", result: "started", startedCount: 1, reusedCount: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], downstream: { itemsStarted: 0, itemsSucceeded: 0, entitiesActivated: 0, bindingsWritten: 0, itemsCompleted: 0, dependenciesProgressed: 0, finalized: 0 }, ...patch } as ServerDeploymentActivationExecutionNextItemStartResult; }
function prepared(patch: Partial<DeploymentActivationExecutionItem> = {}): DeploymentActivationExecutionItem { return { executionItemKey: "execution-001:binding-002", planItemKey: "plan-001:binding-002", sequence: 41, entityType: "hardware_binding", entityId: ID.hardware, deploymentKey: "hardware-002", action: "bind", currentState: { deploymentHardwareKey: "hardware-002", hardwareId: ID.hardware, targetDeploymentKey: "workstation-008", targetId: null, targetType: "workstation" }, targetState: { hardwareId: ID.hardware, targetDeploymentKey: "workstation-008", targetId: ID.target, targetType: "workstation" }, dependencyKeys: [], executionStatus: "pending", attemptCount: 0, reversible: false, rollbackAction: null, startedAt: null, completedAt: null, error: null, evidence: { dependencyLevel: 1, readyDependencyKeys: [], pendingDependencyKeys: [] }, downstream: { itemsStarted: 0, itemsSucceeded: 0, entitiesActivated: 0, bindingsWritten: 0, assignmentsFinalized: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 }, ...patch } as DeploymentActivationExecutionItem; }
function binding(patch: Partial<DeploymentHardwareBindingExecutionResult> = {}): DeploymentHardwareBindingExecutionResult { return { ok: true, status: "bound", message: "bound", clinicId: ID.clinic, deploymentRunKey: "run-001", sessionId: "session-001", executionKey: "execution-001", executionItemKey: "execution-001:binding-002", planItemKey: "plan-001:binding-002", itemId: ID.item, sequence: 41, entityType: "hardware_binding", entityId: ID.hardware, action: "bind", hardwareId: ID.hardware, deploymentHardwareKey: "hardware-002", targetType: "workstation", targetId: ID.target, targetDeploymentKey: "workstation-008", bindingWritten: true, bindingStatus: "bound", previousBindingState: null, resultingBindingState: null, bindingTimestamp: TIMES[0], issueCode: null, issues: [], downstream: { bindingsWritten: 1, bindingsReused: 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0, finalized: 0, rolledBack: 0 }, ...patch } as DeploymentHardwareBindingExecutionResult; }
function completion(b: DeploymentHardwareBindingExecutionResult, patch: Partial<DeploymentHardwareBindingItemCompletionResult> = {}): DeploymentHardwareBindingItemCompletionResult { return { ...b, ok: true, status: "completed", completionStatus: "completed", completedAt: TIMES[1], completedCount: 1, reusedCount: 0, issueCode: null, issues: [], downstream: { bindingsWritten: b.status === "bound" ? 1 : 0, bindingsReused: b.status === "already_bound" ? 1 : 0, itemsCompleted: 1, dependenciesProgressed: 0, itemsStarted: 0, finalized: 0, rolledBack: 0 }, ...patch } as DeploymentHardwareBindingItemCompletionResult; }
function progression(c: DeploymentHardwareBindingItemCompletionResult, b: DeploymentHardwareBindingExecutionResult, patch: Partial<DeploymentHardwareBindingDependencyProgressionResult> = {}): DeploymentHardwareBindingDependencyProgressionResult { return { ok: true, status: "progressed", message: "progressed", clinicId: c.clinicId, deploymentRunKey: c.deploymentRunKey, sessionId: c.sessionId, executionKey: c.executionKey, sourceExecutionItemKey: c.executionItemKey, sourcePlanItemKey: c.planItemKey, sourceItemId: c.itemId, sourceSequence: c.sequence, sourceEntityType: c.entityType, sourceEntityId: c.entityId, sourceAction: c.action, hardwareId: b.hardwareId, deploymentHardwareKey: b.deploymentHardwareKey, targetType: b.targetType, targetId: b.targetId, targetDeploymentKey: b.targetDeploymentKey, completionStatus: c.status, completedAt: c.completedAt, progressionStatus: "progressed", progressedAt: TIMES[2], progressedCount: 1, reusedCount: 0, successorExecutionItemKey: "execution-001:binding-003", successorPlanItemKey: "plan-001:binding-003", successorItemId: ID.successorItem, successorSequence: 42, successorEntityType: "hardware_binding", successorEntityId: ID.successorHardware, successorAction: "bind", successorStatus: "ready", issueCode: null, issues: [], downstream: { bindingsWritten: b.status === "bound" ? 1 : 0, bindingsReused: b.status === "already_bound" ? 1 : 0, itemsCompleted: 1, dependenciesProgressed: 1, dependencyProgressionsReused: 0, itemsStarted: 0, finalized: 0, rolledBack: 0 }, ...patch } as DeploymentHardwareBindingDependencyProgressionResult; }
function start(p: DeploymentHardwareBindingDependencyProgressionResult, patch: Partial<DeploymentHardwareBindingSuccessorStartResult> = {}): DeploymentHardwareBindingSuccessorStartResult { return { ok: true, status: "started", message: "started", clinicId: p.clinicId, deploymentRunKey: p.deploymentRunKey, sessionId: p.sessionId, executionKey: p.executionKey, sourceExecutionItemKey: p.sourceExecutionItemKey, sourcePlanItemKey: p.sourcePlanItemKey, sourceItemId: p.sourceItemId, sourceSequence: p.sourceSequence, sourceEntityType: p.sourceEntityType, sourceEntityId: p.sourceEntityId, sourceAction: p.sourceAction, successorExecutionItemKey: p.successorExecutionItemKey, successorPlanItemKey: p.successorPlanItemKey, successorItemId: p.successorItemId, successorSequence: p.successorSequence, successorEntityType: p.successorEntityType, successorEntityId: p.successorEntityId, successorAction: p.successorAction, previousSuccessorStatus: "ready", successorStatus: "running", startedAt: TIMES[3], attemptCount: 1, startedCount: 1, reusedCount: 0, issueCode: null, issues: [], downstream: { bindingsWritten: 1, bindingsReused: 0, itemsCompleted: 1, dependenciesProgressed: 1, dependencyProgressionsReused: 0, itemsStarted: 1, itemStartsReused: 0, finalized: 0, rolledBack: 0 }, ...patch } as DeploymentHardwareBindingSuccessorStartResult; }
function scenario(name: string, passed: boolean, message: string): DeploymentHardwareBindingExecutionStepHarnessScenario { return { name, passed, message }; }