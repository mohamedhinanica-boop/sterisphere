import type {
  DeploymentActivationExecutionAtomicItemCompletionCommand,
  DeploymentActivationExecutionAtomicItemCompletionResult,
} from "./deployment-activation-execution-item-completion-types";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingTargetType } from "./deployment-hardware-binding-types";

export interface DeploymentHardwareBindingCompletionRepository {
  completeExecutionItemAtomically(
    command: DeploymentActivationExecutionAtomicItemCompletionCommand,
  ): Promise<DeploymentActivationExecutionAtomicItemCompletionResult>;
}

export interface DeploymentHardwareBindingItemCompletionInput {
  binding: DeploymentHardwareBindingExecutionResult;
  itemStatus: string;
  claimantId: string | null;
  claimedClaimantId: string | null;
  ownershipToken: string | null;
  expectedLeaseExpiresAt: string | null;
  startedAt: string | null;
  attemptCount: number;
  runningItemId: string | null;
  runningExecutionItemKey: string | null;
  runningPlanItemKey: string | null;
  runningSequence: number | null;
  runningEntityType: string | null;
  runningEntityId: string | null;
  runningAction: string | null;
  plannerDeploymentHardwareKey: string | null;
  plannerExpectedState: Record<string, unknown> | null;
  plannerTargetState: Record<string, unknown> | null;
  proposedCompletedAt: string;
}

export interface DeploymentHardwareBindingItemCompletionResult {
  ok: boolean;
  status: "completed" | "already_completed" | "blocked" | "conflict" | "not_found" | "error";
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
  bindingStatus: "bound" | "already_bound" | null;
  bindingTimestamp: string | null;
  completionStatus: string | null;
  completedAt: string | null;
  completedCount: 0 | 1;
  reusedCount: 0 | 1;
  issueCode: string | null;
  issues: readonly { code: string; severity: "blocker"; message: string }[];
  downstream: {
    bindingsWritten: 0 | 1;
    bindingsReused: 0 | 1;
    itemsCompleted: 0 | 1;
    dependenciesProgressed: 0;
    itemsStarted: 0;
    finalized: 0;
    rolledBack: 0;
  };
}

export class DeploymentHardwareBindingItemCompletionService {
  constructor(private readonly repository: DeploymentHardwareBindingCompletionRepository) {}

  async complete(
    input: DeploymentHardwareBindingItemCompletionInput,
  ): Promise<DeploymentHardwareBindingItemCompletionResult> {
    const invalid = validate(input);
    if (invalid) return failure(input, "blocked", "hardware_binding_completion_invalid", invalid);

    const binding = input.binding;
    const command: DeploymentActivationExecutionAtomicItemCompletionCommand = {
      clinicId: binding.clinicId!,
      deploymentRunId: binding.deploymentRunKey!,
      sessionId: binding.sessionId!,
      executionKey: binding.executionKey!,
      claimantId: input.claimantId!,
      ownershipToken: input.ownershipToken!,
      expectedLeaseExpiresAt: input.expectedLeaseExpiresAt!,
      itemId: binding.itemId!,
      executionItemKey: binding.executionItemKey!,
      planItemKey: binding.planItemKey!,
      expectedSequence: binding.sequence!,
      expectedEntityType: "hardware_binding",
      expectedAction: "bind",
      expectedStartedAt: input.startedAt!,
      expectedAttemptCount: input.attemptCount,
      proposedCompletedAt: input.proposedCompletedAt,
    };

    try {
      const result = await this.repository.completeExecutionItemAtomically(command);
      return mapResult(input, result);
    } catch {
      return failure(
        input,
        "error",
        "hardware_binding_completion_repository_error",
        "Hardware Binding item completion failed safely. No fallback mutation was attempted.",
      );
    }
  }
}

function validate(input: DeploymentHardwareBindingItemCompletionInput): string | null {
  const binding = input.binding;
  if (!binding.ok || (binding.status !== "bound" && binding.status !== "already_bound")) {
    return "Hardware Binding execution did not produce completion-eligible success evidence.";
  }
  if (input.itemStatus !== "running") return "Hardware Binding execution item is not running.";
  if (binding.entityType !== "hardware_binding" || binding.action !== "bind") {
    return "Completion supports only hardware_binding:bind.";
  }
  if (
    !input.claimantId || !input.claimedClaimantId || input.claimantId !== input.claimedClaimantId ||
    !input.ownershipToken || !input.expectedLeaseExpiresAt || !input.startedAt ||
    !binding.clinicId || !binding.deploymentRunKey || !binding.sessionId || !binding.executionKey ||
    !binding.itemId || !binding.executionItemKey || !binding.planItemKey || binding.sequence === null ||
    !binding.entityId || !binding.hardwareId || !binding.deploymentHardwareKey ||
    !binding.targetType || !binding.targetId || !binding.targetDeploymentKey || !binding.bindingTimestamp
  ) return "Hardware Binding completion identity or ownership evidence is incomplete.";
  if (
    input.runningItemId !== binding.itemId || input.runningExecutionItemKey !== binding.executionItemKey ||
    input.runningPlanItemKey !== binding.planItemKey || input.runningSequence !== binding.sequence ||
    input.runningEntityType !== binding.entityType || input.runningEntityId !== binding.entityId ||
    input.runningAction !== binding.action
  ) return "Hardware Binding result does not match the running execution item identity.";
  if (
    Number.isNaN(Date.parse(input.expectedLeaseExpiresAt)) ||
    Number.isNaN(Date.parse(input.startedAt)) ||
    Number.isNaN(Date.parse(input.proposedCompletedAt)) ||
    Date.parse(input.expectedLeaseExpiresAt) <= Date.parse(input.proposedCompletedAt)
  ) return "Hardware Binding completion lease or timestamp evidence is stale or malformed.";
  if (
    binding.entityId !== binding.hardwareId ||
    input.plannerDeploymentHardwareKey !== binding.deploymentHardwareKey ||
    !input.plannerExpectedState || !input.plannerTargetState ||
    input.plannerExpectedState.hardwareId !== binding.hardwareId ||
    input.plannerExpectedState.deploymentHardwareKey !== binding.deploymentHardwareKey ||
    input.plannerExpectedState.targetType !== binding.targetType ||
    input.plannerExpectedState.targetDeploymentKey !== binding.targetDeploymentKey ||
    input.plannerTargetState.hardwareId !== binding.hardwareId ||
    input.plannerTargetState.targetType !== binding.targetType ||
    input.plannerTargetState.targetId !== binding.targetId ||
    input.plannerTargetState.targetDeploymentKey !== binding.targetDeploymentKey
  ) return "Hardware Binding result does not match the running item and planner identities.";
  if (input.attemptCount !== 1) return "Hardware Binding completion requires exactly one attempt.";
  return null;
}

