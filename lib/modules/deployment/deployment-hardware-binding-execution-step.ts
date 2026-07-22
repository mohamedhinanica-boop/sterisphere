import type { ServerDeploymentActivationExecutionClaimResult } from "./deployment-activation-execution-claim-server";
import type { ServerDeploymentActivationExecutionNextItemStartResult } from "./deployment-activation-execution-next-item-start-server";
import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import type { DeploymentHardwareBindingExecutionResult } from "./deployment-hardware-binding-execution-adapter";
import type { DeploymentHardwareBindingItemCompletionResult } from "./deployment-hardware-binding-item-completion";
import type { DeploymentHardwareBindingDependencyProgressionResult } from "./deployment-hardware-binding-dependency-progression";
import type { DeploymentHardwareBindingSuccessorStartResult } from "./deployment-hardware-binding-successor-start";
import type { DeploymentHardwareBindingTargetType } from "./deployment-hardware-binding-types";

export type DeploymentHardwareBindingExecutionStepStatus =
  | "completed_step"
  | "completed_terminal_step"
  | "blocked"
  | "conflict"
  | "error";
export type DeploymentHardwareBindingExecutionStepStage = "eligibility" | "binding" | "completion" | "progression" | "successor_start";

export interface DeploymentHardwareBindingExecutionStepIssue {
  code: string;
  severity: "blocker" | "warning";
  stage: DeploymentHardwareBindingExecutionStepStage;
  message: string;
}

export interface DeploymentHardwareBindingExecutionStepDownstream {
  bindingsWritten: 0 | 1;
  bindingsReused: 0 | 1;
  itemsCompleted: 0 | 1;
  itemCompletionsReused: 0 | 1;
  dependenciesProgressed: 0 | 1;
  dependencyProgressionsReused: 0 | 1;
  itemsStarted: 0 | 1;
  itemStartsReused: 0 | 1;
  finalized: 0;
  rolledBack: 0;
}

export interface DeploymentHardwareBindingExecutionStepResult {
  ok: boolean;
  status: DeploymentHardwareBindingExecutionStepStatus;
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
  bindingStatus: string | null;
  bindingTimestamp: string | null;
  bindingWritten: boolean;
  bindingReused: boolean;
  completionStatus: string | null;
  completedAt: string | null;
  itemCompleted: boolean;
  itemCompletionReused: boolean;
  progressionStatus: string | null;
  progressedAt: string | null;
  dependencyProgressed: boolean;
  dependencyProgressionReused: boolean;
  successorExecutionItemKey: string | null;
  successorPlanItemKey: string | null;
  successorItemId: string | null;
  successorSequence: number | null;
  successorEntityType: string | null;
  successorEntityId: string | null;
  successorAction: string | null;
  successorStatus: string | null;
  startedAt: string | null;
  attemptCount: number;
  successorStarted: boolean;
  successorStartReused: boolean;
  stoppedAtStage: DeploymentHardwareBindingExecutionStepStage;
  issueCode: string | null;
  issues: readonly DeploymentHardwareBindingExecutionStepIssue[];
  downstream: DeploymentHardwareBindingExecutionStepDownstream;
}

export interface DeploymentHardwareBindingExecutionStepInput {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  planKey: string;
  claim: ServerDeploymentActivationExecutionClaimResult | null;
  ownershipToken: string | null;
  runningItems: readonly ServerDeploymentActivationExecutionNextItemStartResult[];
  preparedExecutionItems: readonly DeploymentActivationExecutionItem[];
  requestedAt: string;
}

export interface DeploymentHardwareBindingExecutionStepBoundaries {
  now(): string;
  executeBinding(input: { runningItem: ServerDeploymentActivationExecutionNextItemStartResult; executedAt: string }): Promise<DeploymentHardwareBindingExecutionResult>;
  completeItem(input: { binding: DeploymentHardwareBindingExecutionResult; runningItem: ServerDeploymentActivationExecutionNextItemStartResult; requestedAt: string }): Promise<DeploymentHardwareBindingItemCompletionResult>;
  progressDependencies(input: { binding: DeploymentHardwareBindingExecutionResult; completion: DeploymentHardwareBindingItemCompletionResult; requestedAt: string }): Promise<DeploymentHardwareBindingDependencyProgressionResult>;
  startSuccessor(input: { binding: DeploymentHardwareBindingExecutionResult; completion: DeploymentHardwareBindingItemCompletionResult; progression: DeploymentHardwareBindingDependencyProgressionResult; requestedAt: string }): Promise<DeploymentHardwareBindingSuccessorStartResult>;
}

