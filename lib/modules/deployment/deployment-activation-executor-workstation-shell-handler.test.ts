import { DeploymentActivationExecutorWorkstationShellHandler } from "./deployment-activation-executor-workstation-shell-handler";
import type { DeploymentActivationExecutorHandlerInput } from "./deployment-activation-executor-handler";
import type { ServerDeploymentWorkstationShellActivationResult } from "./deployment-workstation-shell-activation-server";
import type { ServerDeploymentWorkstationShellExecutionItemCompletionResult } from "./deployment-workstation-shell-execution-item-completion-server";

export async function runDeploymentActivationExecutorWorkstationShellHandlerHarness() {
  const calls: string[] = [];
  const commands: unknown[] = [];
  const runner = {
    async activateWorkstationShell(command: unknown) {
      calls.push("activation");
      commands.push(clone(command));
      return activationResult();
    },
    async completeWorkstationShellExecutionItem(command: unknown) {
      calls.push("completion");
      commands.push(clone(command));
      return completionResult();
    },
  };
  const source = input();
  const before = clone(source);
  const result = await new DeploymentActivationExecutorWorkstationShellHandler(runner).handle(source);
  const command = commands[0] as Record<string, unknown>;

  const activationFailureCalls: string[] = [];
  const activationFailure = await new DeploymentActivationExecutorWorkstationShellHandler({
    async activateWorkstationShell() {
      activationFailureCalls.push("activation");
      return { ...activationResult(), ok: false as const, status: "blocked" as const, message: "activation blocked" };
    },
    async completeWorkstationShellExecutionItem() {
      activationFailureCalls.push("completion");
      return completionResult();
    },
  }).handle(input());

  const completionFailureCalls: string[] = [];
  const completionFailure = await new DeploymentActivationExecutorWorkstationShellHandler({
    async activateWorkstationShell() {
      completionFailureCalls.push("activation");
      return activationResult();
    },
    async completeWorkstationShellExecutionItem() {
      completionFailureCalls.push("completion");
      return { ...completionResult(), ok: false as const, status: "conflict" as const, message: "completion conflict" };
    },
  }).handle(input());

  return {
    passed:
      calls.join(",") === "activation,completion" &&
      result.status === "handled" &&
      command.workstationId === WORKSTATION_ID &&
      command.deploymentWorkstationKey === WORKSTATION_KEY &&
      command.workstationId !== command.deploymentWorkstationKey &&
      command.clinicId === CLINIC_ID &&
      command.claimantId === CLAIMANT_ID &&
      command.ownershipToken === OWNERSHIP_TOKEN &&
      command.leaseExpiresAt === LEASE_EXPIRES_AT &&
      JSON.stringify(command.dependencyKeys) === JSON.stringify(["plan-001:provider-001"]) &&
      command.reversible === false &&
      command.rollbackBehavior === null &&
      JSON.stringify(commands[0]) === JSON.stringify(commands[1]) &&
      activationFailureCalls.join(",") === "activation" &&
      activationFailure.status === "blocked" &&
      completionFailureCalls.join(",") === "activation,completion" &&
      completionFailure.status === "conflict" &&
      JSON.stringify(source) === JSON.stringify(before) &&
      !calls.includes("dependency_progression") &&
      !calls.includes("next_item_start"),
    calls,
    activationFailureCalls,
    completionFailureCalls,
    result,
    activationFailure,
    completionFailure,
  };
}

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const WORKSTATION_ID = "22222222-2222-4222-8222-222222222222";
const WORKSTATION_KEY = "workstation-001";
const CLAIMANT_ID = "setup-executor";
const OWNERSHIP_TOKEN = "secret-lease-token";
const LEASE_EXPIRES_AT = "2026-07-19T12:15:00.000Z";

function input(): DeploymentActivationExecutorHandlerInput {
  return {
    context: { claimantId: CLAIMANT_ID, ownershipToken: OWNERSHIP_TOKEN, leaseExpiresAt: LEASE_EXPIRES_AT, executedAt: "2026-07-19T12:05:00.000Z" },
    item: {
      clinicId: CLINIC_ID, deploymentRunKey: "run-001", sessionId: "33333333-3333-4333-8333-333333333333", executionKey: "execution-001", planKey: "plan-001",
      itemId: "44444444-4444-4444-8444-444444444444", executionItemKey: "execution-001:workstation-001", planItemKey: "plan-001:workstation-001", sequence: 3,
      entityType: "workstation_shell", entityId: WORKSTATION_ID, deploymentKey: WORKSTATION_KEY, action: "activate", executionStatus: "running", attemptCount: 1,
      startedAt: "2026-07-19T12:04:00.000Z", completedAt: null, rolledBackAt: null, errorCode: null, errorMessage: null,
      expectedCurrentState: { deploymentWorkstationKey: WORKSTATION_KEY, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false },
      targetState: { provisioningStatus: "active", active: true }, dependencyKeys: ["plan-001:provider-001"], reversible: false, rollbackBehavior: null,
    },
  };
}

function activationResult(): ServerDeploymentWorkstationShellActivationResult {
  return { ok: true, status: "activated", message: "activated", claimantId: CLAIMANT_ID, clinicId: CLINIC_ID, deploymentRunKey: "run-001", sessionId: "33333333-3333-4333-8333-333333333333", executionKey: "execution-001", planKey: "plan-001", itemId: "44444444-4444-4444-8444-444444444444", executionItemKey: "execution-001:workstation-001", planItemKey: "plan-001:workstation-001", sequence: 3, workstationId: WORKSTATION_ID, deploymentWorkstationKey: WORKSTATION_KEY, provisioningSourceBefore: "setup_draft", provisioningSourceAfter: "setup_draft", provisioningStatusBefore: "planned", provisioningStatusAfter: "active", activeBefore: false, activeAfter: true, activatedAt: "2026-07-19T12:05:00.000Z", result: "activated", activatedCount: 1, reusedCount: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], downstream: { workstationsActivated: 0, itemsCompleted: 0, dependenciesProgressed: 0, bindingsWritten: 0, sessionsCompleted: 0, rollbacksExecuted: 0, deploymentFinalized: 0 } };
}

function completionResult(): ServerDeploymentWorkstationShellExecutionItemCompletionResult {
  return { ok: true, status: "completed", message: "completed", claimantId: CLAIMANT_ID, clinicId: CLINIC_ID, deploymentRunId: "run-001", sessionId: "33333333-3333-4333-8333-333333333333", executionKey: "execution-001", itemId: "44444444-4444-4444-8444-444444444444", executionItemKey: "execution-001:workstation-001", planItemKey: "plan-001:workstation-001", sequence: 3, entityType: "workstation_shell", entityId: WORKSTATION_ID, deploymentWorkstationKey: WORKSTATION_KEY, action: "activate", itemStatusBefore: "running", itemStatusAfter: "succeeded", attemptCount: 1, startedAt: "2026-07-19T12:04:00.000Z", completedAt: "2026-07-19T12:05:00.000Z", workstationId: WORKSTATION_ID, workstationStatus: "active", workstationActive: true, completionResult: "completed", issueCode: null, completedCount: 1, reusedCount: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], diagnostics: null, downstream: { itemsCompleted: 0, dependenciesProgressed: 0, nextItemsStarted: 0, providersActivated: 0, sterilizersActivated: 0, workstationsActivated: 0, hardwareActivated: 0, bindingsWritten: 0, sessionsCompleted: 0, rollbacksExecuted: 0, deploymentFinalized: 0 } };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
