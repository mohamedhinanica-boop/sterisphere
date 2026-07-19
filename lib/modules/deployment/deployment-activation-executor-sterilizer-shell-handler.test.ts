import { DeploymentActivationExecutorSterilizerShellHandler } from "./deployment-activation-executor-sterilizer-shell-handler";
import type { DeploymentActivationExecutorHandlerInput } from "./deployment-activation-executor-handler";
import type { ServerDeploymentSterilizerShellActivationResult } from "./deployment-sterilizer-shell-activation-server";
import type { ServerDeploymentSterilizerShellExecutionItemCompletionResult } from "./deployment-sterilizer-shell-execution-item-completion-server";

export async function runDeploymentActivationExecutorSterilizerShellHandlerHarness() {
  const calls: string[] = [];
  const commands: unknown[] = [];
  const runner = {
    async activateSterilizerShell(command: unknown) {
      calls.push("activation");
      commands.push(clone(command));
      return activationResult();
    },
    async completeSterilizerShellExecutionItem(command: unknown) {
      calls.push("completion");
      commands.push(clone(command));
      return completionResult();
    },
  };
  const source = input();
  const before = clone(source);
  const result = await new DeploymentActivationExecutorSterilizerShellHandler(runner).handle(source);
  const command = commands[0] as Record<string, unknown>;

  return {
    passed:
      calls.join(",") === "activation,completion" &&
      result.status === "handled" &&
      command.sterilizerId === STERILIZER_ID &&
      command.deploymentSterilizerKey === STERILIZER_KEY &&
      command.sterilizerId !== command.deploymentSterilizerKey &&
      command.clinicId === CLINIC_ID &&
      command.claimantId === CLAIMANT_ID &&
      command.ownershipToken === OWNERSHIP_TOKEN &&
      command.leaseExpiresAt === LEASE_EXPIRES_AT &&
      JSON.stringify(source) === JSON.stringify(before) &&
      !calls.includes("dependency_progression") &&
      !calls.includes("next_item_start"),
    calls,
    result,
  };
}

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const STERILIZER_ID = "22222222-2222-4222-8222-222222222222";
const STERILIZER_KEY = "sterilizer-001";
const CLAIMANT_ID = "setup-executor";
const OWNERSHIP_TOKEN = "secret-lease-token";
const LEASE_EXPIRES_AT = "2026-07-19T12:15:00.000Z";

function input(): DeploymentActivationExecutorHandlerInput {
  return {
    context: { claimantId: CLAIMANT_ID, ownershipToken: OWNERSHIP_TOKEN, leaseExpiresAt: LEASE_EXPIRES_AT, executedAt: "2026-07-19T12:05:00.000Z" },
    item: {
      clinicId: CLINIC_ID, deploymentRunKey: "run-001", sessionId: "33333333-3333-4333-8333-333333333333", executionKey: "execution-001", planKey: "plan-001",
      itemId: "44444444-4444-4444-8444-444444444444", executionItemKey: "execution-001:sterilizer-001", planItemKey: "plan-001:sterilizer-001", sequence: 3,
      entityType: "sterilizer_shell", entityId: STERILIZER_ID, deploymentKey: STERILIZER_KEY, action: "activate", executionStatus: "running", attemptCount: 1,
      startedAt: "2026-07-19T12:04:00.000Z", completedAt: null, rolledBackAt: null, errorCode: null, errorMessage: null,
      expectedCurrentState: { deploymentSterilizerKey: STERILIZER_KEY, provisioningSource: "setup_draft", provisioningStatus: "planned", active: false },
      targetState: { provisioningStatus: "active", active: true }, dependencyKeys: ["plan-001:provider-001"], reversible: false, rollbackBehavior: null,
    },
  };
}

function activationResult(): ServerDeploymentSterilizerShellActivationResult {
  return { ok: true, status: "activated", message: "activated", claimantId: CLAIMANT_ID, clinicId: CLINIC_ID, deploymentRunKey: "run-001", sessionId: "33333333-3333-4333-8333-333333333333", executionKey: "execution-001", planKey: "plan-001", itemId: "44444444-4444-4444-8444-444444444444", executionItemKey: "execution-001:sterilizer-001", planItemKey: "plan-001:sterilizer-001", sequence: 3, sterilizerId: STERILIZER_ID, deploymentSterilizerKey: STERILIZER_KEY, provisioningSourceBefore: "setup_draft", provisioningSourceAfter: "setup_draft", provisioningStatusBefore: "planned", provisioningStatusAfter: "active", activeBefore: false, activeAfter: true, activatedAt: "2026-07-19T12:05:00.000Z", result: "activated", activatedCount: 1, reusedCount: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], downstream: { sterilizersActivated: 0, itemsCompleted: 0, dependenciesProgressed: 0, bindingsWritten: 0, sessionsCompleted: 0, rollbacksExecuted: 0, deploymentFinalized: 0 } };
}

function completionResult(): ServerDeploymentSterilizerShellExecutionItemCompletionResult {
  return { ok: true, status: "completed", message: "completed", claimantId: CLAIMANT_ID, clinicId: CLINIC_ID, deploymentRunId: "run-001", sessionId: "33333333-3333-4333-8333-333333333333", executionKey: "execution-001", itemId: "44444444-4444-4444-8444-444444444444", executionItemKey: "execution-001:sterilizer-001", planItemKey: "plan-001:sterilizer-001", sequence: 3, entityType: "sterilizer_shell", entityId: STERILIZER_ID, deploymentSterilizerKey: STERILIZER_KEY, action: "activate", itemStatusBefore: "running", itemStatusAfter: "succeeded", attemptCount: 1, startedAt: "2026-07-19T12:04:00.000Z", completedAt: "2026-07-19T12:05:00.000Z", sterilizerId: STERILIZER_ID, sterilizerStatus: "active", sterilizerActive: true, completionResult: "completed", issueCode: null, completedCount: 1, reusedCount: 0, conflicts: 0, blockers: 0, warnings: 0, issues: [], diagnostics: null, downstream: { itemsCompleted: 0, dependenciesProgressed: 0, nextItemsStarted: 0, providersActivated: 0, sterilizersActivated: 0, workstationsActivated: 0, hardwareActivated: 0, bindingsWritten: 0, sessionsCompleted: 0, rollbacksExecuted: 0, deploymentFinalized: 0 } };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