export async function executeHardwareBindingExecutionStep(
  boundaries: DeploymentHardwareBindingExecutionStepBoundaries,
  input: DeploymentHardwareBindingExecutionStepInput,
): Promise<DeploymentHardwareBindingExecutionStepResult> {
  const eligible = validateEligibility(input);
  if (!eligible.ok) return sanitize(failure(input, eligible.item, "eligibility", "blocked", eligible.code, eligible.message), input.ownershipToken);
  const source = eligible.item;
  const planner = eligible.planner;

  let binding: DeploymentHardwareBindingExecutionResult;
  try {
    binding = await boundaries.executeBinding({ runningItem: source, executedAt: boundaries.now() });
  } catch {
    return sanitize(failure(input, source, "binding", "error", "binding_boundary_error", "Hardware Binding execution failed safely."), input.ownershipToken);
  }
  const bindingIssue = validateBinding(source, planner, binding);
  if (bindingIssue) return sanitize(failure(input, source, "binding", stageStatus(binding.status), bindingIssue.code, bindingIssue.message, { binding }), input.ownershipToken);

  let completion: DeploymentHardwareBindingItemCompletionResult;
  try {
    completion = await boundaries.completeItem({ binding, runningItem: source, requestedAt: boundaries.now() });
  } catch {
    return sanitize(failure(input, source, "completion", "error", "completion_boundary_error", "Hardware Binding completion failed safely.", { binding }), input.ownershipToken);
  }
  const completionIssue = validateCompletion(binding, completion);
  if (completionIssue) return sanitize(failure(input, source, "completion", stageStatus(completion.status), completionIssue.code, completionIssue.message, { binding, completion }), input.ownershipToken);

  let progression: DeploymentHardwareBindingDependencyProgressionResult;
  try {
    progression = await boundaries.progressDependencies({ binding, completion, requestedAt: boundaries.now() });
  } catch {
    return sanitize(failure(input, source, "progression", "error", "progression_boundary_error", "Hardware Binding dependency progression failed safely.", { binding, completion }), input.ownershipToken);
  }
  const terminal = isSafeTerminalProgression(progression);
  const progressionIssue = validateProgression(binding, completion, progression, terminal);
  if (progressionIssue) return sanitize(failure(input, source, "progression", stageStatus(progression.status), progressionIssue.code, progressionIssue.message, { binding, completion, progression }), input.ownershipToken);
  if (terminal) return sanitize(success(input, source, binding, completion, progression, null, "completed_terminal_step"), input.ownershipToken);

  let start: DeploymentHardwareBindingSuccessorStartResult;
  try {
    start = await boundaries.startSuccessor({ binding, completion, progression, requestedAt: boundaries.now() });
  } catch {
    return sanitize(failure(input, source, "successor_start", "error", "successor_start_boundary_error", "Hardware Binding successor start failed safely.", { binding, completion, progression }), input.ownershipToken);
  }
  const startIssue = validateStart(progression, start);
  if (startIssue) return sanitize(failure(input, source, "successor_start", stageStatus(start.status), startIssue.code, startIssue.message, { binding, completion, progression, start }), input.ownershipToken);
  return sanitize(success(input, source, binding, completion, progression, start, "completed_step"), input.ownershipToken);
}

