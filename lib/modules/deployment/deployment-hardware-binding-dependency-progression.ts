import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type {
  ServerDeploymentActivationExecutionDependencyProgressionResult,
} from "./deployment-activation-execution-dependency-progression-server";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";
import type { DeploymentHardwareBindingTargetType } from "./deployment-hardware-binding-types";

export interface DeploymentHardwareBindingDependencyProgressionInput {
  binding: DeploymentHardwareBindingExecutionResult;
  completion: DeploymentHardwareBindingItemCompletionResult;
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  requestedAt: string;
}

export type DeploymentHardwareBindingDependencyProgressionInvoker = (
  input: DeploymentHardwareBindingDependencyProgressionInput,
) => Promise<ServerDeploymentActivationExecutionDependencyProgressionResult>;

export interface DeploymentHardwareBindingDependencyProgressionResult {
  ok: boolean;
  status: "progressed" | "already_progressed" | "blocked" | "conflict" | "not_found" | "error" | "not_attempted";
  message: string;
  clinicId: string | null;
  deploymentRunKey: string | null;
  sessionId: string | null;
  executionKey: string | null;
  sourceExecutionItemKey: string | null;
  sourcePlanItemKey: string | null;
  sourceItemId: string | null;
  sourceSequence: number | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceAction: string | null;
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  targetType: DeploymentHardwareBindingTargetType | null;
  targetId: string | null;
  targetDeploymentKey: string | null;
  completionStatus: string | null;
  completedAt: string | null;
  progressionStatus: string | null;
  progressedAt: string | null;
  progressedCount: 0 | 1;
  reusedCount: 0 | 1;
  successorExecutionItemKey: string | null;
  successorPlanItemKey: string | null;
  successorItemId: string | null;
  successorSequence: number | null;
  successorEntityType: string | null;
  successorEntityId: string | null;
  successorAction: string | null;
  successorStatus: string | null;
  issueCode: string | null;
  issues: readonly { code: string; severity: "blocker" | "warning"; message: string }[];
  downstream: {
    bindingsWritten: 0 | 1;
    bindingsReused: 0 | 1;
    itemsCompleted: 0 | 1;
    dependenciesProgressed: 0 | 1;
    dependencyProgressionsReused: 0 | 1;
    itemsStarted: 0;
    finalized: 0;
    rolledBack: 0;
  };
}

export async function progressHardwareBindingDependency(
  invoker: DeploymentHardwareBindingDependencyProgressionInvoker,
  input: DeploymentHardwareBindingDependencyProgressionInput,
): Promise<DeploymentHardwareBindingDependencyProgressionResult> {
  const invalid = validate(input);
  if (invalid) return failure(input, "blocked", "hardware_binding_progression_invalid", invalid);

  try {
    return mapProgression(input, await invoker(input));
  } catch {
    return failure(input, "error", "hardware_binding_progression_error", "Hardware Binding dependency progression failed safely. No fallback mutation was attempted.");
  }
}

function validate(input: DeploymentHardwareBindingDependencyProgressionInput): string | null {
  const { binding, completion, claim } = input;
  if (!binding.ok || (binding.status !== "bound" && binding.status !== "already_bound")) return "Hardware Binding execution did not succeed.";
  if (!completion.ok || (completion.status !== "completed" && completion.status !== "already_completed")) return "Hardware Binding item completion did not succeed.";
  if (completion.entityType !== "hardware_binding" || completion.action !== "bind") return "Dependency progression supports only completed hardware_binding:bind items.";
  if (!completion.completedAt || Number.isNaN(Date.parse(completion.completedAt))) return "Hardware Binding completion timestamp is missing or malformed.";
  if (!input.requestedAt || Number.isNaN(Date.parse(input.requestedAt)) || Date.parse(input.requestedAt) < Date.parse(completion.completedAt)) return "Dependency progression timestamp predates item completion.";
  if (!claim?.ok || !claim.claimantId || !claim.leaseExpiresAt || Date.parse(claim.leaseExpiresAt) <= Date.parse(input.requestedAt)) return "Hardware Binding progression ownership or lease evidence is unavailable or stale.";
  const keys: (keyof DeploymentHardwareBindingItemCompletionResult)[] = [
    "clinicId", "deploymentRunKey", "sessionId", "executionKey", "executionItemKey", "planItemKey", "itemId", "sequence",
    "entityType", "entityId", "action", "hardwareId", "deploymentHardwareKey", "targetType", "targetId", "targetDeploymentKey", "bindingStatus", "bindingTimestamp",
  ];
  for (const key of keys) if (completion[key] !== binding[key as keyof DeploymentHardwareBindingExecutionResult]) return `Hardware Binding completion ${String(key)} does not match binding evidence.`;
  if (completion.hardwareId !== completion.entityId || completion.bindingStatus !== binding.status) return "Hardware Binding source identity is inconsistent.";
  if (claim.sessionId !== completion.sessionId || claim.executionKey !== completion.executionKey) return "Hardware Binding claim identity does not match completion evidence.";
  return null;
}

