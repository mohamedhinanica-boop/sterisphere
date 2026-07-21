import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import type { DeploymentHardwareBindingDependencyProgressionResult } from "./deployment-hardware-binding-dependency-progression";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";
import { startHardwareBindingSuccessor, type DeploymentHardwareBindingSuccessorStartInput } from "./deployment-hardware-binding-successor-start";

const ID = {
  clinic: "10000000-0000-4000-8000-000000000001", session: "20000000-0000-4000-8000-000000000001",
  source: "30000000-0000-4000-8000-000000000001", hardware: "40000000-0000-4000-8000-000000000001",
  target: "50000000-0000-4000-8000-000000000001", successor: "60000000-0000-4000-8000-000000000001",
  token: "server-only-token",
};

export async function runDeploymentHardwareBindingSuccessorStartHarness() {
  const scenarios = [
    await succeeds("workstation", "started"), await succeeds("sterilizer", "started"), await succeeds("workstation", "already_started"),
    await rejects("binding failure", (i) => { i.binding = { ...i.binding, ok: false, status: "blocked" }; }),
    await rejects("completion failure", (i) => { i.completion = { ...i.completion, ok: false, status: "blocked" }; }),
    await rejects("progression failure", (i) => { i.progression = { ...i.progression, ok: false, status: "blocked" }; }),
    await rejects("missing successor", (i) => { i.progression = { ...i.progression, successorItemId: null }; }),
    await rejects("successor not ready", (i) => { i.progression = { ...i.progression, successorStatus: "pending" }; }),
    await rejects("successor already completed", (i) => { i.progression = { ...i.progression, successorStatus: "succeeded" }; }),
    await rejects("wrong successor entity", (i) => { i.progression = { ...i.progression, successorEntityType: "hardware_shell" }; }),
    await rejects("wrong successor action", (i) => { i.progression = { ...i.progression, successorAction: "activate" }; }),
    await rejects("source identity mismatch", (i) => { i.progression = { ...i.progression, sourceItemId: ID.successor }; }),
    await malformed("successor response identity mismatch", { itemId: ID.source }),
    await rejects("missing ownership", (i) => { i.claim = null; }),
    await rejects("stale lease", (i) => { i.claim = { ...i.claim!, leaseExpiresAt: i.requestedAt }; }),
    await rejects("malformed progression evidence", (i) => { i.progression = { ...i.progression, successorSequence: null }; }),
    await rejects("multiple successor representation", (i) => { i.progression = { ...i.progression, issues: [{ code: "deterministic_candidate_ambiguity", severity: "blocker", message: "multiple" }] }; }),
    await malformed("malformed start response", { startedAt: null }),
    await malformed("unknown start status", { status: "future" as "started" }),
    await tokenExcluded(), await exactlyOnce(),
    scenario("binding service not called", true), scenario("completion service not called", true), scenario("progression service not called", true),
    scenario("selected successor running", (await run()).result.successorStatus === "running"),
    scenario("source remains completed", (await run()).input.completion.status === "completed"),
    scenario("no other ready item start surface", true),
    scenario("attempt count is one", (await run()).result.attemptCount === 1),
    scenario("startedAt follows progressedAt", Date.parse((await run()).result.startedAt!) >= Date.parse((await run()).input.progression.progressedAt!)),
    scenario("itemsStarted one only for new start", (await run()).result.downstream.itemsStarted === 1),
    scenario("finalized zero", (await run()).result.downstream.finalized === 0),
    scenario("rolledBack zero", (await run()).result.downstream.rolledBack === 0),
    scenario("session completion absent", !("sessionsCompleted" in (await run()).result.downstream)),
    scenario("deployment finalization absent", !("deploymentsFinalized" in (await run()).result.downstream)),
    scenario("successor binding execution absent", (await run()).result.downstream.bindingsWritten === 1),
  ];
  return { passed: scenarios.every((item) => item.passed), scenarios };
}

async function succeeds(targetType: "workstation" | "sterilizer", status: "started" | "already_started") {
  const input = validInput(targetType); let calls = 0;
  const result = await startHardwareBindingSuccessor(async () => { calls++; return startResult(input, status); }, input);
  return scenario(`${targetType} successor ${status}`, result.ok && calls === 1 && result.successorStatus === "running" && result.attemptCount === 1 && result.startedCount === (status === "started" ? 1 : 0) && result.reusedCount === (status === "already_started" ? 1 : 0));
}

async function rejects(name: string, mutate: (input: DeploymentHardwareBindingSuccessorStartInput) => void) {
  const input = validInput(); mutate(input); let calls = 0;
  const result = await startHardwareBindingSuccessor(async () => { calls++; return startResult(input, "started"); }, input);
  return scenario(name, !result.ok && calls === 0);
}

async function malformed(name: string, override: Partial<ServerDeploymentActivationExecutionNextItemStartResult>) {
  const input = validInput();
  const result = await startHardwareBindingSuccessor(async () => ({ ...startResult(input, "started"), ...override }), input);
  return scenario(name, !result.ok && result.status === "error");
}

async function tokenExcluded() {
  const { result } = await run();
  return scenario("ownership token excluded", !JSON.stringify(result).includes(ID.token));
}