type Eligible = { ok: true; item: ServerDeploymentActivationExecutionNextItemStartResult; planner: DeploymentActivationExecutionItem } | { ok: false; item: ServerDeploymentActivationExecutionNextItemStartResult | null; code: string; message: string };
function validateEligibility(input: DeploymentHardwareBindingExecutionStepInput): Eligible {
  const item = input.runningItems.length === 1 ? input.runningItems[0] : null;
  if (input.runningItems.length === 0) return { ok: false, item, code: "running_item_missing", message: "Exactly one running Hardware Binding item is required; none was provided." };
  if (input.runningItems.length !== 1) return { ok: false, item, code: "multiple_running_items", message: "Exactly one running Hardware Binding item is required." };
  if (!item) return { ok: false, item, code: "running_item_missing", message: "Exactly one running Hardware Binding item is required; none was provided." };
  if (!input.claim?.ok || !input.claim.claimantId || !input.ownershipToken || !input.claim.sessionId || !input.claim.executionKey || !input.claim.planKey) return { ok: false, item, code: "ownership_invalid", message: "Hardware Binding execution ownership evidence is unavailable." };
  if (!validTime(input.requestedAt) || !validTime(input.claim.leaseExpiresAt) || Date.parse(input.claim.leaseExpiresAt!) <= Date.parse(input.requestedAt)) return { ok: false, item, code: "lease_invalid", message: "Hardware Binding execution lease is unavailable or stale." };
  if (!item.ok || (item.status !== "started" && item.status !== "already_started") || item.result !== item.status) return { ok: false, item, code: "running_item_invalid", message: "Hardware Binding item is not safely running." };
  if (item.entityType !== "hardware_binding") return { ok: false, item, code: "entity_type_invalid", message: "Running item is not hardware_binding." };
  if (item.action !== "bind") return { ok: false, item, code: "action_invalid", message: "Running Hardware Binding action is not bind." };
  if (!item.itemId || !item.executionItemKey || !item.planItemKey || item.sequence === null || !validUuid(item.entityId) || item.attemptCount !== 1 || !validTime(item.startedAt)) return { ok: false, item, code: "source_identity_invalid", message: "Running Hardware Binding identity or lifecycle evidence is incomplete." };
  if (item.claimantId !== input.claim.claimantId || item.clinicId !== input.clinicId || item.deploymentRunKey !== input.deploymentRunKey || item.sessionId !== input.sessionId || item.executionKey !== input.executionKey || item.planKey !== input.planKey || input.claim.sessionId !== input.sessionId || input.claim.executionKey !== input.executionKey || input.claim.planKey !== input.planKey) return { ok: false, item, code: "execution_identity_mismatch", message: "Running Hardware Binding execution identity does not match the active claim." };
  const matches = input.preparedExecutionItems.filter((candidate) => candidate.executionItemKey === item.executionItemKey && candidate.planItemKey === item.planItemKey && candidate.sequence === item.sequence && candidate.entityType === item.entityType && candidate.entityId === item.entityId && candidate.action === item.action);
  if (matches.length !== 1) return { ok: false, item, code: "planner_identity_invalid", message: "Running Hardware Binding must match exactly one prepared execution item." };
  const planner = matches[0];
  const stateIssue = validatePlannerState(item, planner);
  return stateIssue ? { ok: false, item, code: "binding_target_invalid", message: stateIssue } : { ok: true, item, planner };
}

function validatePlannerState(item: ServerDeploymentActivationExecutionNextItemStartResult, planner: DeploymentActivationExecutionItem): string | null {
  const expected = planner.currentState;
  const target = planner.targetState;
  const targetType = target.targetType;
  if (!/^hardware-\d{3}$/.test(planner.deploymentKey ?? "")) return "Deployment Hardware key is malformed.";
  if (expected.hardwareId !== item.entityId || target.hardwareId !== item.entityId) return "Planner Hardware UUID does not match the running entity.";
  if (expected.deploymentHardwareKey !== planner.deploymentKey) return "Planner Hardware deployment key is inconsistent.";
  if (targetType !== "workstation" && targetType !== "sterilizer") return "Planner binding target type is unsupported.";
  if (expected.targetType !== targetType || expected.targetDeploymentKey !== target.targetDeploymentKey) return "Planner binding target evidence conflicts across states.";
  if (expected.targetId !== null && expected.targetId !== target.targetId) return "Planner binding would rebind an already-bound Hardware device.";
  if (!validUuid(target.targetId)) return "Planner target UUID is malformed.";
  const pattern = targetType === "workstation" ? /^workstation-\d{3}$/ : /^sterilizer-\d{3}$/;
  if (typeof target.targetDeploymentKey !== "string" || !pattern.test(target.targetDeploymentKey)) return "Planner target deployment key is malformed.";
  return null;
}

function validateBinding(source: ServerDeploymentActivationExecutionNextItemStartResult, planner: DeploymentActivationExecutionItem, value: DeploymentHardwareBindingExecutionResult) {
  if (!value || !["bound", "already_bound", "blocked", "conflict", "not_found", "error"].includes(String(value.status))) return issue("binding_response_malformed", "Hardware Binding execution returned an unknown status.");
  if (!value.ok || (value.status !== "bound" && value.status !== "already_bound")) return issue(safeIssueCode(value.issueCode, "binding_failed"), "Hardware Binding execution did not succeed safely.");
  if (!sameSource(value, source) || value.hardwareId !== source.entityId || value.deploymentHardwareKey !== planner.deploymentKey || value.targetType !== planner.targetState.targetType || value.targetId !== planner.targetState.targetId || value.targetDeploymentKey !== planner.targetState.targetDeploymentKey || value.bindingStatus !== value.status || !validTime(value.bindingTimestamp) || Date.parse(value.bindingTimestamp!) < Date.parse(source.startedAt!)) return issue("binding_response_malformed", "Hardware Binding execution returned malformed or mismatched evidence.");
  if ((value.status === "bound") !== value.bindingWritten) return issue("binding_response_malformed", "Hardware Binding write evidence does not match its status.");
  return null;
}