function mapResult(
  input: DeploymentHardwareBindingItemCompletionInput,
  result: DeploymentActivationExecutionAtomicItemCompletionResult,
): DeploymentHardwareBindingItemCompletionResult {
  const allowed = ["completed", "already_completed", "blocked", "conflict", "not_found", "error"] as const;
  if (!allowed.includes(result.status as (typeof allowed)[number])) {
    return failure(input, "error", "completion_response_malformed", "Hardware Binding completion returned an unknown status.");
  }
  const binding = input.binding;
  if (
    result.itemId !== binding.itemId || result.executionItemKey !== binding.executionItemKey ||
    result.planItemKey !== binding.planItemKey || result.sequence !== binding.sequence ||
    result.entityType !== "hardware_binding" || result.action !== "bind" ||
    result.startedAt !== input.startedAt || result.attemptCount !== input.attemptCount
  ) return failure(input, "error", "completion_response_malformed", "Hardware Binding completion returned mismatched item evidence.");
  const success = result.status === "completed" || result.status === "already_completed";
  if (success && (!result.completedAt || result.executionStatusAfter !== "succeeded")) {
    return failure(input, "error", "completion_response_malformed", "Hardware Binding completion returned incomplete success evidence.");
  }
  const safeMessage = redact(result.message, input.ownershipToken);
  return {
    ...base(input),
    ok: success,
    status: result.status,
    message: safeMessage,
    completionStatus: result.status,
    completedAt: result.completedAt,
    completedCount: result.status === "completed" ? 1 : 0,
    reusedCount: result.status === "already_completed" ? 1 : 0,
    issueCode: result.issueCode,
    issues: success ? [] : [{ code: result.issueCode ?? "hardware_binding_completion_failed", severity: "blocker", message: safeMessage }],
    downstream: downstream(input, success),
  };
}

function failure(
  input: DeploymentHardwareBindingItemCompletionInput,
  status: "blocked" | "error",
  issueCode: string,
  message: string,
): DeploymentHardwareBindingItemCompletionResult {
  const safeMessage = redact(message, input.ownershipToken);
  return {
    ...base(input), ok: false, status, message: safeMessage, completionStatus: null,
    completedAt: null, completedCount: 0, reusedCount: 0, issueCode,
    issues: [{ code: issueCode, severity: "blocker", message: safeMessage }],
    downstream: downstream(input, false),
  };
}

function base(input: DeploymentHardwareBindingItemCompletionInput) {
  const binding = input.binding;
  return {
    clinicId: binding.clinicId,
    deploymentRunKey: binding.deploymentRunKey,
    sessionId: binding.sessionId,
    executionKey: binding.executionKey,
    executionItemKey: binding.executionItemKey,
    planItemKey: binding.planItemKey,
    itemId: binding.itemId,
    sequence: binding.sequence,
    entityType: binding.entityType,
    entityId: binding.entityId,
    action: binding.action,
    hardwareId: binding.hardwareId,
    deploymentHardwareKey: binding.deploymentHardwareKey,
    targetType: binding.targetType,
    targetId: binding.targetId,
    targetDeploymentKey: binding.targetDeploymentKey,
    bindingStatus: binding.status === "bound" || binding.status === "already_bound" ? binding.status : null,
    bindingTimestamp: binding.bindingTimestamp,
  };
}

function downstream(input: DeploymentHardwareBindingItemCompletionInput, completed: boolean): DeploymentHardwareBindingItemCompletionResult["downstream"] {
  return {
    bindingsWritten: input.binding.status === "bound" ? 1 : 0,
    bindingsReused: input.binding.status === "already_bound" ? 1 : 0,
    itemsCompleted: completed ? 1 : 0,
    dependenciesProgressed: 0,
    itemsStarted: 0,
    finalized: 0,
    rolledBack: 0,
  };
}

function redact(value: string, token: string | null): string {
  return token ? value.split(token).join("[redacted]") : value;
}
