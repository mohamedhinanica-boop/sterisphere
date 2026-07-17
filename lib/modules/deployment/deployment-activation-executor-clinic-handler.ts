import type {
  DeploymentActivationExecutorHandler,
  DeploymentActivationExecutorHandlerInput,
} from "./deployment-activation-executor-handler";
import type {
  DeploymentActivationExecutorHandlerResult,
  DeploymentActivationExecutorIssue,
  DeploymentActivationExecutorStatus,
} from "./deployment-activation-executor-types";

export type DeploymentActivationExecutorClinicActivationStatus =
  | "activated"
  | "already_activated"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export interface DeploymentActivationExecutorClinicActivationCommand {
  clinicId: string;
  deploymentRunKey: string;
  activationRequestedAt: string;
  ownershipToken: string;
  deploymentActivationExecutionClaim: {
    ok: true;
    status: "claimed" | "already_owned" | "reclaimed";
    sessionId: string;
    executionKey: string;
    planKey: string;
    claimantId: string;
    leaseExpiresAt: string | null;
  };
  deploymentActivationExecutionItemStart: {
    ok: true;
    status: "started" | "already_started";
    claimantId: string;
    sessionId: string;
    executionKey: string;
    itemId: string;
    executionItemKey: string;
    planItemKey: string;
    sequence: number;
    entityType: "clinic";
    entityId: string | null;
    action: "activate";
    attemptCount: number;
    startedAt: string;
    leaseExpiresAt: string | null;
    expectedCurrentState: Record<string, unknown> | null;
    targetState: Record<string, unknown> | null;
  };
}

export interface DeploymentActivationExecutorClinicActivationResult {
  ok: boolean;
  status: DeploymentActivationExecutorClinicActivationStatus;
  message: string;
  clinicId: string | null;
  currentClinicState: Record<string, unknown> | null;
  targetClinicState: Record<string, unknown> | null;
  deployedAt: string | null;
  activationResult: string | null;
  issues?: readonly AdapterIssue[];
}

export interface DeploymentActivationExecutorClinicActivationRunner {
  activateClinic(
    command: DeploymentActivationExecutorClinicActivationCommand,
  ): Promise<DeploymentActivationExecutorClinicActivationResult> | DeploymentActivationExecutorClinicActivationResult;
}

interface AdapterIssue {
  code: string;
  severity: "blocker" | "warning";
  message: string;
  diagnostics?: Record<string, unknown> | null;
}

export class DeploymentActivationExecutorClinicHandler implements DeploymentActivationExecutorHandler {
  readonly handlerId = "deployment-activation-executor-clinic-activate";
  readonly entityType = "clinic";
  readonly action = "activate";

  constructor(
    private readonly runner: DeploymentActivationExecutorClinicActivationRunner,
  ) {}

  async handle(input: DeploymentActivationExecutorHandlerInput): Promise<DeploymentActivationExecutorHandlerResult> {
    const command = buildCommand(input);
    const result = await this.runner.activateClinic(command);

    return {
      status: mapStatus(result.status),
      message: result.message,
      issues: mapIssues(result.issues ?? [], input, this.handlerId),
      handlerEvidence: {
        clinicId: result.clinicId,
        currentClinicState: cloneRecord(result.currentClinicState),
        targetClinicState: cloneRecord(result.targetClinicState),
        deploymentStatusBefore: readDeploymentStatus(result.currentClinicState),
        deploymentStatusAfter: readDeploymentStatus(result.targetClinicState),
        deployedAt: result.deployedAt,
        activationResult: result.activationResult ?? result.status,
      },
    };
  }
}

function buildCommand(
  input: DeploymentActivationExecutorHandlerInput,
): DeploymentActivationExecutorClinicActivationCommand {
  return {
    clinicId: input.item.clinicId,
    deploymentRunKey: input.item.deploymentRunKey,
    activationRequestedAt: input.context.executedAt,
    ownershipToken: input.context.ownershipToken,
    deploymentActivationExecutionClaim: {
      ok: true,
      status: "claimed",
      sessionId: input.item.sessionId,
      executionKey: input.item.executionKey,
      planKey: input.item.planKey,
      claimantId: input.context.claimantId,
      leaseExpiresAt: input.context.leaseExpiresAt,
    },
    deploymentActivationExecutionItemStart: {
      ok: true,
      status: "started",
      claimantId: input.context.claimantId,
      sessionId: input.item.sessionId,
      executionKey: input.item.executionKey,
      itemId: input.item.itemId,
      executionItemKey: input.item.executionItemKey,
      planItemKey: input.item.planItemKey,
      sequence: input.item.sequence,
      entityType: "clinic",
      entityId: input.item.entityId,
      action: "activate",
      attemptCount: input.item.attemptCount,
      startedAt: input.item.startedAt ?? "",
      leaseExpiresAt: input.context.leaseExpiresAt,
      expectedCurrentState: cloneRecord(input.item.expectedCurrentState),
      targetState: cloneRecord(input.item.targetState),
    },
  };
}

function mapStatus(status: DeploymentActivationExecutorClinicActivationStatus): DeploymentActivationExecutorStatus {
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

function readDeploymentStatus(state: Record<string, unknown> | null): string | null {
  const value = state?.deploymentStatus ?? state?.deployment_status;
  return typeof value === "string" ? value : null;
}

function cloneRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  return value ? JSON.parse(JSON.stringify(value)) as Record<string, unknown> : null;
}
