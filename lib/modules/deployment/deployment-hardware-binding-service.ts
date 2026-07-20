import type { DeploymentHardwareBindingRepository } from "./deployment-hardware-binding-repository";
import type {
  DeploymentHardwareBindingAtomicCommand,
  DeploymentHardwareBindingEvidence,
  DeploymentHardwareBindingState,
} from "./deployment-hardware-binding-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HARDWARE_KEY = /^hardware-[0-9]{3}$/;
const WORKSTATION_KEY = /^workstation-[0-9]{3}$/;
const STERILIZER_KEY = /^sterilizer-[0-9]{3}$/;

export class DeploymentHardwareBindingService {
  constructor(private readonly repository: DeploymentHardwareBindingRepository) {}

  async bindHardware(
    command: DeploymentHardwareBindingAtomicCommand,
  ): Promise<DeploymentHardwareBindingEvidence> {
    const validation = validateCommand(command);
    if (validation) return failure(command, "blocked", "binding_command_invalid", validation);

    try {
      const result = await this.repository.bindHardwareAtomically(command);
      return {
        ...result,
        previousState: cloneState(result.previousState),
        resultingState: cloneState(result.resultingState),
        message: sanitize(result.message, command.ownershipToken),
        downstream: zeroDownstream(),
      };
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "Unknown repository failure.";
      return failure(
        command,
        "error",
        "hardware_binding_repository_error",
        sanitize(detail, command.ownershipToken),
      );
    }
  }
}

export function validateHardwareBindingCommand(
  command: DeploymentHardwareBindingAtomicCommand,
): string | null {
  return validateCommand(command);
}

function validateCommand(command: DeploymentHardwareBindingAtomicCommand): string | null {
  if (command.expectedEntityType !== "hardware_binding" || command.expectedAction !== "bind") {
    return "Only the hardware_binding:bind lifecycle is supported.";
  }
  const uuids = [
    command.clinicId,
    command.sessionId,
    command.itemId,
    command.hardwareId,
    command.expectedEntityId,
    command.targetId,
  ];
  if (uuids.some((value) => !UUID.test(value))) return "A required UUID is malformed.";
  if (command.expectedEntityId !== command.hardwareId) {
    return "Execution entity UUID does not match the selected hardware UUID.";
  }
  if (!HARDWARE_KEY.test(command.expectedHardwareKey)) {
    return "Deployment hardware key is malformed.";
  }
  if (
    (command.targetType === "workstation" && !WORKSTATION_KEY.test(command.expectedTargetDeploymentKey)) ||
    (command.targetType === "sterilizer" && !STERILIZER_KEY.test(command.expectedTargetDeploymentKey)) ||
    (command.targetType !== "workstation" && command.targetType !== "sterilizer")
  ) {
    return "Target type or deterministic target deployment key is unsupported.";
  }
  if (
    !command.deploymentRunKey ||
    !command.executionKey ||
    !command.claimantId ||
    !command.ownershipToken ||
    !command.executionItemKey ||
    !command.planItemKey
  ) {
    return "Execution identity and server-only ownership evidence are required.";
  }
  if (
    command.expectedSequence < 1 ||
    !Number.isInteger(command.expectedSequence) ||
    command.expectedAttemptCount !== 1
  ) {
    return "Execution sequence or attempt evidence is invalid.";
  }
  if (
    !validTimestamp(command.expectedLeaseExpiresAt) ||
    !validTimestamp(command.expectedItemStartedAt) ||
    !validTimestamp(command.proposedBoundAt)
  ) {
    return "Execution timestamps are malformed.";
  }

  const expected = command.expectedCurrentState;
  const target = command.targetState;
  if (!hasExactKeys(expected, [
    "deploymentHardwareKey", "hardwareId", "targetDeploymentKey", "targetId", "targetType",
  ])) return "Expected current state does not match the five-field binding contract.";
  if (!hasExactKeys(target, [
    "hardwareId", "targetDeploymentKey", "targetId", "targetType",
  ])) return "Target state does not match the four-field binding contract.";
  if (
    expected.deploymentHardwareKey !== command.expectedHardwareKey ||
    expected.hardwareId !== command.hardwareId ||
    expected.targetDeploymentKey !== command.expectedTargetDeploymentKey ||
    expected.targetId !== null ||
    expected.targetType !== command.targetType
  ) return "Expected current state does not describe the selected unbound hardware.";
  if (
    target.hardwareId !== command.hardwareId ||
    target.targetDeploymentKey !== command.expectedTargetDeploymentKey ||
    target.targetId !== command.targetId ||
    target.targetType !== command.targetType
  ) return "Target state identity is inconsistent with the binding command.";
  return null;
}

function failure(
  command: DeploymentHardwareBindingAtomicCommand,
  status: "blocked" | "error",
  issueCode: string,
  message: string,
): DeploymentHardwareBindingEvidence {
  return {
    ok: false,
    status,
    bindingWritten: false,
    hardwareId: command.hardwareId,
    deploymentHardwareKey: command.expectedHardwareKey,
    targetType: command.targetType,
    targetId: command.targetId,
    targetDeploymentKey: command.expectedTargetDeploymentKey,
    previousState: null,
    resultingState: null,
    bindingTimestamp: null,
    issueCode,
    message: sanitize(message, command.ownershipToken),
    downstream: zeroDownstream(),
  };
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validTimestamp(value: string): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function cloneState(state: DeploymentHardwareBindingState | null): DeploymentHardwareBindingState | null {
  return state ? { ...state } : null;
}

function sanitize(value: string, token: string): string {
  return token ? value.split(token).join("[redacted]") : value;
}

function zeroDownstream(): DeploymentHardwareBindingEvidence["downstream"] {
  return {
    executionItemsCompleted: 0,
    dependenciesProgressed: 0,
    nextItemsStarted: 0,
    deploymentsFinalized: 0,
    rollbacksExecuted: 0,
  };
}
