import type { DeploymentHardwareBindingService } from "./deployment-hardware-binding-service";
import type {
  DeploymentHardwareBindingAtomicCommand,
  DeploymentHardwareBindingEvidence,
  DeploymentHardwareBindingState,
  DeploymentHardwareBindingStatus,
  DeploymentHardwareBindingTargetType,
} from "./deployment-hardware-binding-types";

export interface DeploymentHardwareBindingExecutionInput {
  itemStatus: string;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  itemId: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  deploymentHardwareKey: string | null;
  action: string | null;
  claimantId: string | null;
  ownershipToken: string | null;
  expectedLeaseExpiresAt: string | null;
  startedAt: string | null;
  attemptCount: number;
  expectedCurrentState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
  proposedBoundAt: string;
}

export interface DeploymentHardwareBindingExecutionIssue {
  code: string;
  severity: "blocker";
  message: string;
}

export interface DeploymentHardwareBindingExecutionResult {
  ok: boolean;
  status: DeploymentHardwareBindingStatus;
  message: string;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  executionItemKey: string | null;
  planItemKey: string | null;
  itemId: string | null;
  sequence: number | null;
  entityType: string | null;
  entityId: string | null;
  action: string | null;
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  targetType: DeploymentHardwareBindingTargetType | null;
  targetId: string | null;
  targetDeploymentKey: string | null;
  bindingWritten: boolean;
  bindingStatus: DeploymentHardwareBindingStatus | null;
  previousBindingState: DeploymentHardwareBindingState | null;
  resultingBindingState: DeploymentHardwareBindingState | null;
  bindingTimestamp: string | null;
  issueCode: string | null;
  issues: readonly DeploymentHardwareBindingExecutionIssue[];
  downstream: {
    bindingsWritten: 0 | 1;
    bindingsReused: 0 | 1;
    itemsCompleted: 0;
    dependenciesProgressed: 0;
    itemsStarted: 0;
    finalized: 0;
    rolledBack: 0;
  };
}

export type DeploymentHardwareBindingExecutionService = Pick<
  DeploymentHardwareBindingService,
  "bindHardware"
>;

export async function executeHardwareBinding(
  service: DeploymentHardwareBindingExecutionService,
  input: DeploymentHardwareBindingExecutionInput,
): Promise<DeploymentHardwareBindingExecutionResult> {
  const command = buildCommand(input);
  if ("message" in command) return blocked(input, command.message);

  const evidence = await service.bindHardware(command.command);
  return mapEvidence(input, evidence);
}

function buildCommand(input: DeploymentHardwareBindingExecutionInput):
  | { ok: true; command: DeploymentHardwareBindingAtomicCommand }
  | { ok: false; message: string } {
  if (input.itemStatus !== "running") return { ok: false, message: "Hardware Binding item is not running." };
  if (input.entityType !== "hardware_binding") return { ok: false, message: "Running item is not a Hardware Binding item." };
  if (input.action !== "bind") return { ok: false, message: "Hardware Binding item action is not bind." };
  if (
    !input.clinicId || !input.deploymentRunKey || !input.sessionId || !input.executionKey ||
    !input.itemId || !input.executionItemKey || !input.planItemKey || input.sequence === null ||
    !input.entityId || !input.deploymentHardwareKey || !input.claimantId || !input.ownershipToken ||
    !input.expectedLeaseExpiresAt || !input.startedAt || !input.expectedCurrentState || !input.targetState
  ) return { ok: false, message: "Hardware Binding execution or ownership evidence is incomplete." };

  const expected = input.expectedCurrentState;
  const target = input.targetState;
  const targetType = target.targetType;
  const targetId = target.targetId;
  const targetDeploymentKey = target.targetDeploymentKey;
  if (
    (targetType !== "workstation" && targetType !== "sterilizer") ||
    typeof targetId !== "string" ||
    typeof targetDeploymentKey !== "string" ||
    expected.hardwareId !== input.entityId ||
    expected.deploymentHardwareKey !== input.deploymentHardwareKey ||
    expected.targetId !== null ||
    expected.targetType !== targetType ||
    expected.targetDeploymentKey !== targetDeploymentKey ||
    target.hardwareId !== input.entityId
  ) return { ok: false, message: "Hardware Binding planner state is malformed or inconsistent." };

  return {
    ok: true,
    command: {
      clinicId: input.clinicId,
      deploymentRunKey: input.deploymentRunKey,
      sessionId: input.sessionId,
      executionKey: input.executionKey,
      claimantId: input.claimantId,
      ownershipToken: input.ownershipToken,
      expectedLeaseExpiresAt: input.expectedLeaseExpiresAt,
      itemId: input.itemId,
      executionItemKey: input.executionItemKey,
      planItemKey: input.planItemKey,
      expectedSequence: input.sequence,
      expectedEntityType: "hardware_binding",
      expectedEntityId: input.entityId,
      expectedAction: "bind",
      expectedItemStartedAt: input.startedAt,
      expectedAttemptCount: input.attemptCount,
      hardwareId: input.entityId,
      expectedHardwareKey: input.deploymentHardwareKey,
      targetType,
      targetId,
      expectedTargetDeploymentKey: targetDeploymentKey,
      expectedCurrentState: { ...expected },
      targetState: { ...target },
      proposedBoundAt: input.proposedBoundAt,
    },
  };
}

