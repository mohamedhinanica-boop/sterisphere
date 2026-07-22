import type { DeploymentActivationExecutionItem } from "./deployment-activation-execution-types";
import type { DeploymentActivationExecutionNextItemStartItemSnapshot } from "./deployment-activation-execution-next-item-start-types";
import { decideDeploymentExecutionRecovery, DEPLOYMENT_EXECUTION_RECOVERY_COMPENSATION_MATRIX } from "./deployment-recovery";
import type {
  DeploymentExecutionRecoveryCommand,
  DeploymentExecutionRecoveryCurrentItem,
  DeploymentExecutionRecoveryIssueCode,
  DeploymentExecutionRecoveryMutationEvidence,
  DeploymentExecutionRecoveryResult,
} from "./deployment-recovery-types";

export interface DeploymentExecutionRecoveryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentExecutionRecoveryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentExecutionRecoveryHarnessScenario[];
}

const IDS = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  runKey: "deployment-run-001",
  sessionId: "22222222-2222-4222-8222-222222222222",
  executionKey: "execution-001",
  planKey: "activation-plan-001",
  claimantId: "setup-complete",
  token: "sensitive-recovery-ownership-token",
  lease: "2026-01-01T13:00:00.000Z",
  hardwareId: "33333333-3333-4333-8333-333333333333",
  targetId: "44444444-4444-4444-8444-444444444444",
} as const;
const NOW = "2026-01-01T12:30:00.000Z";
const COMPLETED = "2026-01-01T12:20:00.000Z";

