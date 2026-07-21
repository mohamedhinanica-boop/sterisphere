import {
  executeHardwareBinding,
  type DeploymentHardwareBindingExecutionInput,
  type DeploymentHardwareBindingExecutionService,
} from "./deployment-hardware-binding-execution-adapter";
import type {
  DeploymentHardwareBindingAtomicCommand,
  DeploymentHardwareBindingEvidence,
  DeploymentHardwareBindingStatus,
  DeploymentHardwareBindingTargetType,
} from "./deployment-hardware-binding-types";

const IDS = {
  clinic: "10000000-0000-4000-8000-000000000001",
  session: "20000000-0000-4000-8000-000000000001",
  item: "30000000-0000-4000-8000-000000000001",
  hardware: "40000000-0000-4000-8000-000000000001",
  workstation: "50000000-0000-4000-8000-000000000001",
  sterilizer: "60000000-0000-4000-8000-000000000001",
  token: "server-only-token",
};

export async function runDeploymentHardwareBindingExecutionAdapterHarness() {
  const scenarios = [
    await success("workstation", "bound"),
    await success("sterilizer", "bound"),
    await success("workstation", "already_bound"),
    ...(await Promise.all(([
      "blocked", "conflict", "not_found", "error",
    ] as const).map(failureStatus))),
    await rejected("non-running item", { itemStatus: "ready" }),
    await rejected("wrong entity", { entityType: "hardware_shell" }),
    await rejected("wrong action", { action: "activate" }),
    await rejected("missing ownership", { ownershipToken: null }),
    await rejected("malformed planner state", { targetState: {} }),
    await tokenExcluded(),
    await exactlyOnce(),
    await zeroDownstream(),
  ];
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

async function success(targetType: DeploymentHardwareBindingTargetType, status: "bound" | "already_bound") {
  const input = validInput(targetType);
  const service = new TestService(evidence(input, status));
  const result = await executeHardwareBinding(service, input);
  return scenario(
    `${targetType} ${status}`,
    result.ok && result.status === status && service.calls === 1 &&
      result.downstream.bindingsWritten === (status === "bound" ? 1 : 0) &&
      result.downstream.bindingsReused === (status === "already_bound" ? 1 : 0),
  );
}

async function failureStatus(status: "blocked" | "conflict" | "not_found" | "error") {
  const input = validInput();
  const service = new TestService(evidence(input, status));
  const result = await executeHardwareBinding(service, input);
  return scenario(`${status} is non-success`, !result.ok && result.status === status && service.calls === 1);
}

async function rejected(name: string, override: Partial<DeploymentHardwareBindingExecutionInput>) {
  const service = new TestService(evidence(validInput(), "bound"));
  const result = await executeHardwareBinding(service, { ...validInput(), ...override });
  return scenario(name, !result.ok && result.status === "blocked" && service.calls === 0);
}

async function tokenExcluded() {
  const input = validInput();
  const service = new TestService({ ...evidence(input, "error"), message: `unsafe ${IDS.token}` });
  const result = await executeHardwareBinding(service, input);
  return scenario("ownership token excluded", !JSON.stringify(result).includes(IDS.token));
}

async function exactlyOnce() {
  const input = validInput();
  const service = new TestService(evidence(input, "bound"));
  await executeHardwareBinding(service, input);
  return scenario("service called exactly once", service.calls === 1 && service.lastCommand?.targetId === IDS.workstation);
}

async function zeroDownstream() {
  const input = validInput();
  const result = await executeHardwareBinding(new TestService(evidence(input, "bound")), input);
  return scenario(
    "no completion progression start rollback or finalization",
    result.downstream.itemsCompleted === 0 &&
      result.downstream.dependenciesProgressed === 0 &&
      result.downstream.itemsStarted === 0 &&
      result.downstream.rolledBack === 0 &&
      result.downstream.finalized === 0,
  );
}

class TestService implements DeploymentHardwareBindingExecutionService {
  calls = 0;
  lastCommand: DeploymentHardwareBindingAtomicCommand | null = null;
  constructor(private readonly result: DeploymentHardwareBindingEvidence) {}
  async bindHardware(command: DeploymentHardwareBindingAtomicCommand) {
    this.calls += 1;
    this.lastCommand = command;
    return this.result;
  }
}

function validInput(targetType: DeploymentHardwareBindingTargetType = "workstation"): DeploymentHardwareBindingExecutionInput {
  const targetId = targetType === "workstation" ? IDS.workstation : IDS.sterilizer;
  const targetKey = targetType === "workstation" ? "workstation-001" : "sterilizer-001";
  return {
    itemStatus: "running",
    clinicId: IDS.clinic,
    deploymentRunKey: "deployment-run-001",
    sessionId: IDS.session,
    executionKey: "execution-001",
    itemId: IDS.item,
    executionItemKey: "execution-001:hardware-binding-001",
    planItemKey: "plan-001:hardware-binding-001",
    sequence: 40,
    entityType: "hardware_binding",
    entityId: IDS.hardware,
    deploymentHardwareKey: "hardware-001",
    action: "bind",
    claimantId: "setup-runtime",
    ownershipToken: IDS.token,
    expectedLeaseExpiresAt: "2026-07-21T13:00:00.000Z",
    startedAt: "2026-07-21T12:00:00.000Z",
    attemptCount: 1,
    expectedCurrentState: {
      deploymentHardwareKey: "hardware-001",
      hardwareId: IDS.hardware,
      targetDeploymentKey: targetKey,
      targetId: null,
      targetType,
    },
    targetState: {
      hardwareId: IDS.hardware,
      targetDeploymentKey: targetKey,
      targetId,
      targetType,
    },
    proposedBoundAt: "2026-07-21T12:05:00.000Z",
  };
}

function evidence(
  input: DeploymentHardwareBindingExecutionInput,
  status: DeploymentHardwareBindingStatus,
): DeploymentHardwareBindingEvidence {
  const target = input.targetState!;
  const success = status === "bound" || status === "already_bound";
  const empty = { defaultWorkstationId: null, currentWorkstationId: null, defaultSterilizerId: null, currentSterilizerId: null };
  const resulting = target.targetType === "workstation"
    ? { ...empty, defaultWorkstationId: target.targetId as string, currentWorkstationId: target.targetId as string }
    : { ...empty, defaultSterilizerId: target.targetId as string, currentSterilizerId: target.targetId as string };
  return {
    ok: success,
    status,
    bindingWritten: status === "bound",
    hardwareId: input.entityId!,
    deploymentHardwareKey: input.deploymentHardwareKey!,
    targetType: target.targetType as DeploymentHardwareBindingTargetType,
    targetId: target.targetId as string,
    targetDeploymentKey: target.targetDeploymentKey as string,
    previousState: success ? (status === "already_bound" ? resulting : empty) : null,
    resultingState: success ? resulting : null,
    bindingTimestamp: success ? input.proposedBoundAt : null,
    issueCode: success ? null : `binding_${status}`,
    message: `Binding ${status}.`,
    downstream: { executionItemsCompleted: 0, dependenciesProgressed: 0, nextItemsStarted: 0, deploymentsFinalized: 0, rollbacksExecuted: 0 },
  };
}

function scenario(name: string, passed: boolean) {
  return { name, passed };
}
