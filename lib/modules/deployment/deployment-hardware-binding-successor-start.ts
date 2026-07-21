import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import type { DeploymentHardwareBindingDependencyProgressionResult } from "./deployment-hardware-binding-dependency-progression";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";

export interface DeploymentHardwareBindingSuccessorStartInput {
  binding: DeploymentHardwareBindingExecutionResult;
  completion: DeploymentHardwareBindingItemCompletionResult;
  progression: DeploymentHardwareBindingDependencyProgressionResult;
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  requestedAt: string;
}

export type DeploymentHardwareBindingSuccessorStartInvoker = (
  input: DeploymentHardwareBindingSuccessorStartInput,
) => Promise<ServerDeploymentActivationExecutionNextItemStartResult>;

export interface DeploymentHardwareBindingSuccessorStartResult {
  ok: boolean;
  status: "started" | "already_started" | "blocked" | "conflict" | "not_found" | "error" | "not_attempted";
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
  successorExecutionItemKey: string | null;
  successorPlanItemKey: string | null;
  successorItemId: string | null;
  successorSequence: number | null;
  successorEntityType: string | null;
  successorEntityId: string | null;
  successorAction: string | null;
  previousSuccessorStatus: string | null;
  successorStatus: string | null;
  startedAt: string | null;
  attemptCount: number;
  startedCount: 0 | 1;
  reusedCount: 0 | 1;
  issueCode: string | null;
  issues: readonly { code: string; severity: "blocker" | "warning"; message: string }[];
  downstream: {
    bindingsWritten: 0 | 1;
    bindingsReused: 0 | 1;
    itemsCompleted: 0 | 1;
    dependenciesProgressed: 0 | 1;
    dependencyProgressionsReused: 0 | 1;
    itemsStarted: 0 | 1;
    itemStartsReused: 0 | 1;
    finalized: 0;
    rolledBack: 0;
  };
}

export async function startHardwareBindingSuccessor(
  invoker: DeploymentHardwareBindingSuccessorStartInvoker,
  input: DeploymentHardwareBindingSuccessorStartInput,
): Promise<DeploymentHardwareBindingSuccessorStartResult> {
  const invalid = validate(input);
  if (invalid) return failure(input, "blocked", "hardware_binding_successor_start_invalid", invalid);
  try {
    return mapStart(input, await invoker(input));
  } catch {
    return failure(input, "error", "hardware_binding_successor_start_error", "Hardware Binding successor start failed safely. No fallback mutation was attempted.");
  }
}

function validate(input: DeploymentHardwareBindingSuccessorStartInput): string | null {
  const { binding, completion, progression, claim } = input;
  if (!binding.ok || (binding.status !== "bound" && binding.status !== "already_bound")) return "Hardware Binding execution did not succeed.";
  if (!completion.ok || (completion.status !== "completed" && completion.status !== "already_completed")) return "Hardware Binding completion did not succeed.";
  if (!progression.ok || (progression.status !== "progressed" && progression.status !== "already_progressed")) return "Hardware Binding dependency progression did not succeed.";
  if (progression.successorStatus !== "ready") return "Hardware Binding successor is not ready.";
  if (progression.successorEntityType !== "hardware_binding" || progression.successorAction !== "bind") return "Successor start supports only hardware_binding:bind.";
  if (!progression.successorItemId || !progression.successorExecutionItemKey || !progression.successorPlanItemKey || progression.successorSequence === null || !progression.successorEntityId) return "Hardware Binding successor identity is incomplete.";
  if (progression.issues.some((issue) => issue.severity === "blocker")) return "Hardware Binding progression contains conflicting successor evidence.";
  if (!input.requestedAt || Number.isNaN(Date.parse(input.requestedAt))) return "Hardware Binding successor start timestamp is malformed.";
  if (progression.progressedAt && (Number.isNaN(Date.parse(progression.progressedAt)) || Date.parse(input.requestedAt) < Date.parse(progression.progressedAt))) return "Hardware Binding successor start timestamp predates dependency progression.";
  if (!claim?.ok || !claim.claimantId || !claim.leaseExpiresAt || Number.isNaN(Date.parse(claim.leaseExpiresAt)) || Date.parse(claim.leaseExpiresAt) <= Date.parse(input.requestedAt)) return "Hardware Binding successor ownership or lease evidence is unavailable or stale.";
  const sourcePairs: readonly [unknown, unknown][] = [
    [progression.clinicId, completion.clinicId], [progression.deploymentRunKey, completion.deploymentRunKey],
    [progression.sessionId, completion.sessionId], [progression.executionKey, completion.executionKey],
    [progression.sourceExecutionItemKey, completion.executionItemKey], [progression.sourcePlanItemKey, completion.planItemKey],
    [progression.sourceItemId, completion.itemId], [progression.sourceSequence, completion.sequence],
    [progression.sourceEntityType, completion.entityType], [progression.sourceEntityId, completion.entityId], [progression.sourceAction, completion.action],
    [progression.hardwareId, binding.hardwareId], [progression.deploymentHardwareKey, binding.deploymentHardwareKey],
    [progression.targetType, binding.targetType], [progression.targetId, binding.targetId], [progression.targetDeploymentKey, binding.targetDeploymentKey],
  ];
  if (sourcePairs.some(([actual, expected]) => actual !== expected)) return "Hardware Binding source, completion, and progression identities do not match.";
  if (claim.sessionId !== progression.sessionId || claim.executionKey !== progression.executionKey) return "Hardware Binding claim identity does not match progression evidence.";
  return null;
}