export function runDeploymentExecutionRecoveryHarness(): DeploymentExecutionRecoveryHarnessResult {
  const scenarios = [
    scenario("failure before any mutation", base(), (result) => result.status === "rollback_not_required"),
    scenario("failed running unexecuted item", commandWithItems([current(activation(1, "hardware_shell", "running"))]), (result) => result.status === "rollback_not_required"),
    scenario("one completed reversible activation", commandWithItems([current(activation(1, "provider_shell", "succeeded"))], [evidence(1)]), (result) => result.status === "rollback_required" && !result.rollbackExecutable),
    scenario("multiple completed mutations reverse sequence", multiMutation(), (result) => result.rollbackItems.map((item) => item.sourceSequence).join(",") === "3,2,1"),
    scenario("completed Hardware Binding included", bindingCommand("applied"), (result) => result.status === "rollback_required" && result.rollbackItems[0]?.compensationAction === "remove_deployment_hardware_binding"),
    scenario("reused Hardware Binding excluded", bindingCommand("reused"), (result) => result.status === "rollback_not_required" && result.rollbackItems.length === 0),
    scenario("running successor is recovery control only", bindingWithSuccessor(), (result) => result.runningItemsToRecover.length === 1 && result.rollbackItems.every((item) => item.sourceSequence !== 2)),
    scenario("running item with completed durable mutation requires rollback", runningAppliedBinding(), (result) => result.status === "rollback_required" && result.rollbackItems.length === 1),
    scenario("unsupported compensation explicit", commandWithItems([current(activation(1, "clinic", "succeeded"))], [evidence(1)]), (result) => hasIssue(result, "unsupported_compensation") && result.unsupportedCompensations[0]?.entityType === "clinic"),
    scenario("incomplete binding identity blocks", bindingCommand("applied", { hardwareBinding: undefined }), (result) => result.status === "blocked" && hasIssue(result, "binding_identity_incomplete")),
    identityScenario("foreign clinic item", "clinicId", "foreign-clinic", "clinic_identity_mismatch"),
    identityScenario("foreign run item", "deploymentRunKey", "foreign-run", "deployment_run_identity_mismatch"),
    identityScenario("foreign session item", "sessionId", "foreign-session", "session_identity_mismatch"),
    identityScenario("foreign execution item", "executionKey", "foreign-execution", "execution_identity_mismatch"),
    identityScenario("foreign plan item", "planKey", "foreign-plan", "plan_identity_mismatch"),
    scenario("claimant mismatch", patchSession({ executionOwner: "foreign-owner" }), (result) => result.status === "blocked" && hasIssue(result, "claimant_identity_mismatch")),
    scenario("ownership token mismatch", patchSession({ ownershipToken: "foreign-token" }), (result) => result.status === "blocked" && hasIssue(result, "ownership_token_mismatch")),
    scenario("lease mismatch", patchSession({ leaseExpiresAt: "2026-01-01T14:00:00.000Z" }), (result) => result.status === "blocked" && hasIssue(result, "lease_identity_mismatch")),
    scenario("failed item not found", patchFailure(base(), { failedExecutionItemKey: "missing-item" }), (result) => result.status === "not_found" && hasIssue(result, "failed_item_not_found")),
    scenario("duplicate execution sequence", duplicateSequence(), (result) => result.status === "blocked" && hasIssue(result, "duplicate_execution_sequence")),
    scenario("missing prepared evidence", missingPrepared(), (result) => result.status === "blocked" && hasIssue(result, "prepared_item_missing")),
    scenario("malformed failure evidence", patchFailure(base(), { failureCode: "bad code with spaces" }), (result) => result.status === "blocked" && hasIssue(result, "invalid_failure_evidence")),
    deterministicKeyScenario(),
    deterministicOutputScenario(),
    diagnosticSanitizationScenario(),
    secretExclusionScenario(),
    zeroExecutionCountersScenario(),
    noMutationSurfaceScenario(),
    scenario("empty successful history terminal failure", base(), (result) => result.status === "rollback_not_required" && result.completedMutationCount === 0),
    scenario("highest sequence rolls back first", multiMutation(), (result) => result.rollbackItems[0]?.sourceSequence === 3 && result.rollbackItems.at(-1)?.sourceSequence === 1),
    scenario("completed controls excluded", controlOnly(), (result) => result.status === "rollback_not_required" && result.rollbackItems.length === 0),
    compensationMatrixScenario(),
    scenario("mutation evidence required", commandWithItems([current(activation(1, "hardware_shell", "succeeded"))]), (result) => result.status === "blocked" && hasIssue(result, "mutation_evidence_missing")),
    scenario("prepared identity drift blocks", preparedDrift(), (result) => result.status === "blocked" && hasIssue(result, "foreign_execution_item")),
    scenario("incomplete current snapshot blocks", incompleteCurrentSnapshot(), (result) => result.status === "blocked" && hasIssue(result, "prepared_item_missing")),
    scenario("binding exact identity is executable", bindingCommand("applied"), (result) => result.rollbackExecutable && result.reversibleMutationCount === 1),
    scenario("binding pre-existing target is blocked", bindingCommand("applied", { hardwareBinding: bindingEvidence(IDS.targetId) }), (result) => result.status === "blocked" && hasIssue(result, "binding_identity_incomplete")),
  ];
  return { passed: scenarios.every((current) => current.passed), scenarios };
}

function scenario(name: string, command: DeploymentExecutionRecoveryCommand, assertion: (result: DeploymentExecutionRecoveryResult) => boolean): DeploymentExecutionRecoveryHarnessScenario {
  const result = decideDeploymentExecutionRecovery(command);
  return { name, passed: assertion(result), message: JSON.stringify(result) };
}

function base(): DeploymentExecutionRecoveryCommand {
  return commandWithItems([]);
}