function mapEvidence(
  input: DeploymentHardwareBindingExecutionInput,
  evidence: DeploymentHardwareBindingEvidence,
): DeploymentHardwareBindingExecutionResult {
  const success = evidence.status === "bound" || evidence.status === "already_bound";
  const safeMessage = redact(evidence.message, input.ownershipToken);
  const issue = success ? [] : [{
    code: evidence.issueCode ?? "hardware_binding_failed",
    severity: "blocker" as const,
    message: safeMessage,
  }];
  return {
    ok: success,
    status: evidence.status,
    message: safeMessage,
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    executionItemKey: input.executionItemKey,
    planItemKey: input.planItemKey,
    itemId: input.itemId,
    sequence: input.sequence,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    hardwareId: evidence.hardwareId,
    deploymentHardwareKey: evidence.deploymentHardwareKey,
    targetType: evidence.targetType,
    targetId: evidence.targetId,
    targetDeploymentKey: evidence.targetDeploymentKey,
    bindingWritten: evidence.bindingWritten,
    bindingStatus: evidence.status,
    previousBindingState: evidence.previousState ? { ...evidence.previousState } : null,
    resultingBindingState: evidence.resultingState ? { ...evidence.resultingState } : null,
    bindingTimestamp: evidence.bindingTimestamp,
    issueCode: evidence.issueCode,
    issues: issue,
    downstream: downstream(evidence.status),
  };
}

function blocked(
  input: DeploymentHardwareBindingExecutionInput,
  message: string,
): DeploymentHardwareBindingExecutionResult {
  return {
    ok: false,
    status: "blocked",
    message,
    clinicId: input.clinicId,
    deploymentRunKey: input.deploymentRunKey,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    executionItemKey: input.executionItemKey,
    planItemKey: input.planItemKey,
    itemId: input.itemId,
    sequence: input.sequence,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    hardwareId: input.entityId,
    deploymentHardwareKey: input.deploymentHardwareKey,
    targetType: null,
    targetId: null,
    targetDeploymentKey: null,
    bindingWritten: false,
    bindingStatus: null,
    previousBindingState: null,
    resultingBindingState: null,
    bindingTimestamp: null,
    issueCode: "hardware_binding_execution_invalid",
    issues: [{ code: "hardware_binding_execution_invalid", severity: "blocker", message }],
    downstream: downstream("blocked"),
  };
}

function redact(value: string, ownershipToken: string | null): string {
  return ownershipToken ? value.split(ownershipToken).join("[redacted]") : value;
}

function downstream(status: DeploymentHardwareBindingStatus): DeploymentHardwareBindingExecutionResult["downstream"] {
  return {
    bindingsWritten: status === "bound" ? 1 : 0,
    bindingsReused: status === "already_bound" ? 1 : 0,
    itemsCompleted: 0,
    dependenciesProgressed: 0,
    itemsStarted: 0,
    finalized: 0,
    rolledBack: 0,
  };
}
