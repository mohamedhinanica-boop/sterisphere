import type {
  DeploymentActivationExecutorHandler,
  DeploymentActivationExecutorHandlerInput,
} from "./deployment-activation-executor-handler";
import type {
  DeploymentActivationExecutorHandlerResult,
  DeploymentActivationExecutorIssue,
  DeploymentActivationExecutorStatus,
} from "./deployment-activation-executor-types";
import type {
  ServerDeploymentHardwareShellActivationResult,
} from "./deployment-hardware-shell-activation-server";
import type {
  ServerDeploymentHardwareShellExecutionItemCompletionResult,
} from "./deployment-hardware-shell-execution-item-completion-server";

export interface DeploymentActivationExecutorHardwareShellRunner {
  activateHardwareShell(command: HardwareHandlerCommand): Promise<ServerDeploymentHardwareShellActivationResult>;
  completeHardwareShellExecutionItem(command: HardwareHandlerCommand): Promise<ServerDeploymentHardwareShellExecutionItemCompletionResult>;
}

export interface HardwareHandlerCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  leaseExpiresAt: string | null;
  itemId: string;
  executionItemKey: string;
  planItemKey: string;
  sequence: number;
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  startedAt: string | null;
  attemptCount: number;
  expectedCurrentState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
  dependencyKeys: readonly string[];
  reversible: boolean;
  rollbackBehavior: string | null;
  executedAt: string;
}

export class DeploymentActivationExecutorHardwareShellHandler implements DeploymentActivationExecutorHandler {
  readonly handlerId = "deployment-activation-executor-hardware-shell-activate";
  readonly entityType = "hardware_shell";
  readonly action = "activate";

  constructor(private readonly runner: DeploymentActivationExecutorHardwareShellRunner) {}

  async handle(input: DeploymentActivationExecutorHandlerInput): Promise<DeploymentActivationExecutorHandlerResult> {
    const command = buildCommand(input);
    const activation = await this.runner.activateHardwareShell(command);
    if (!activation.ok) {
      return resultFromBoundary(input, this.handlerId, activation.status, activation.message, activation.issues, {
        phase: "activation",
        hardwareId: activation.hardwareId,
        deploymentHardwareKey: activation.deploymentHardwareKey,
        activationResult: activation.result,
      });
    }

    const completion = await this.runner.completeHardwareShellExecutionItem(command);
    return resultFromBoundary(input, this.handlerId, completion.status, completion.message, completion.issues, {
      phase: "completion",
      hardwareId: completion.hardwareId,
      deploymentHardwareKey: completion.deploymentHardwareKey,
      activationResult: activation.result,
      completionResult: completion.completionResult,
      completedAt: completion.completedAt,
    });
  }
}

function buildCommand(input: DeploymentActivationExecutorHandlerInput): HardwareHandlerCommand {
  return {
    clinicId: input.item.clinicId,
    deploymentRunKey: input.item.deploymentRunKey,
    sessionId: input.item.sessionId,
    executionKey: input.item.executionKey,
    claimantId: input.context.claimantId,
    ownershipToken: input.context.ownershipToken,
    leaseExpiresAt: input.context.leaseExpiresAt,
    itemId: input.item.itemId,
    executionItemKey: input.item.executionItemKey,
    planItemKey: input.item.planItemKey,
    sequence: input.item.sequence,
    hardwareId: input.item.entityId,
    deploymentHardwareKey: input.item.deploymentKey,
    startedAt: input.item.startedAt,
    attemptCount: input.item.attemptCount,
    expectedCurrentState: cloneRecord(input.item.expectedCurrentState),
    targetState: cloneRecord(input.item.targetState),
    dependencyKeys: [...input.item.dependencyKeys],
    reversible: input.item.reversible,
    rollbackBehavior: input.item.rollbackBehavior,
    executedAt: input.context.executedAt,
  };
}

function resultFromBoundary(
  input: DeploymentActivationExecutorHandlerInput,
  handlerId: string,
  boundaryStatus: string,
  message: string,
  issues: readonly { code: string; severity: "blocker" | "warning"; message: string; diagnostics?: object | null }[],
  evidence: Record<string, unknown>,
): DeploymentActivationExecutorHandlerResult {
  return {
    status: mapStatus(boundaryStatus),
    message,
    issues: issues.map((issue): DeploymentActivationExecutorIssue => ({
      code: issue.severity === "warning" ? "handler_blocked" : issue.code.includes("not_found") || issue.code.includes("missing") ? "handler_not_found" : issue.code.includes("conflict") || issue.code.includes("mismatch") ? "handler_conflict" : issue.code.includes("error") || issue.code.includes("repository") ? "handler_error" : "handler_blocked",
      severity: issue.severity,
      message: issue.message,
      dispatchKey: "hardware_shell:activate",
      handlerId,
      sessionId: input.item.sessionId,
      executionKey: input.item.executionKey,
      executionItemKey: input.item.executionItemKey,
      planItemKey: input.item.planItemKey,
      sequence: input.item.sequence,
      diagnostics: issue.diagnostics ? { ...issue.diagnostics } : null,
    })),
    handlerEvidence: evidence,
  };
}

function mapStatus(status: string): DeploymentActivationExecutorStatus {
  if (status === "activated" || status === "completed") return "handled";
  if (status === "already_activated" || status === "already_completed") return "already_applied";
  if (["blocked", "conflict", "not_found", "error"].includes(status)) return status as DeploymentActivationExecutorStatus;
  return "error";
}

function cloneRecord(value: Record<string, unknown> | null): Record<string, unknown> | null {
  return value ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : null;
}