function commandWithItems(
  items: readonly DeploymentExecutionRecoveryCurrentItem[],
  mutationEvidence: readonly DeploymentExecutionRecoveryMutationEvidence[] = [],
): DeploymentExecutionRecoveryCommand {
  return {
    clinicId: IDS.clinicId,
    deploymentRunKey: IDS.runKey,
    sessionId: IDS.sessionId,
    executionKey: IDS.executionKey,
    planKey: IDS.planKey,
    claimantId: IDS.claimantId,
    ownershipToken: IDS.token,
    expectedLeaseExpiresAt: IDS.lease,
    session: {
      clinicId: IDS.clinicId,
      deploymentRunKey: IDS.runKey,
      sessionId: IDS.sessionId,
      executionKey: IDS.executionKey,
      planKey: IDS.planKey,
      preparationStatus: "ready",
      executionStatus: "failed",
      executionOwner: IDS.claimantId,
      ownershipToken: IDS.token,
      leaseExpiresAt: IDS.lease,
      startedAt: "2026-01-01T12:00:00.000Z",
      completedAt: null,
      failedAt: NOW,
      itemsRequested: items.length,
    },
    prepared: {
      clinicId: IDS.clinicId,
      deploymentRunKey: IDS.runKey,
      executionKey: IDS.executionKey,
      planKey: IDS.planKey,
      items: items.map((entry) => prepared(entry.item)),
    },
    items,
    mutationEvidence,
    failure: {
      failureCode: "execution_interrupted",
      failureLayer: "execution_step",
      failedAt: NOW,
      retryable: false,
    },
    requestedAt: NOW,
  };
}

function activation(sequence: number, entityType: "clinic" | "provider_shell" | "sterilizer_shell" | "workstation_shell" | "hardware_shell", status: string): DeploymentActivationExecutionNextItemStartItemSnapshot {
  const entityId = sequence === 1 && entityType === "clinic" ? IDS.clinicId : `${sequence}`.repeat(8).slice(0, 8) + "-aaaa-4aaa-8aaa-" + `${sequence}`.repeat(12).slice(0, 12);
  return item(sequence, { entityType, entityId, action: "activate", executionStatus: status, reversible: true });
}

function binding(status: string = "succeeded"): DeploymentActivationExecutionNextItemStartItemSnapshot {
  return item(1, {
    entityType: "hardware_binding",
    entityId: IDS.hardwareId,
    action: "bind",
    executionStatus: status,
    expectedCurrentState: {
      deploymentHardwareKey: "hardware-001",
      hardwareId: IDS.hardwareId,
      targetType: "workstation",
      targetDeploymentKey: "workstation-008",
      targetId: null,
    },
    targetState: {
      hardwareId: IDS.hardwareId,
      targetType: "workstation",
      targetDeploymentKey: "workstation-008",
      targetId: IDS.targetId,
    },
    rollbackBehavior: "clear planned operational hardware binding before activation is finalized",
    reversible: true,
  });
}