function mapStart(input: DeploymentHardwareBindingSuccessorStartInput, result: ServerDeploymentActivationExecutionNextItemStartResult): DeploymentHardwareBindingSuccessorStartResult {
  const allowed = ["started", "already_started", "blocked", "conflict", "not_found", "error"] as const;
  if (!allowed.includes(result.status as (typeof allowed)[number])) return failure(input, "error", "successor_start_response_malformed", "Hardware Binding successor start returned an unknown status.");
  const p = input.progression;
  if (result.itemId !== p.successorItemId || result.executionItemKey !== p.successorExecutionItemKey || result.planItemKey !== p.successorPlanItemKey || result.sequence !== p.successorSequence || result.entityType !== p.successorEntityType || result.entityId !== p.successorEntityId || result.action !== p.successorAction) return failure(input, "error", "successor_start_response_malformed", "Hardware Binding successor start returned a different item identity.");
  const success = result.status === "started" || result.status === "already_started";
  if (success && (!result.startedAt || Number.isNaN(Date.parse(result.startedAt)) || result.attemptCount !== 1 || (p.progressedAt && Date.parse(result.startedAt) < Date.parse(p.progressedAt)))) return failure(input, "error", "successor_start_response_malformed", "Hardware Binding successor start returned invalid lifecycle evidence.");
  return { ...base(input), ok: success, status: result.status, message: result.message, successorStatus: success ? "running" : p.successorStatus,
    startedAt: result.startedAt, attemptCount: result.attemptCount, startedCount: result.status === "started" ? 1 : 0,
    reusedCount: result.status === "already_started" ? 1 : 0, issueCode: result.issues[0]?.code ?? null,
    issues: result.issues.map((issue) => ({ code: issue.code, severity: issue.severity, message: issue.message })), downstream: downstream(input, result.status) };
}

function failure(input: DeploymentHardwareBindingSuccessorStartInput, status: "blocked" | "error", issueCode: string, message: string): DeploymentHardwareBindingSuccessorStartResult {
  return { ...base(input), ok: false, status, message, successorStatus: input.progression.successorStatus, startedAt: null, attemptCount: 0,
    startedCount: 0, reusedCount: 0, issueCode, issues: [{ code: issueCode, severity: "blocker", message }], downstream: downstream(input, status) };
}

function base(input: DeploymentHardwareBindingSuccessorStartInput) {
  const p = input.progression;
  return { clinicId: p.clinicId, deploymentRunKey: p.deploymentRunKey, sessionId: p.sessionId, executionKey: p.executionKey,
    sourceExecutionItemKey: p.sourceExecutionItemKey, sourcePlanItemKey: p.sourcePlanItemKey, sourceItemId: p.sourceItemId,
    sourceSequence: p.sourceSequence, sourceEntityType: p.sourceEntityType, sourceEntityId: p.sourceEntityId, sourceAction: p.sourceAction,
    successorExecutionItemKey: p.successorExecutionItemKey, successorPlanItemKey: p.successorPlanItemKey, successorItemId: p.successorItemId,
    successorSequence: p.successorSequence, successorEntityType: p.successorEntityType, successorEntityId: p.successorEntityId,
    successorAction: p.successorAction, previousSuccessorStatus: p.successorStatus };
}

function downstream(input: DeploymentHardwareBindingSuccessorStartInput, status: string): DeploymentHardwareBindingSuccessorStartResult["downstream"] {
  return { bindingsWritten: input.binding.status === "bound" ? 1 : 0, bindingsReused: input.binding.status === "already_bound" ? 1 : 0,
    itemsCompleted: input.completion.ok ? 1 : 0, dependenciesProgressed: input.progression.status === "progressed" ? 1 : 0,
    dependencyProgressionsReused: input.progression.status === "already_progressed" ? 1 : 0, itemsStarted: status === "started" ? 1 : 0,
    itemStartsReused: status === "already_started" ? 1 : 0, finalized: 0, rolledBack: 0 };
}