function validateCompletion(binding: DeploymentHardwareBindingExecutionResult, value: DeploymentHardwareBindingItemCompletionResult) {
  if (!value || !["completed", "already_completed", "blocked", "conflict", "not_found", "error"].includes(String(value.status))) return issue("completion_response_malformed", "Hardware Binding completion returned an unknown status.");
  if (!value.ok || (value.status !== "completed" && value.status !== "already_completed")) return issue(safeIssueCode(value.issueCode, "completion_failed"), "Hardware Binding completion did not succeed safely.");
  if (!sameEvidence(value, binding) || value.bindingStatus !== binding.status || value.bindingTimestamp !== binding.bindingTimestamp || !validTime(value.completedAt) || Date.parse(value.completedAt!) < Date.parse(binding.bindingTimestamp!) || value.completedCount !== (value.status === "completed" ? 1 : 0) || value.reusedCount !== (value.status === "already_completed" ? 1 : 0)) return issue("completion_response_malformed", "Hardware Binding completion returned malformed, mismatched, or non-causal evidence.");
  return null;
}

function validateProgression(binding: DeploymentHardwareBindingExecutionResult, completion: DeploymentHardwareBindingItemCompletionResult, value: DeploymentHardwareBindingDependencyProgressionResult, terminal: boolean) {
  if (!value || !["progressed", "already_progressed", "blocked", "conflict", "not_found", "error", "not_attempted"].includes(String(value.status))) return issue("progression_response_malformed", "Hardware Binding progression returned an unknown status.");
  if (!sameProgressionSource(value, completion) || !sameBindingTarget(value, binding) || value.completedAt !== completion.completedAt) return issue("progression_response_malformed", "Hardware Binding progression returned mismatched source evidence.");
  if (terminal) return null;
  if (!value.ok || (value.status !== "progressed" && value.status !== "already_progressed")) return issue(safeIssueCode(value.issueCode, "progression_failed"), "Hardware Binding dependency progression did not succeed safely.");
  if (!value.successorItemId || !value.successorExecutionItemKey || !value.successorPlanItemKey || value.successorSequence === null || value.successorEntityType !== "hardware_binding" || value.successorAction !== "bind" || !validUuid(value.successorEntityId) || value.successorStatus !== "ready") return issue("progression_response_malformed", "Hardware Binding progression returned malformed successor evidence.");
  if (value.status === "progressed" && (!validTime(value.progressedAt) || Date.parse(value.progressedAt!) < Date.parse(completion.completedAt!))) return issue("progression_response_malformed", "Hardware Binding progression timestamp predates completion.");
  if (value.status === "already_progressed" && value.progressedAt !== null && (!validTime(value.progressedAt) || Date.parse(value.progressedAt) < Date.parse(completion.completedAt!))) return issue("progression_response_malformed", "Reused Hardware Binding progression timestamp is invalid.");
  return null;
}

function validateStart(progression: DeploymentHardwareBindingDependencyProgressionResult, value: DeploymentHardwareBindingSuccessorStartResult) {
  if (!value || !["started", "already_started", "blocked", "conflict", "not_found", "error", "not_attempted"].includes(String(value.status))) return issue("successor_start_response_malformed", "Hardware Binding successor start returned an unknown status.");
  if (!value.ok || (value.status !== "started" && value.status !== "already_started")) return issue(safeIssueCode(value.issueCode, "successor_start_failed"), "Hardware Binding successor start did not succeed safely.");
  if (value.successorItemId !== progression.successorItemId || value.successorExecutionItemKey !== progression.successorExecutionItemKey || value.successorPlanItemKey !== progression.successorPlanItemKey || value.successorSequence !== progression.successorSequence || value.successorEntityType !== progression.successorEntityType || value.successorEntityId !== progression.successorEntityId || value.successorAction !== progression.successorAction || value.successorStatus !== "running" || !validTime(value.startedAt) || value.attemptCount !== 1 || (progression.progressedAt && Date.parse(value.startedAt!) < Date.parse(progression.progressedAt))) return issue("successor_start_response_malformed", "Hardware Binding successor start returned malformed, mismatched, or non-causal evidence.");
  return null;
}