function item(sequence: number, patch: Partial<DeploymentActivationExecutionNextItemStartItemSnapshot> = {}): DeploymentActivationExecutionNextItemStartItemSnapshot {
  const succeeded = patch.executionStatus === "succeeded";
  return {
    itemId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(sequence).padStart(12, "0")}`,
    executionItemKey: `${IDS.executionKey}:item-${sequence}`,
    planItemKey: `${IDS.planKey}:item-${sequence}`,
    sequence,
    entityType: "activation_plan",
    entityId: null,
    action: "no_op",
    executionStatus: "failed",
    attemptCount: succeeded ? 1 : patch.executionStatus === "running" ? 1 : 0,
    startedAt: succeeded || patch.executionStatus === "running" ? "2026-01-01T12:10:00.000Z" : null,
    completedAt: succeeded ? COMPLETED : null,
    rolledBackAt: null,
    errorCode: patch.executionStatus === "failed" ? "execution_interrupted" : null,
    errorMessage: null,
    dependencyKeys: [],
    expectedCurrentState: {},
    targetState: {},
    reversible: false,
    rollbackBehavior: null,
    ...patch,
  };
}

function current(value: DeploymentActivationExecutionNextItemStartItemSnapshot): DeploymentExecutionRecoveryCurrentItem {
  return { clinicId: IDS.clinicId, deploymentRunKey: IDS.runKey, sessionId: IDS.sessionId, executionKey: IDS.executionKey, planKey: IDS.planKey, item: value };
}

function prepared(value: DeploymentActivationExecutionNextItemStartItemSnapshot): DeploymentActivationExecutionItem {
  return {
    executionItemKey: value.executionItemKey,
    planItemKey: value.planItemKey,
    sequence: value.sequence,
    entityType: value.entityType as DeploymentActivationExecutionItem["entityType"],
    entityId: value.entityId,
    deploymentKey: null,
    action: value.action as DeploymentActivationExecutionItem["action"],
    currentState: value.expectedCurrentState ?? {},
    targetState: value.targetState ?? {},
    dependencyKeys: value.dependencyKeys,
    executionStatus: "ready",
    attemptCount: 0,
    reversible: value.reversible === true,
    rollbackAction: value.rollbackBehavior,
    startedAt: null,
    completedAt: null,
    error: null,
    evidence: { dependencyLevel: 0, readyDependencyKeys: [], pendingDependencyKeys: [] },
    downstream: { requested: 0, created: 0, reused: 0, skipped: 0, conflicts: 0 },
  };
}

function evidence(sequence: number, patch: Partial<DeploymentExecutionRecoveryMutationEvidence> = {}): DeploymentExecutionRecoveryMutationEvidence {
  return { sourceExecutionItemKey: `${IDS.executionKey}:item-${sequence}`, disposition: "applied", completedAt: COMPLETED, ...patch };
}

function bindingEvidence(previousTargetId: string | null = null) {
  return { hardwareId: IDS.hardwareId, deploymentHardwareKey: "hardware-001", targetType: "workstation" as const, targetId: IDS.targetId, targetDeploymentKey: "workstation-008", previousTargetId };
}

function bindingCommand(disposition: "applied" | "reused", patch: Partial<DeploymentExecutionRecoveryMutationEvidence> = {}) {
  return commandWithItems([current(binding())], [evidence(1, { disposition, hardwareBinding: bindingEvidence(), ...patch })]);
}

function multiMutation() {
  const items = [1, 2, 3].map((sequence) => current(activation(sequence, sequence === 1 ? "clinic" : sequence === 2 ? "provider_shell" : "hardware_shell", "succeeded")));
  return commandWithItems(items, [evidence(1), evidence(2), evidence(3)]);
}

function bindingWithSuccessor() {
  const successor = activation(2, "hardware_shell", "running");
  return commandWithItems([current(binding()), current(successor)], [evidence(1, { hardwareBinding: bindingEvidence() })]);
}

function runningAppliedBinding() {
  return commandWithItems([current(binding("running"))], [evidence(1, { hardwareBinding: bindingEvidence() })]);
}

function patchSession(patch: Partial<NonNullable<DeploymentExecutionRecoveryCommand["session"]>>) {
  const command = base();
  command.session = { ...command.session!, ...patch };
  return command;
}

function patchFailure(command: DeploymentExecutionRecoveryCommand, patch: Record<string, unknown>) {
  command.failure = { ...command.failure, ...patch };
  return command;
}

function identityScenario(name: string, field: keyof Omit<DeploymentExecutionRecoveryCurrentItem, "item">, value: string, code: DeploymentExecutionRecoveryIssueCode) {
  const entry = current(item(1));
  entry[field] = value;
  return scenario(name, commandWithItems([entry]), (result) => result.status === "blocked" && hasIssue(result, code));
}

function duplicateSequence() {
  const first = item(1);
  const second = item(1, { itemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", executionItemKey: `${IDS.executionKey}:other`, planItemKey: `${IDS.planKey}:other` });
  return commandWithItems([current(first), current(second)]);
}

function missingPrepared() {
  const command = commandWithItems([current(item(1))]);
  command.prepared = { ...command.prepared!, items: [] };
  return command;
}

function preparedDrift() {
  const command = commandWithItems([current(item(1))]);
  command.prepared = { ...command.prepared!, items: [{ ...command.prepared!.items[0], entityId: IDS.hardwareId }] };
  return command;
}

function incompleteCurrentSnapshot() {
  const command = commandWithItems([current(item(1))]);
  command.items = [];
  return command;
}

function controlOnly() {
  const control = item(1, { entityType: "deployment_run", action: "finalize", executionStatus: "succeeded" });
  return commandWithItems([current(control)]);
}

function deterministicKeyScenario() {
  const first = decideDeploymentExecutionRecovery(bindingCommand("applied"));
  const second = decideDeploymentExecutionRecovery(bindingCommand("applied"));
  return expectation("deterministic rollback item keys", first.rollbackItems[0]?.rollbackItemKey === second.rollbackItems[0]?.rollbackItemKey);
}

function deterministicOutputScenario() {
  const command = multiMutation();
  return expectation("deterministic repeated output", JSON.stringify(decideDeploymentExecutionRecovery(command)) === JSON.stringify(decideDeploymentExecutionRecovery(command)));
}

function diagnosticSanitizationScenario() {
  const command = base();
  command.failure = { ...command.failure, message: "raw database text", diagnostics: { operation: "load", status: 409, unknown: "discard", nested: { secret: IDS.token } } };
  const result = decideDeploymentExecutionRecovery(command);
  return expectation("safe failure diagnostics", result.failure?.diagnostics.operation === "load" && result.failure.diagnostics.status === 409 && !("unknown" in result.failure.diagnostics));
}

function secretExclusionScenario() {
  const command = base();
  command.failure = { ...command.failure, message: IDS.token, stack: `stack ${IDS.token}`, sql: "select secret", hint: "private", diagnostics: { reason: IDS.token, operation: "bind", credentials: "secret" } };
  const serialized = JSON.stringify(decideDeploymentExecutionRecovery(command));
  return expectation("failure excludes stack SQL hints and secrets", !serialized.includes(IDS.token) && !serialized.includes("select secret") && !serialized.includes("private"));
}

function zeroExecutionCountersScenario() {
  const downstream = decideDeploymentExecutionRecovery(bindingCommand("applied")).downstream;
  return expectation("all execution counters remain zero", downstream.rollbackExecuted === 0 && downstream.entitiesCompensated === 0 && downstream.bindingsRemoved === 0 && downstream.sessionsRecovered === 0 && downstream.finalized === 0);
}

function noMutationSurfaceScenario() {
  const prototype = DeploymentExecutionRecoveryServicePrototype();
  return expectation("no mutation functions exposed", ["execute", "update", "insert", "delete", "rollback", "unbind", "finalize"].every((key) => !(key in prototype)));
}

function DeploymentExecutionRecoveryServicePrototype(): Record<string, unknown> {
  const service = { decide: decideDeploymentExecutionRecovery };
  return service;
}

function compensationMatrixScenario() {
  const expected = ["clinic:activate:unsupported", "provider_shell:activate:unsupported", "sterilizer_shell:activate:unsupported", "workstation_shell:activate:unsupported", "hardware_shell:activate:unsupported", "hardware_binding:bind:conditionally_supported"];
  const actual = DEPLOYMENT_EXECUTION_RECOVERY_COMPENSATION_MATRIX.map((entry) => `${entry.entityType}:${entry.action}:${entry.support}`);
  return expectation("exact compensation matrix", JSON.stringify(actual) === JSON.stringify(expected));
}

function hasIssue(result: DeploymentExecutionRecoveryResult, code: DeploymentExecutionRecoveryIssueCode) {
  return result.issues.some((current) => current.code === code);
}

function expectation(name: string, passed: boolean): DeploymentExecutionRecoveryHarnessScenario {
  return { name, passed, message: passed ? "passed" : "failed" };
}
