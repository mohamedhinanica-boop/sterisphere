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
  ServerDeploymentSterilizerShellActivationResult,
} from "./deployment-sterilizer-shell-activation-server";
import type {
  ServerDeploymentSterilizerShellExecutionItemCompletionResult,
} from "./deployment-sterilizer-shell-execution-item-completion-server";

export interface DeploymentActivationExecutorSterilizerShellRunner {
  activateSterilizerShell(command: SterilizerHandlerCommand): Promise<ServerDeploymentSterilizerShellActivationResult>;
  completeSterilizerShellExecutionItem(command: SterilizerHandlerCommand): Promise<ServerDeploymentSterilizerShellExecutionItemCompletionResult>;
}

export interface SterilizerHandlerCommand {
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
  sterilizerId: string | null;
  deploymentSterilizerKey: string | null;
  startedAt: string | null;
  attemptCount: number;
  expectedCurrentState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
  executedAt: string;
}

export class DeploymentActivationExecutorSterilizerShellHandler implements DeploymentActivationExecutorHandler {
  readonly handlerId = "deployment-activation-executor-sterilizer-shell-activate";
  readonly entityType = "sterilizer_shell";
  readonly action = "activate";

  constructor(private readonly runner: DeploymentActivationExecutorSterilizerShellRunner) {}

  async handle(input: DeploymentActivationExecutorHandlerInput): Promise<DeploymentActivationExecutorHandlerResult> {
    const command = buildCommand(input);
    const activation = await this.runner.activateSterilizerShell(command);
    if (!activation.ok) {
      return resultFromBoundary(input, this.handlerId, activation.status, activation.message, activation.issues, {
        phase: "activation",
        sterilizerId: activation.sterilizerId,
        deploymentSterilizerKey: activation.deploymentSterilizerKey,
        activationResult: activation.result,
      });
    }

    const completion = await this.runner.completeSterilizerShellExecutionItem(command);
    return resultFromBoundary(input, this.handlerId, completion.status, completion.message, completion.issues, {
      phase: "completion",
      sterilizerId: completion.sterilizerId,
      deploymentSterilizerKey: completion.deploymentSterilizerKey,
      activationResult: activation.result,
      completionResult: completion.completionResult,
      completedAt: completion.completedAt,
    });
  }
}

function buildCommand(input: DeploymentActivationExecutorHandlerInput): SterilizerHandlerCommand {
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
    sterilizerId: input.item.entityId,
    deploymentSterilizerKey: input.item.deploymentKey,
    startedAt: input.item.startedAt,
    attemptCount: input.item.attemptCount,
    expectedCurrentState: cloneRecord(input.item.expectedCurrentState),
    targetState: cloneRecord(input.item.targetState),
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
      dispatchKey: "sterilizer_shell:activate",
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