function isSafeTerminalProgression(value: DeploymentHardwareBindingDependencyProgressionResult): boolean {
  return value.status === "not_found" && value.issueCode === "next_item_missing" && value.successorItemId === null && value.successorExecutionItemKey === null && value.successorPlanItemKey === null && value.successorSequence === null && value.successorEntityType === null && value.successorEntityId === null && value.successorAction === null;
}

function success(input: DeploymentHardwareBindingExecutionStepInput, source: ServerDeploymentActivationExecutionNextItemStartResult, binding: DeploymentHardwareBindingExecutionResult, completion: DeploymentHardwareBindingItemCompletionResult, progression: DeploymentHardwareBindingDependencyProgressionResult, start: DeploymentHardwareBindingSuccessorStartResult | null, status: "completed_step" | "completed_terminal_step"): DeploymentHardwareBindingExecutionStepResult {
  return build(input, source, status, status === "completed_step" ? "Hardware Binding execution step completed one source item and left its successor running and unexecuted." : "Hardware Binding execution step completed one terminal source item; no successor was started.", status === "completed_step" ? "successor_start" : "progression", [], binding, completion, progression, start);
}

function failure(input: DeploymentHardwareBindingExecutionStepInput, source: ServerDeploymentActivationExecutionNextItemStartResult | null, stage: DeploymentHardwareBindingExecutionStepStage, status: "blocked" | "conflict" | "error", code: string, message: string, evidence: { binding?: DeploymentHardwareBindingExecutionResult; completion?: DeploymentHardwareBindingItemCompletionResult; progression?: DeploymentHardwareBindingDependencyProgressionResult; start?: DeploymentHardwareBindingSuccessorStartResult } = {}): DeploymentHardwareBindingExecutionStepResult {
  return build(input, source, status, message, stage, [{ code, severity: "blocker", stage, message }], evidence.binding ?? null, evidence.completion ?? null, evidence.progression ?? null, evidence.start ?? null);
}

function build(input: DeploymentHardwareBindingExecutionStepInput, source: ServerDeploymentActivationExecutionNextItemStartResult | null, status: DeploymentHardwareBindingExecutionStepStatus, message: string, stage: DeploymentHardwareBindingExecutionStepStage, issues: readonly DeploymentHardwareBindingExecutionStepIssue[], binding: DeploymentHardwareBindingExecutionResult | null, completion: DeploymentHardwareBindingItemCompletionResult | null, progression: DeploymentHardwareBindingDependencyProgressionResult | null, start: DeploymentHardwareBindingSuccessorStartResult | null): DeploymentHardwareBindingExecutionStepResult {
  const bindingWritten = binding?.status === "bound";
  const bindingReused = binding?.status === "already_bound";
  const itemCompleted = completion?.status === "completed";
  const itemCompletionReused = completion?.status === "already_completed";
  const dependencyProgressed = progression?.status === "progressed";
  const dependencyProgressionReused = progression?.status === "already_progressed";
  const successorStarted = start?.status === "started";
  const successorStartReused = start?.status === "already_started";
  return {
    ok: status === "completed_step" || status === "completed_terminal_step", status, message,
    clinicId: source?.clinicId ?? input.clinicId, deploymentRunKey: source?.deploymentRunKey ?? input.deploymentRunKey,
    sessionId: source?.sessionId ?? input.sessionId, executionKey: source?.executionKey ?? input.executionKey,
    executionItemKey: source?.executionItemKey ?? null, planItemKey: source?.planItemKey ?? null, itemId: source?.itemId ?? null,
    sequence: source?.sequence ?? null, entityType: source?.entityType ?? null, entityId: source?.entityId ?? null, action: source?.action ?? null,
    hardwareId: binding?.hardwareId ?? source?.entityId ?? null, deploymentHardwareKey: binding?.deploymentHardwareKey ?? null,
    targetType: binding?.targetType ?? null, targetId: binding?.targetId ?? null, targetDeploymentKey: binding?.targetDeploymentKey ?? null,
    bindingStatus: binding?.status ?? null, bindingTimestamp: binding?.bindingTimestamp ?? null, bindingWritten, bindingReused,
    completionStatus: completion?.status ?? null, completedAt: completion?.completedAt ?? null, itemCompleted, itemCompletionReused,
    progressionStatus: progression?.status ?? null, progressedAt: progression?.progressedAt ?? null, dependencyProgressed, dependencyProgressionReused,
    successorExecutionItemKey: progression?.successorExecutionItemKey ?? null, successorPlanItemKey: progression?.successorPlanItemKey ?? null,
    successorItemId: progression?.successorItemId ?? null, successorSequence: progression?.successorSequence ?? null,
    successorEntityType: progression?.successorEntityType ?? null, successorEntityId: progression?.successorEntityId ?? null,
    successorAction: progression?.successorAction ?? null, successorStatus: start?.successorStatus ?? progression?.successorStatus ?? null,
    startedAt: start?.startedAt ?? null, attemptCount: start?.attemptCount ?? 0, successorStarted, successorStartReused,
    stoppedAtStage: stage, issueCode: issues[0]?.code ?? null, issues: [...issues],
    downstream: { bindingsWritten: bindingWritten ? 1 : 0, bindingsReused: bindingReused ? 1 : 0, itemsCompleted: itemCompleted ? 1 : 0,
      itemCompletionsReused: itemCompletionReused ? 1 : 0, dependenciesProgressed: dependencyProgressed ? 1 : 0,
      dependencyProgressionsReused: dependencyProgressionReused ? 1 : 0, itemsStarted: successorStarted ? 1 : 0,
      itemStartsReused: successorStartReused ? 1 : 0, finalized: 0, rolledBack: 0 },
  };
}

