import type {
  DeploymentActivationExecutorHandler,
  DeploymentActivationExecutorHandlerInput,
} from "./deployment-activation-executor-handler";
import type {
  DeploymentActivationExecutorHandlerResult,
  DeploymentActivationExecutorIssue,
  DeploymentActivationExecutorStatus,
} from "./deployment-activation-executor-types";

export type DeploymentActivationExecutorProviderShellActivationStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutorProviderShellActivationCommand {
  clinicId: string;
  deploymentRunKey: string;
  providerActivatedAt: string;
  ownershipToken: string;
  deploymentProviderKey: string | null;
  providerId: string | null;
  expectedCurrentState: Record<string, unknown> | null;
  targetState: Record<string, unknown> | null;
  deploymentActivationExecutionClaim: {
    ok: true;
    status: "claimed" | "already_owned" | "reclaimed";
    sessionId: string;
    executionKey: string;
    planKey: string;
    claimantId: string;
    leaseExpiresAt: string | null;
  };
  deploymentActivationExecutionNextItemStart: {
    ok: true;
    status: "started" | "already_started";
    claimantId: string;
    clinicId: string;
    deploymentRunKey: string;
    sessionId: string;
    executionKey: string;
    planKey: string;
    itemId: string;
    executionItemKey: string;
    planItemKey: string;
    sequence: number;
    entityType: "provider_shell";
    entityId: string | null;
    action: "activate";
    attemptCount: number;
    startedAt: string;
    leaseExpiresAt: string | null;
  };
}

export interface DeploymentActivationExecutorProviderShellActivationResult {
  ok: boolean;
  status: DeploymentActivationExecutorProviderShellActivationStatus;
  message: string;
  providerId: string | null;
  deploymentProviderKey: string | null;
  provisioningSourceBefore: string | null;
  provisioningSourceAfter: string | null;
  provisioningStatusBefore: string | null;
  provisioningStatusAfter: string | null;
  activeBefore: boolean | null;
  activeAfter: boolean | null;
  activatedAt: string | null;
  activationResult: string | null;
  issues?: readonly AdapterIssue[];
}

export interface DeploymentActivationExecutorProviderShellActivationRunner {
  activateProviderShell(
    command: DeploymentActivationExecutorProviderShellActivationCommand,
  ): Promise<DeploymentActivationExecutorProviderShellActivationResult> | DeploymentActivationExecutorProviderShellActivationResult;
}

interface AdapterIssue {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  diagnostics?: Record<string, unknown> | null;
}

export class DeploymentActivationExecutorProviderShellHandler implements DeploymentActivationExecutorHandler {
  readonly handlerId = "deployment-activation-executor-provider-shell-activate";
  readonly entityType = "provider_shell";
  readonly action = "activate";

  constructor(
    private readonly runner: DeploymentActivationExecutorProviderShellActivationRunner,
  ) {}

  async handle(input: DeploymentActivationExecutorHandlerInput): Promise<DeploymentActivationExecutorHandlerResult> {
    const command = buildCommand(input);
    const result = await this.runner.activateProviderShell(command);

    return {
      status: mapStatus(result.status),
      message: result.message,
      issues: mapIssues(result.issues ?? [], input, this.handlerId),
      handlerEvidence: {
        providerId: result.providerId,
        deploymentProviderKey: result.deploymentProviderKey,
        providerEntityId: input.item.entityId,
        provisioningSourceBefore: result.provisioningSourceBefore,
        provisioningSourceAfter: result.provisioningSourceAfter,
        provisioningStatusBefore: result.provisioningStatusBefore,
        provisioningStatusAfter: result.provisioningStatusAfter,
        activeBefore: result.activeBefore,
        activeAfter: result.activeAfter,
        activatedAt: result.activatedAt,
        activationResult: result.activationResult ?? result.status,
      },
    };
  }
}

function buildCommand(
  input: DeploymentActivationExecutorHandlerInput,
): DeploymentActivationExecutorProviderShellActivationCommand {
  return {
    clinicId: input.item.clinicId,
    deploymentRunKey: input.item.deploymentRunKey,
    providerActivatedAt: input.context.executedAt,
    ownershipToken: input.context.ownershipToken,
    providerId: input.item.entityId,
    deploymentProviderKey: input.item.deploymentKey,
    expectedCurrentState: cloneRecord(input.item.expectedCurrentState),
    targetState: cloneRecord(input.item.targetState),
    deploymentActivationExecutionClaim: {
      ok: true,
      status: "claimed",
      sessionId: input.item.sessionId,
      executionKey: input.item.executionKey,
      planKey: input.item.planKey,
      claimantId: input.context.claimantId,
      leaseExpiresAt: input.context.leaseExpiresAt,
    },
    deploymentActivationExecutionNextItemStart: {
      ok: true,
      status: "started",
      claimantId: input.context.claimantId,
      clinicId: input.item.clinicId,
      deploymentRunKey: input.item.deploymentRunKey,
      sessionId: input.item.sessionId,
      executionKey: input.item.executionKey,
      planKey: input.item.planKey,
      itemId: input.item.itemId,
      executionItemKey: input.item.executionItemKey,
      planItemKey: input.item.planItemKey,
      sequence: input.item.sequence,
      entityType: "provider_shell",
      entityId: input.item.entityId,
      action: "activate",
      attemptCount: input.item.attemptCount,
      startedAt: input.item.startedAt ?? "",
      leaseExpiresAt: input.context.leaseExpiresAt,
    },
  };
}

function mapStatus(status: DeploymentActivationExecutorProviderShellActivationStatus): DeploymentActivationExecutorStatus {
  switch (status) {
    case "activated":
      return "handled";
    case "already_activated":
      return "already_applied";
    case "blocked":
    case "conflict":
    case "not_found":
    case "error":
      return status;
  }
}

function mapIssues(
  issues: readonly AdapterIssue[],
  input: DeploymentActivationExecutorHandlerInput,
  handlerId: string,
): DeploymentActivationExecutorIssue[] {
  return issues.map((issue) => ({
    code: issue.severity === "warning" ? "handler_blocked" : codeForAdapterIssue(issue.code),
    severity: issue.severity,
    message: issue.message,
    dispatchKey: `${input.item.entityType}:${input.item.action}`,
    handlerId,
    sessionId: input.item.sessionId,
    executionKey: input.item.executionKey,
    executionItemKey: input.item.executionItemKey,
    planItemKey: input.item.planItemKey,
    sequence: input.item.sequence,
    diagnostics: issue.diagnostics ?? null,
  }));
}

function codeForAdapterIssue(code: string): DeploymentActivationExecutorIssue["code"] {
  if (code.includes("not_found") || code.includes("missing")) {
    return "handler_not_found";
  }

  if (code.includes("conflict") || code.includes("mismatch")) {
    return "handler_conflict";
  }

  if (code.includes("error") || code.includes("repository")) {
    return "handler_error";
  }

  return "handler_blocked";
}

function cloneRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return value ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : null;
}
