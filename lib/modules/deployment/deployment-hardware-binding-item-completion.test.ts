import type {
  DeploymentActivationExecutionAtomicItemCompletionCommand,
  DeploymentActivationExecutionAtomicItemCompletionResult,
} from "./deployment-activation-execution-item-completion-types";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import {
  DeploymentHardwareBindingItemCompletionService,
  type DeploymentHardwareBindingCompletionRepository,
  type DeploymentHardwareBindingItemCompletionInput,
} from "./deployment-hardware-binding-item-completion";

const IDS = {
  clinic: "10000000-0000-4000-8000-000000000001",
  session: "20000000-0000-4000-8000-000000000001",
  item: "30000000-0000-4000-8000-000000000001",
  hardware: "40000000-0000-4000-8000-000000000001",
  workstation: "50000000-0000-4000-8000-000000000001",
  sterilizer: "60000000-0000-4000-8000-000000000001",
  token: "server-only-completion-token",
  databaseCompletedAt: "2026-07-21T12:06:00.000Z",
};

export async function runDeploymentHardwareBindingItemCompletionHarness() {
  const scenarios = [
    await completes("workstation", "bound", "completed"),
    await completes("sterilizer", "bound", "completed"),
    await completes("workstation", "already_bound", "completed"),
    await completes("workstation", "already_bound", "already_completed"),
    ...(await Promise.all((["blocked", "conflict", "not_found", "error"] as const).map(bindingFailure))),
    ...(await Promise.all((["blocked", "conflict", "not_found", "error"] as const).map(completionFailure))),
    await rejected("non-running item", { itemStatus: "ready" }),
    await rejectedBinding("wrong entity", { entityType: "hardware_shell" }),
    await rejectedBinding("wrong action", { action: "activate" }),
    await rejected("missing ownership", { ownershipToken: null }),
    await rejected("ownership mismatch", { claimedClaimantId: "different-claimant" }),
    await rejected("stale lease", { expectedLeaseExpiresAt: "2026-07-21T12:00:00.000Z" }),
    await rejected("mismatched item", { runningItemId: "70000000-0000-4000-8000-000000000001" }),
    await rejectedBinding("mismatched hardware", { hardwareId: "70000000-0000-4000-8000-000000000001" }),
    await rejectedBinding("mismatched target", { targetId: IDS.sterilizer }),
    await malformedResponse("malformed completion", { completedAt: null }),
    await malformedResponse("unknown completion status", { status: "future" as "completed" }),
    await authoritativeCompletionTimestamp(),
    await causalMismatchRejected(),
    await tokenExcluded(),
    await exactlyOnceAndNoDownstream(),
  ];
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

async function completes(
  targetType: "workstation" | "sterilizer",
  bindingStatus: "bound" | "already_bound",
  completionStatus: "completed" | "already_completed",
) {
  const input = validInput(targetType, bindingStatus);
  const repository = new TestRepository(atomic(input, completionStatus));
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(
    `${targetType} ${bindingStatus} ${completionStatus}`,
    result.ok && result.status === completionStatus && repository.calls === 1 &&
      result.downstream.itemsCompleted === 1 &&
      result.completedCount === (completionStatus === "completed" ? 1 : 0) &&
      result.reusedCount === (completionStatus === "already_completed" ? 1 : 0),
  );
}

async function bindingFailure(status: "blocked" | "conflict" | "not_found" | "error") {
  const input = validInput();
  input.binding = { ...input.binding, ok: false, status };
  const repository = new TestRepository(atomic(input, "completed"));
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(`binding ${status} skips completion`, !result.ok && repository.calls === 0);
}

async function completionFailure(status: "blocked" | "conflict" | "not_found" | "error") {
  const input = validInput();
  const repository = new TestRepository(atomic(input, status));
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(`completion ${status} is non-success`, !result.ok && result.status === status && repository.calls === 1);
}

async function rejected(name: string, override: Partial<DeploymentHardwareBindingItemCompletionInput>) {
  const input = { ...validInput(), ...override };
  const repository = new TestRepository(atomic(input, "completed"));
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(name, !result.ok && result.status === "blocked" && repository.calls === 0);
}

async function rejectedBinding(name: string, override: Partial<DeploymentHardwareBindingExecutionResult>) {
  const input = validInput();
  input.binding = { ...input.binding, ...override };
  const repository = new TestRepository(atomic(input, "completed"));
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(name, !result.ok && repository.calls === 0);
}

async function malformedResponse(name: string, override: Partial<DeploymentActivationExecutionAtomicItemCompletionResult>) {
  const input = validInput();
  const repository = new TestRepository({ ...atomic(input, "completed"), ...override });
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(name, !result.ok && result.status === "error" && repository.calls === 1);
}

async function authoritativeCompletionTimestamp() {
  const input = { ...validInput(), proposedCompletedAt: "2026-07-21T11:00:00.000Z" };
  const repository = new TestRepository(atomic(input, "completed"));
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(
    "database completion timestamp cannot be forged by request session or item time",
    result.ok && result.completedAt === IDS.databaseCompletedAt &&
      result.completedAt !== input.proposedCompletedAt && result.completedAt !== input.startedAt &&
      Date.parse(result.completedAt) >= Date.parse(input.binding.bindingTimestamp!),
  );
}

async function causalMismatchRejected() {
  const input = validInput();
  const repository = new TestRepository({ ...atomic(input, "completed"), completedAt: "2026-07-21T12:04:59.000Z" });
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario("binding completion causal mismatch is rejected safely", !result.ok && result.issueCode === "completion_timestamp_causality_invalid" && repository.calls === 1 && result.downstream.dependenciesProgressed === 0 && result.downstream.itemsStarted === 0);
}

async function tokenExcluded() {
  const input = validInput();
  const repository = new TestRepository({ ...atomic(input, "blocked"), message: `unsafe ${IDS.token}` });
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario("ownership token excluded", !JSON.stringify(result).includes(IDS.token));
}

async function exactlyOnceAndNoDownstream() {
  const input = validInput();
  const repository = new TestRepository(atomic(input, "completed"));
  const result = await new DeploymentHardwareBindingItemCompletionService(repository).complete(input);
  return scenario(
    "one completion and no second binding progression start rollback or finalization",
    repository.calls === 1 &&
      result.downstream.itemsCompleted === 1 &&
      result.downstream.bindingsWritten === 1 &&
      result.downstream.dependenciesProgressed === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.rolledBack === 0 &&
      result.downstream.finalized === 0,
  );
}

class TestRepository implements DeploymentHardwareBindingCompletionRepository {
  calls = 0;
  constructor(private readonly result: DeploymentActivationExecutionAtomicItemCompletionResult) {}
  async completeExecutionItemAtomically(command: DeploymentActivationExecutionAtomicItemCompletionCommand) {
    this.calls += 1;
    if (command.expectedEntityType !== "hardware_binding" || command.expectedAction !== "bind") {
      throw new Error("Wrong lifecycle command.");
    }
    return this.result;
  }
}

function validInput(
  targetType: "workstation" | "sterilizer" = "workstation",
  bindingStatus: "bound" | "already_bound" = "bound",
): DeploymentHardwareBindingItemCompletionInput {
  const targetId = targetType === "workstation" ? IDS.workstation : IDS.sterilizer;
  const targetKey = targetType === "workstation" ? "workstation-001" : "sterilizer-001";
  const binding: DeploymentHardwareBindingExecutionResult = {
    ok: true, status: bindingStatus, message: "bound", clinicId: IDS.clinic,
    deploymentRunKey: "deployment-run-001", sessionId: IDS.session, executionKey: "execution-001",
    executionItemKey: "execution-001:binding-001", planItemKey: "plan-001:binding-001",
    itemId: IDS.item, sequence: 40, entityType: "hardware_binding", entityId: IDS.hardware,
    action: "bind", hardwareId: IDS.hardware, deploymentHardwareKey: "hardware-001",
    targetType, targetId, targetDeploymentKey: targetKey, bindingWritten: bindingStatus === "bound",
    bindingStatus, previousBindingState: null, resultingBindingState: null,
    bindingTimestamp: "2026-07-21T12:05:00.000Z", issueCode: null, issues: [],
    downstream: { bindingsWritten: bindingStatus === "bound" ? 1 : 0, bindingsReused: bindingStatus === "already_bound" ? 1 : 0, itemsCompleted: 0, dependenciesProgressed: 0, itemsStarted: 0, finalized: 0, rolledBack: 0 },
  };
  return {
    binding, itemStatus: "running", claimantId: "setup-runtime", claimedClaimantId: "setup-runtime", ownershipToken: IDS.token,
    expectedLeaseExpiresAt: "2026-07-21T13:00:00.000Z", startedAt: "2026-07-21T12:00:00.000Z",
    attemptCount: 1, runningItemId: IDS.item, runningExecutionItemKey: "execution-001:binding-001",
    runningPlanItemKey: "plan-001:binding-001", runningSequence: 40, runningEntityType: "hardware_binding",
    runningEntityId: IDS.hardware, runningAction: "bind", plannerDeploymentHardwareKey: "hardware-001",
    plannerExpectedState: { deploymentHardwareKey: "hardware-001", hardwareId: IDS.hardware, targetDeploymentKey: targetKey, targetId: null, targetType },
    plannerTargetState: { hardwareId: IDS.hardware, targetDeploymentKey: targetKey, targetId, targetType },
    proposedCompletedAt: "2026-07-21T12:10:00.000Z",
  };
}

function atomic(input: DeploymentHardwareBindingItemCompletionInput, status: DeploymentActivationExecutionAtomicItemCompletionResult["status"]): DeploymentActivationExecutionAtomicItemCompletionResult {
  const success = status === "completed" || status === "already_completed";
  return {
    ok: success, status, claimantId: input.claimantId, clinicId: input.binding.clinicId,
    deploymentRunId: input.binding.deploymentRunKey, sessionId: input.binding.sessionId,
    executionKey: input.binding.executionKey, itemId: input.binding.itemId,
    executionItemKey: input.binding.executionItemKey, planItemKey: input.binding.planItemKey,
    sequence: input.binding.sequence, entityType: "hardware_binding", action: "bind",
    startedAt: input.startedAt, completedAt: success ? IDS.databaseCompletedAt : null,
    attemptCount: input.attemptCount, executionStatusBefore: status === "already_completed" ? "succeeded" : "running",
    executionStatusAfter: success ? "succeeded" : "running", issueCode: success ? null : `completion_${status}`,
    message: `Completion ${status}.`,
  };
}

function scenario(name: string, passed: boolean) { return { name, passed }; }