function sameSource(value: DeploymentHardwareBindingExecutionResult, source: ServerDeploymentActivationExecutionNextItemStartResult): boolean {
  return value.clinicId === source.clinicId && value.deploymentRunKey === source.deploymentRunKey && value.sessionId === source.sessionId && value.executionKey === source.executionKey && value.itemId === source.itemId && value.executionItemKey === source.executionItemKey && value.planItemKey === source.planItemKey && value.sequence === source.sequence && value.entityType === source.entityType && value.entityId === source.entityId && value.action === source.action;
}
function sameEvidence(left: DeploymentHardwareBindingItemCompletionResult, right: DeploymentHardwareBindingExecutionResult): boolean { return left.clinicId === right.clinicId && left.deploymentRunKey === right.deploymentRunKey && left.sessionId === right.sessionId && left.executionKey === right.executionKey && left.itemId === right.itemId && left.executionItemKey === right.executionItemKey && left.planItemKey === right.planItemKey && left.sequence === right.sequence && left.entityType === right.entityType && left.entityId === right.entityId && left.action === right.action && sameBindingTarget(left, right); }
function sameProgressionSource(left: DeploymentHardwareBindingDependencyProgressionResult, right: DeploymentHardwareBindingItemCompletionResult): boolean { return left.clinicId === right.clinicId && left.deploymentRunKey === right.deploymentRunKey && left.sessionId === right.sessionId && left.executionKey === right.executionKey && left.sourceItemId === right.itemId && left.sourceExecutionItemKey === right.executionItemKey && left.sourcePlanItemKey === right.planItemKey && left.sourceSequence === right.sequence && left.sourceEntityType === right.entityType && left.sourceEntityId === right.entityId && left.sourceAction === right.action; }
function sameBindingTarget(left: { hardwareId: string | null; deploymentHardwareKey: string | null; targetType: DeploymentHardwareBindingTargetType | null; targetId: string | null; targetDeploymentKey: string | null }, right: { hardwareId: string | null; deploymentHardwareKey: string | null; targetType: DeploymentHardwareBindingTargetType | null; targetId: string | null; targetDeploymentKey: string | null }): boolean { return left.hardwareId === right.hardwareId && left.deploymentHardwareKey === right.deploymentHardwareKey && left.targetType === right.targetType && left.targetId === right.targetId && left.targetDeploymentKey === right.targetDeploymentKey; }
function safeIssueCode(value: string | null, fallback: string): string { return value && /^[a-z0-9_]+$/i.test(value) ? value : fallback; }
function issue(code: string, message: string) { return { code, message }; }
function stageStatus(value: string): "blocked" | "conflict" | "error" { return value === "blocked" ? "blocked" : value === "conflict" ? "conflict" : "error"; }
function validTime(value: string | null): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function validUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function sanitize<T>(value: T, token: string | null): T { return clean(value, token) as T; }
function clean(value: unknown, token: string | null): unknown { if (typeof value === "string") return token ? value.split(token).join("[redacted]") : value; if (Array.isArray(value)) return value.map((entry) => clean(entry, token)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !key.toLowerCase().includes("token")).map(([key, entry]) => [key, clean(entry, token)])); return value; }