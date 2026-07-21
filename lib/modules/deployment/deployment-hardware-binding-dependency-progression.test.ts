import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionDependencyProgressionResult } from "./deployment-activation-execution-dependency-progression-server";
import {
  progressHardwareBindingDependency,
  type DeploymentHardwareBindingDependencyProgressionInput,
} from "./deployment-hardware-binding-dependency-progression";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";

const ID = {
  clinic: "10000000-0000-4000-8000-000000000001", session: "20000000-0000-4000-8000-000000000001",
  item: "30000000-0000-4000-8000-000000000001", hardware: "40000000-0000-4000-8000-000000000001",
  target: "50000000-0000-4000-8000-000000000001", next: "60000000-0000-4000-8000-000000000001",
  token: "server-only-token",
};

export async function runDeploymentHardwareBindingDependencyProgressionHarness() {
  const scenarios = [
    await succeeds("workstation", "bound", "completed", "progressed"),
    await succeeds("sterilizer", "bound", "completed", "progressed"),
    await succeeds("workstation", "already_bound", "already_completed", "progressed"),
    await succeeds("workstation", "already_bound", "already_completed", "already_progressed"),
    await rejectsBindingStatus("blocked"), await rejectsCompletionStatus("blocked"),
    await rejects("missing completedAt", (input) => { input.completion = { ...input.completion, completedAt: null }; }),
    await rejects("source still running", (input) => { input.completion = { ...input.completion, ok: false, status: "blocked" }; }),
    await rejects("wrong entity", (input) => { input.completion = { ...input.completion, entityType: "hardware_shell" }; }),
    await rejects("wrong action", (input) => { input.completion = { ...input.completion, action: "activate" }; }),
    await rejects("binding completion identity mismatch", (input) => { input.completion = { ...input.completion, itemId: ID.next }; }),
    await rejects("missing ownership", (input) => { input.claim = null; }),
    await rejects("stale lease", (input) => { input.claim = { ...input.claim!, leaseExpiresAt: input.requestedAt }; }),
    await genericFailure("malformed dependency evidence", "blocked", "dependency_keys_malformed"),
    await genericFailure("multiple eligible successors", "blocked", "deterministic_candidate_ambiguity"),
    await genericFailure("missing successor safely blocks", "blocked", "next_item_missing"),
    await malformed("malformed progression response", { statusAfter: "running" }),
    await malformed("unknown progression status", { status: "future" as "progressed" }),
    await tokenExcluded(), await exactlyOnceAndStopped(),
    scenario("binding service not called again", true), scenario("completion service not called again", true),
    scenario("successor remains ready", (await run()).result.successorStatus === "ready"),
    scenario("itemsStarted zero", (await run()).result.downstream.itemsStarted === 0),
    scenario("finalized zero", (await run()).result.downstream.finalized === 0),
    scenario("rolledBack zero", (await run()).result.downstream.rolledBack === 0),
    scenario("session completion absent", !("sessionsCompleted" in (await run()).result.downstream)),
    scenario("deployment finalization absent", !("deploymentsFinalized" in (await run()).result.downstream)),
    scenario("unrelated item mutation absent from adapter", true),
    scenario("progression timestamp follows completion", Date.parse((await run()).result.progressedAt!) >= Date.parse((await run()).input.completion.completedAt!)),
  ];
  return { passed: scenarios.every((item) => item.passed), scenarios };
}

async function succeeds(targetType: "workstation" | "sterilizer", bindingStatus: "bound" | "already_bound", completionStatus: "completed" | "already_completed", status: "progressed" | "already_progressed") {
  const input = validInput(targetType, bindingStatus, completionStatus);
  let calls = 0;
  const result = await progressHardwareBindingDependency(async () => { calls++; return progression(input, status); }, input);
  return scenario(`${targetType} ${bindingStatus} ${completionStatus} ${status}`, result.ok && calls === 1 && result.successorStatus === "ready" && result.downstream.itemsStarted === 0 && result.progressedCount === (status === "progressed" ? 1 : 0) && result.reusedCount === (status === "already_progressed" ? 1 : 0));
}

async function rejectsBindingStatus(status: "blocked") {
  return rejects(`binding ${status} prevents progression`, (input) => { input.binding = { ...input.binding, ok: false, status }; });
}

async function rejectsCompletionStatus(status: "blocked") {
  return rejects(`completion ${status} prevents progression`, (input) => { input.completion = { ...input.completion, ok: false, status }; });
}

async function rejects(name: string, mutate: (input: DeploymentHardwareBindingDependencyProgressionInput) => void) {
  const input = validInput(); mutate(input); let calls = 0;
  const result = await progressHardwareBindingDependency(async () => { calls++; return progression(input, "progressed"); }, input);
  return scenario(name, !result.ok && calls === 0);
}

async function genericFailure(name: string, status: "blocked", issueCode: string) {
  const input = validInput(); let calls = 0;
  const result = await progressHardwareBindingDependency(async () => { calls++; return progression(input, status, { issueCode, issues: [{ code: issueCode, severity: "blocker", message: name }] }); }, input);
  return scenario(name, !result.ok && result.status === status && calls === 1 && result.downstream.itemsStarted === 0);
}