function mapProgression(input: DeploymentHardwareBindingDependencyProgressionInput, result: ServerDeploymentActivationExecutionDependencyProgressionResult): DeploymentHardwareBindingDependencyProgressionResult {
  const allowed = ["progressed", "already_progressed", "blocked", "conflict", "not_found", "error"] as const;
  if (!allowed.includes(result.status as (typeof allowed)[number])) return failure(input, "error", "progression_response_malformed", "Hardware Binding dependency progression returned an unknown status.");
  const completion = input.completion;
  if (result.completedItemId !== completion.itemId || result.completedExecutionItemKey !== completion.executionItemKey || result.completedPlanItemKey !== completion.planItemKey || result.completedSequence !== completion.sequence || result.completedCompletedAt !== completion.completedAt) return failure(input, "error", "progression_response_malformed", "Hardware Binding dependency progression returned mismatched source evidence.");
  const success = result.status === "progressed" || result.status === "already_progressed";
  if (success && (!result.nextItemId || !result.nextExecutionItemKey || !result.nextPlanItemKey || result.nextSequence === null || result.statusAfter !== "ready")) return failure(input, "error", "progression_response_malformed", "Hardware Binding dependency progression returned malformed successor evidence.");
  return {
    ...base(input), ok: success, status: result.status, message: result.message,
    progressionStatus: result.progressionResult, progressedAt: result.status === "progressed" ? input.requestedAt : null,
    progressedCount: result.status === "progressed" ? 1 : 0, reusedCount: result.status === "already_progressed" ? 1 : 0,
    successorExecutionItemKey: result.nextExecutionItemKey, successorPlanItemKey: result.nextPlanItemKey,
    successorItemId: result.nextItemId, successorSequence: result.nextSequence, successorEntityType: result.nextEntityType,
    successorEntityId: result.nextEntityId, successorAction: result.nextAction, successorStatus: result.statusAfter,
    issueCode: result.issueCode, issues: result.issues.map((issue) => ({ code: issue.code, severity: issue.severity, message: issue.message })),
    downstream: downstream(input, result.status),
  };
}

function failure(input: DeploymentHardwareBindingDependencyProgressionInput, status: "blocked" | "error", issueCode: string, message: string): DeploymentHardwareBindingDependencyProgressionResult {
  return { ...base(input), ok: false, status, message, progressionStatus: null, progressedAt: null, progressedCount: 0, reusedCount: 0,
    successorExecutionItemKey: null, successorPlanItemKey: null, successorItemId: null, successorSequence: null, successorEntityType: null,
    successorEntityId: null, successorAction: null, successorStatus: null, issueCode, issues: [{ code: issueCode, severity: "blocker", message }], downstream: downstream(input, status) };
}

function base(input: DeploymentHardwareBindingDependencyProgressionInput) {
  const c = input.completion;
  return { clinicId: c.clinicId, deploymentRunKey: c.deploymentRunKey, sessionId: c.sessionId, executionKey: c.executionKey,
    sourceExecutionItemKey: c.executionItemKey, sourcePlanItemKey: c.planItemKey, sourceItemId: c.itemId, sourceSequence: c.sequence,
    sourceEntityType: c.entityType, sourceEntityId: c.entityId, sourceAction: c.action, hardwareId: c.hardwareId,
    deploymentHardwareKey: c.deploymentHardwareKey, targetType: c.targetType, targetId: c.targetId, targetDeploymentKey: c.targetDeploymentKey,
    completionStatus: c.status, completedAt: c.completedAt };
}

function downstream(input: DeploymentHardwareBindingDependencyProgressionInput, status: string): DeploymentHardwareBindingDependencyProgressionResult["downstream"] {
  return { bindingsWritten: input.binding.status === "bound" ? 1 : 0, bindingsReused: input.binding.status === "already_bound" ? 1 : 0,
    itemsCompleted: input.completion.ok ? 1 : 0, dependenciesProgressed: status === "progressed" ? 1 : 0,
    dependencyProgressionsReused: status === "already_progressed" ? 1 : 0, itemsStarted: 0, finalized: 0, rolledBack: 0 };
}