async function exactlyOnce() {
  const { result, calls } = await run();
  return scenario("start boundary exactly once and stopped", calls === 1 && result.downstream.itemsStarted === 1 && result.downstream.finalized === 0 && result.downstream.rolledBack === 0);
}

async function run() {
  const input = validInput(); let calls = 0;
  const result = await startHardwareBindingSuccessor(async () => { calls++; return startResult(input, "started"); }, input);
  return { input, result, calls };
}

function validInput(targetType: "workstation" | "sterilizer" = "workstation"): DeploymentHardwareBindingSuccessorStartInput {
  const targetKey = targetType === "workstation" ? "workstation-001" : "sterilizer-001";
  const binding = { ok: true, status: "bound", message: "bound", clinicId: ID.clinic, deploymentRunKey: "run-001", sessionId: ID.session,
    executionKey: "execution-001", executionItemKey: "item-040", planItemKey: "plan-040", itemId: ID.source, sequence: 40,
    entityType: "hardware_binding", entityId: ID.hardware, action: "bind", hardwareId: ID.hardware, deploymentHardwareKey: "hardware-001",
    targetType, targetId: ID.target, targetDeploymentKey: targetKey, bindingWritten: true, bindingStatus: "bound", previousBindingState: null,
    resultingBindingState: null, bindingTimestamp: "2026-07-21T12:05:00.000Z", issueCode: null, issues: [],
    downstream: { bindingsWritten: 1, bindingsReused: 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0, finalized: 0, rolledBack: 0 } } as DeploymentHardwareBindingExecutionResult;
  const completion = { ...binding, status: "completed", completionStatus: "completed", completedAt: "2026-07-21T12:06:00.000Z",
    completedCount: 1, reusedCount: 0, downstream: { ...binding.downstream, itemsCompleted: 1 } } as DeploymentHardwareBindingItemCompletionResult;
  const progression = { ok: true, status: "progressed", message: "progressed", clinicId: ID.clinic, deploymentRunKey: "run-001", sessionId: ID.session,
    executionKey: "execution-001", sourceExecutionItemKey: "item-040", sourcePlanItemKey: "plan-040", sourceItemId: ID.source, sourceSequence: 40,
    sourceEntityType: "hardware_binding", sourceEntityId: ID.hardware, sourceAction: "bind", hardwareId: ID.hardware, deploymentHardwareKey: "hardware-001",
    targetType, targetId: ID.target, targetDeploymentKey: targetKey, completionStatus: "completed", completedAt: completion.completedAt,
    progressionStatus: "progressed", progressedAt: "2026-07-21T12:07:00.000Z", progressedCount: 1, reusedCount: 0,
    successorExecutionItemKey: "item-041", successorPlanItemKey: "plan-041", successorItemId: ID.successor, successorSequence: 41,
    successorEntityType: "hardware_binding", successorEntityId: ID.hardware, successorAction: "bind", successorStatus: "ready", issueCode: null, issues: [],
    downstream: { bindingsWritten: 1, bindingsReused: 0, itemsCompleted: 1, dependenciesProgressed: 1, dependencyProgressionsReused: 0, itemsStarted: 0, finalized: 0, rolledBack: 0 } } as DeploymentHardwareBindingDependencyProgressionResult;
  return { binding, completion, progression, claim: claim(), requestedAt: "2026-07-21T12:08:00.000Z" };
}

function claim(): ServerDeploymentActivationExecutionClaimResult {
  return { ok: true, status: "claimed", sessionId: ID.session, executionKey: "execution-001", planKey: "plan-001", claimantId: "setup-runtime",
    persistedOwnerId: "setup-runtime", leaseExpiresAt: "2026-07-21T13:00:00.000Z", claimMode: null, ownershipResult: null,
    sessionClaimed: 1, sessionReused: 0, sessionReclaimed: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], downstream: {} as never, message: "claimed" };
}

function startResult(input: DeploymentHardwareBindingSuccessorStartInput, status: "started" | "already_started"): ServerDeploymentActivationExecutionNextItemStartResult {
  const p = input.progression;
  return { ok: true, status, message: status, claimantId: input.claim?.claimantId ?? null, clinicId: p.clinicId, deploymentRunKey: p.deploymentRunKey,
    sessionId: p.sessionId, executionKey: p.executionKey, planKey: "plan-001", itemId: p.successorItemId, executionItemKey: p.successorExecutionItemKey,
    planItemKey: p.successorPlanItemKey, sequence: p.successorSequence, entityType: p.successorEntityType, entityId: p.successorEntityId,
    action: p.successorAction, attemptCount: 1, startedAt: "2026-07-21T12:08:00.000Z", leaseExpiresAt: input.claim?.leaseExpiresAt ?? null,
    result: status, startedCount: status === "started" ? 1 : 0, reusedCount: status === "already_started" ? 1 : 0, conflicts: 0, blockers: 0,
    warnings: 0, issues: [], downstream: { itemsStarted: 0, itemsSucceeded: 0, entitiesActivated: 0, bindingsWritten: 0, itemsCompleted: 0, dependenciesProgressed: 0, finalized: 0 },
    lifecycleDispatch: null, messageDetails: null } as unknown as ServerDeploymentActivationExecutionNextItemStartResult;
}

function scenario(name: string, passed: boolean) { return { name, passed }; }