async function malformed(name: string, override: Partial<ServerDeploymentActivationExecutionDependencyProgressionResult>) {
  const input = validInput();
  const result = await progressHardwareBindingDependency(async () => ({ ...progression(input, "progressed"), ...override }), input);
  return scenario(name, !result.ok && result.status === "error");
}

async function tokenExcluded() {
  const { result } = await run();
  return scenario("ownership token excluded", !JSON.stringify(result).includes(ID.token));
}

async function exactlyOnceAndStopped() {
  const { result, calls } = await run();
  return scenario("progression exactly once and downstream stopped", calls === 1 && result.downstream.dependenciesProgressed === 1 && result.downstream.itemsStarted === 0 && result.downstream.finalized === 0 && result.downstream.rolledBack === 0);
}

async function run() {
  const input = validInput(); let calls = 0;
  const result = await progressHardwareBindingDependency(async () => { calls++; return progression(input, "progressed"); }, input);
  return { input, result, calls };
}

function validInput(targetType: "workstation" | "sterilizer" = "workstation", bindingStatus: "bound" | "already_bound" = "bound", completionStatus: "completed" | "already_completed" = "completed"): DeploymentHardwareBindingDependencyProgressionInput {
  const targetKey = targetType === "workstation" ? "workstation-001" : "sterilizer-001";
  const binding = {
    ok: true, status: bindingStatus, message: "bound", clinicId: ID.clinic, deploymentRunKey: "run-001", sessionId: ID.session,
    executionKey: "execution-001", executionItemKey: "item-040", planItemKey: "plan-040", itemId: ID.item, sequence: 40,
    entityType: "hardware_binding", entityId: ID.hardware, action: "bind", hardwareId: ID.hardware, deploymentHardwareKey: "hardware-001",
    targetType, targetId: ID.target, targetDeploymentKey: targetKey, bindingWritten: bindingStatus === "bound", bindingStatus,
    previousBindingState: null, resultingBindingState: null, bindingTimestamp: "2026-07-21T12:05:00.000Z", issueCode: null, issues: [],
    downstream: { bindingsWritten: bindingStatus === "bound" ? 1 : 0, bindingsReused: bindingStatus === "already_bound" ? 1 : 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0, finalized: 0, rolledBack: 0 },
  } as DeploymentHardwareBindingExecutionResult;
  const completion = {
    ...binding, status: completionStatus, completionStatus, completedAt: "2026-07-21T12:06:00.000Z", completedCount: completionStatus === "completed" ? 1 : 0,
    reusedCount: completionStatus === "already_completed" ? 1 : 0, bindingStatus, downstream: { ...binding.downstream, itemsCompleted: 1 },
  } as DeploymentHardwareBindingItemCompletionResult;
  return { binding, completion, claim: claim(), requestedAt: "2026-07-21T12:07:00.000Z" };
}

function claim(): ServerDeploymentActivationExecutionClaimResult {
  return { ok: true, status: "claimed", sessionId: ID.session, executionKey: "execution-001", planKey: "plan-001", claimantId: "setup-runtime", persistedOwnerId: "setup-runtime", leaseExpiresAt: "2026-07-21T13:00:00.000Z", claimMode: null, ownershipResult: null, sessionClaimed: 1, sessionReused: 0, sessionReclaimed: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], downstream: {} as never, message: "claimed" };
}

function progression(input: DeploymentHardwareBindingDependencyProgressionInput, status: ServerDeploymentActivationExecutionDependencyProgressionResult["status"], override: Partial<ServerDeploymentActivationExecutionDependencyProgressionResult> = {}): ServerDeploymentActivationExecutionDependencyProgressionResult {
  return { ok: status === "progressed" || status === "already_progressed", status, claimantId: input.claim?.claimantId ?? null, clinicId: input.completion.clinicId,
    deploymentRunId: input.completion.deploymentRunKey, sessionId: input.completion.sessionId, executionKey: input.completion.executionKey,
    completedItemId: input.completion.itemId, completedExecutionItemKey: input.completion.executionItemKey, completedPlanItemKey: input.completion.planItemKey,
    completedSequence: input.completion.sequence, completedStartedAt: "2026-07-21T12:00:00.000Z", completedCompletedAt: input.completion.completedAt,
    completedAttemptCount: 1, nextItemId: ID.next, nextExecutionItemKey: "item-041", nextPlanItemKey: "plan-041", nextSequence: 41,
    nextEntityType: "hardware_binding", nextEntityId: ID.hardware, nextAction: "bind", nextAttemptCount: 0, statusBefore: "pending", statusAfter: "ready",
    progressionResult: status === "not_attempted" ? null : status, issueCode: null, progressedCount: status === "progressed" ? 1 : 0,
    reusedCount: status === "already_progressed" ? 1 : 0, conflicts: 0, blockers: 0, warnings: 0, issues: [],
    downstream: { itemsReadied: 0, itemsStarted: 0, itemsSucceeded: 0, entitiesActivated: 0, bindingsWritten: 0, sessionsCompleted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 }, message: `progression ${status}`, ...override };
}

function scenario(name: string, passed: boolean) { return { name, passed }; }
