import type { DeploymentHardwareBindingRepository } from "./deployment-hardware-binding-repository";
import { DeploymentHardwareBindingService } from "./deployment-hardware-binding-service";
import type {
  DeploymentHardwareBindingAtomicCommand,
  DeploymentHardwareBindingAtomicResult,
  DeploymentHardwareBindingSnapshot,
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
  token: "server-secret-ownership-token",
} as const;

export async function runDeploymentHardwareBindingServiceHarness() {
  const scenarios = [
    await validTarget("workstation"),
    await validTarget("sterilizer"),
    ...(await Promise.all(([
      "bound", "already_bound", "blocked", "conflict", "not_found", "error",
    ] as const).map(statusResult))),
    await invalidCommand("malformed UUID", { hardwareId: "not-a-uuid" }),
    await invalidCommand("unsupported target", { targetType: "printer" as DeploymentHardwareBindingTargetType }),
    await invalidCommand("mismatched state", {
      targetState: { ...command().targetState, targetId: IDS.sterilizer },
    }),
    await tokenRedaction(),
    await zeroDownstream(),
  ];
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

async function validTarget(targetType: DeploymentHardwareBindingTargetType) {
  const repository = new TestRepository();
  const input = command(targetType === "sterilizer" ? {
    targetType,
    targetId: IDS.sterilizer,
    expectedTargetDeploymentKey: "sterilizer-001",
  } : {});
  repository.result = atomicResult(input, "bound");
  const result = await new DeploymentHardwareBindingService(repository).bindHardware(input);
  return scenario(
    `valid ${targetType} command`,
    result.ok && result.status === "bound" && result.bindingWritten && repository.calls === 1,
  );
}

async function statusResult(status: DeploymentHardwareBindingStatus) {
  const repository = new TestRepository();
  const input = command();
  repository.result = atomicResult(input, status);
  const result = await new DeploymentHardwareBindingService(repository).bindHardware(input);
  const expectedOk = status === "bound" || status === "already_bound";
  return scenario(
    `${status} result mapping`,
    result.ok === expectedOk && result.status === status && repository.calls === 1,
  );
}

async function invalidCommand(
  name: string,
  override: Partial<DeploymentHardwareBindingAtomicCommand>,
) {
  const repository = new TestRepository();
  const input = command(override);
  const result = await new DeploymentHardwareBindingService(repository).bindHardware(input);
  return scenario(name, !result.ok && result.status === "blocked" && repository.calls === 0);
}

async function tokenRedaction() {
  const repository = new TestRepository();
  repository.failure = new Error(`failed with ${IDS.token}`);
  const result = await new DeploymentHardwareBindingService(repository).bindHardware(command());
  return scenario(
    "ownership token excluded from evidence",
    repository.calls === 1 && !JSON.stringify(result).includes(IDS.token),
  );
}

async function zeroDownstream() {
  const repository = new TestRepository();
  const input = command();
  repository.result = atomicResult(input, "bound");
  const result = await new DeploymentHardwareBindingService(repository).bindHardware(input);
  return scenario(
    "zero completion progression and finalization",
    Object.values(result.downstream).every((value) => value === 0),
  );
}

class TestRepository implements DeploymentHardwareBindingRepository {
  calls = 0;
  result: DeploymentHardwareBindingAtomicResult = atomicResult(command(), "bound");
  failure: unknown = null;

  async loadHardwareBindingSnapshot(): Promise<DeploymentHardwareBindingSnapshot> {
    throw new Error("Service foundation does not infer execution validity from snapshots.");
  }

  async bindHardwareAtomically(): Promise<DeploymentHardwareBindingAtomicResult> {
    this.calls += 1;
    if (this.failure) throw this.failure;
    return this.result;
  }
}

function command(
  override: Partial<DeploymentHardwareBindingAtomicCommand> = {},
): DeploymentHardwareBindingAtomicCommand {
  const targetType = override.targetType ?? "workstation";
  const targetId = override.targetId ?? IDS.workstation;
  const targetKey = override.expectedTargetDeploymentKey ?? "workstation-001";
  return {
    clinicId: IDS.clinic,
    deploymentRunKey: "deployment-run-001",
    sessionId: IDS.session,
    executionKey: "execution-001",
    claimantId: "setup-runtime",
    ownershipToken: IDS.token,
    expectedLeaseExpiresAt: "2026-01-01T13:00:00.000Z",
    itemId: IDS.item,
    executionItemKey: "execution-001:binding-001",
    planItemKey: "plan-001:binding-001",
    expectedSequence: 40,
    expectedEntityType: "hardware_binding",
    expectedEntityId: override.hardwareId ?? IDS.hardware,
    expectedAction: "bind",
    expectedItemStartedAt: "2026-01-01T12:00:00.000Z",
    expectedAttemptCount: 1,
    hardwareId: IDS.hardware,
    expectedHardwareKey: "hardware-001",
    targetType,
    targetId,
    expectedTargetDeploymentKey: targetKey,
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
    proposedBoundAt: "2026-01-01T12:05:00.000Z",
    ...override,
  };
}

function atomicResult(
  input: DeploymentHardwareBindingAtomicCommand,
  status: DeploymentHardwareBindingStatus,
): DeploymentHardwareBindingAtomicResult {
  const success = status === "bound" || status === "already_bound";
  const unbound = {
    defaultWorkstationId: null,
    currentWorkstationId: null,
    defaultSterilizerId: null,
    currentSterilizerId: null,
  };
  const bound = input.targetType === "workstation" ? {
    ...unbound,
    defaultWorkstationId: input.targetId,
    currentWorkstationId: input.targetId,
  } : {
    ...unbound,
    defaultSterilizerId: input.targetId,
    currentSterilizerId: input.targetId,
  };
  return {
    ok: success,
    status,
    bindingWritten: status === "bound",
    hardwareId: input.hardwareId,
    deploymentHardwareKey: input.expectedHardwareKey,
    targetType: input.targetType,
    targetId: input.targetId,
    targetDeploymentKey: input.expectedTargetDeploymentKey,
    previousState: success ? (status === "already_bound" ? bound : unbound) : null,
    resultingState: success ? bound : null,
    bindingTimestamp: success ? input.proposedBoundAt : null,
    issueCode: success ? null : `binding_${status}`,
    message: `Binding returned ${status}.`,
  };
}

function scenario(name: string, passed: boolean) {
  return { name, passed };
}
