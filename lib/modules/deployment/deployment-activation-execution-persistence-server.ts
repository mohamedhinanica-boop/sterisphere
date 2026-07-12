import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDeploymentActivationExecutionPersistenceService,
  type DeploymentActivationExecutionPersistenceService,
} from "./deployment-activation-execution-persistence-service";
import {
  SupabaseDeploymentActivationExecutionPersistenceRepository,
} from "./deployment-activation-execution-persistence-supabase-repository";
import type {
  DeploymentActivationExecutionPersistenceDownstreamCounts,
  DeploymentActivationExecutionPersistenceIssue,
  DeploymentActivationExecutionPersistenceResult,
} from "./deployment-activation-execution-persistence-types";
import type {
  ServerDeploymentActivationExecutionResult,
} from "./deployment-activation-execution-server";
import type {
  DeploymentActivationExecutionResult,
} from "./deployment-activation-execution-types";

export type ServerDeploymentActivationExecutionPersistenceStatus =
  | "created"
  | "reused"
  | "partial"
  | "conflict"
  | "blocked"
  | "error"
  | "not_attempted";

export interface ServerDeploymentActivationExecutionPersistenceCommand {
  clinicId: string;
  deploymentRunId: string;
  payloadHash: string | null;
  deploymentActivationExecution: ServerDeploymentActivationExecutionResult;
  createdAt?: string | null;
}

export interface ServerDeploymentActivationExecutionPersistenceResult {
  ok: boolean;
  status: ServerDeploymentActivationExecutionPersistenceStatus;
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  sessionCreated: 0 | 1;
  sessionReused: 0 | 1;
  itemsRequested: number;
  itemsCreated: number;
  itemsReused: number;
  itemsConflicted: number;
  blockers: number;
  warnings: number;
  issues: readonly DeploymentActivationExecutionPersistenceIssue[];
  downstream: DeploymentActivationExecutionPersistenceDownstreamCounts;
  message: string;
}

type DeploymentRunIdentityRow = {
  id: string;
  clinic_id: string | null;
  deployment_run_id: string | null;
};

export function createServerDeploymentActivationExecutionPersistenceService(
  client: SupabaseClient,
): DeploymentActivationExecutionPersistenceService {
  return createDeploymentActivationExecutionPersistenceService(
    new SupabaseDeploymentActivationExecutionPersistenceRepository(client),
  );
}

export async function persistActivationExecutionForServerDeployment(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionPersistenceCommand,
): Promise<ServerDeploymentActivationExecutionPersistenceResult> {
  const prerequisite = validatePrerequisites(command);

  if (prerequisite) {
    return prerequisite;
  }

  const deploymentRunResolution = await resolveDeploymentRunRecord(client, command);

  if (!deploymentRunResolution.ok) {
    return deploymentRunResolution.result;
  }

  return persistActivationExecutionWithService(
    createServerDeploymentActivationExecutionPersistenceService(client),
    command,
  );
}

export async function persistActivationExecutionWithService(
  service: DeploymentActivationExecutionPersistenceService,
  command: ServerDeploymentActivationExecutionPersistenceCommand,
): Promise<ServerDeploymentActivationExecutionPersistenceResult> {
  const prerequisite = validatePrerequisites(command);

  if (prerequisite) {
    return prerequisite;
  }

  try {
    const preparation = command.deploymentActivationExecution as DeploymentActivationExecutionResult;
    const result = await service.persistPreparedExecution({
      preparation,
      payloadHash: command.payloadHash,
      preparationEvidence: {
        status: command.deploymentActivationExecution.status,
        executionKey: command.deploymentActivationExecution.executionKey,
        planKey: command.deploymentActivationExecution.planKey,
        itemsRequested: command.deploymentActivationExecution.itemsRequested,
        itemsReady: command.deploymentActivationExecution.itemsReady,
        itemsPending: command.deploymentActivationExecution.itemsPending,
        itemsBlocked: command.deploymentActivationExecution.itemsBlocked,
        blockers: command.deploymentActivationExecution.blockers,
        warnings: command.deploymentActivationExecution.warnings,
        executionItemKeys:
          command.deploymentActivationExecution.executionItems.map(
            (item) => item.executionItemKey,
          ),
      },
      executionMetadata: {
        source: "setup_complete",
        runtimeStage: "activation_execution_persistence",
        noActivation: true,
      },
      createdAt: command.createdAt,
    });

    return mapPersistenceResult(result);
  } catch {
    return safeError(command, "Activation execution persistence failed safely. No activation or execution was started.");
  }
}

async function resolveDeploymentRunRecord(
  client: SupabaseClient,
  command: ServerDeploymentActivationExecutionPersistenceCommand,
): Promise<
  | { ok: true }
  | { ok: false; result: ServerDeploymentActivationExecutionPersistenceResult }
> {
  const { data, error } = await client
    .from("deployment_runs")
    .select("id,clinic_id,deployment_run_id")
    .eq("clinic_id", command.clinicId)
    .eq("deployment_run_id", command.deploymentRunId)
    .limit(2);

  if (error) {
    return {
      ok: false,
      result: safeError(
        command,
        "Activation execution persistence could not verify the durable deployment run record.",
      ),
    };
  }

  const rows = (data ?? []) as unknown as DeploymentRunIdentityRow[];

  if (rows.length !== 1) {
    return {
      ok: false,
      result: blocked(command, [
        issue(
          "deployment_run_identity_missing",
          command.deploymentActivationExecution.executionKey,
          "Activation execution persistence requires exactly one durable deployment run row for this clinic and logical run key.",
        ),
      ]),
    };
  }

  const [row] = rows;

  if (
    row.clinic_id !== command.clinicId ||
    row.deployment_run_id !== command.deploymentRunId ||
    !row.id
  ) {
    return {
      ok: false,
      result: blocked(command, [
        issue(
          "deployment_run_identity_missing",
          command.deploymentActivationExecution.executionKey,
          "Durable deployment run ownership did not match the prepared execution evidence.",
        ),
      ]),
    };
  }

  return { ok: true };
}

function validatePrerequisites(
  command: ServerDeploymentActivationExecutionPersistenceCommand,
): ServerDeploymentActivationExecutionPersistenceResult | null {
  const preparation = command.deploymentActivationExecution;
  const invalidItemStatuses = preparation.executionItems.filter(
    (item) => !["ready", "pending"].includes(item.executionStatus),
  );
  const itemsHaveExecutionEvidence = preparation.executionItems.some(
    (item) =>
      item.attemptCount !== 0 ||
      item.startedAt !== null ||
      item.completedAt !== null ||
      item.error !== null,
  );

  if (
    !preparation.ok ||
    preparation.status !== "ready" ||
    preparation.blockers !== 0 ||
    preparation.itemsBlocked !== 0
  ) {
    return {
      ...notAttempted(command),
      message:
        "Activation execution persistence was not attempted because execution preparation is not ready.",
    };
  }

  if (
    !preparation.executionKey ||
    !preparation.planKey ||
    preparation.clinicId !== command.clinicId ||
    preparation.deploymentRunId !== command.deploymentRunId ||
    preparation.executionItems.length !== preparation.itemsRequested ||
    invalidItemStatuses.length > 0 ||
    itemsHaveExecutionEvidence
  ) {
    return blocked(command, [
      issue(
        "preparation_not_ready",
        preparation.executionKey,
        "Prepared execution evidence failed the runtime persistence prerequisites.",
      ),
    ]);
  }

  return null;
}

function mapPersistenceResult(
  result: DeploymentActivationExecutionPersistenceResult,
): ServerDeploymentActivationExecutionPersistenceResult {
  return {
    ok: result.ok,
    status: toServerStatus(result),
    sessionId: result.sessionId,
    executionKey: result.executionKey,
    planKey: result.planKey,
    sessionCreated: result.sessionCreated,
    sessionReused: result.sessionReused,
    itemsRequested: result.itemsRequested,
    itemsCreated: result.itemsCreated,
    itemsReused: result.itemsReused,
    itemsConflicted: result.itemsConflicted,
    blockers: result.blockers,
    warnings: result.warnings,
    issues: result.issues,
    downstream: result.downstream,
    message: result.message,
  };
}

function toServerStatus(
  result: DeploymentActivationExecutionPersistenceResult,
): ServerDeploymentActivationExecutionPersistenceStatus {
  if (
    result.status === "created" &&
    result.sessionCreated === 0 &&
    result.itemsCreated > 0 &&
    result.itemsReused > 0
  ) {
    return "partial";
  }

  return result.status;
}

function notAttempted(
  command: ServerDeploymentActivationExecutionPersistenceCommand,
): ServerDeploymentActivationExecutionPersistenceResult {
  return {
    ok: false,
    status: "not_attempted",
    sessionId: null,
    executionKey: command.deploymentActivationExecution.executionKey,
    planKey: command.deploymentActivationExecution.planKey,
    sessionCreated: 0,
    sessionReused: 0,
    itemsRequested: 0,
    itemsCreated: 0,
    itemsReused: 0,
    itemsConflicted: 0,
    blockers: 0,
    warnings: 0,
    issues: [],
    downstream: zeroDownstream(),
    message: "Activation execution persistence was not attempted.",
  };
}

function blocked(
  command: ServerDeploymentActivationExecutionPersistenceCommand,
  issues: readonly DeploymentActivationExecutionPersistenceIssue[],
): ServerDeploymentActivationExecutionPersistenceResult {
  return {
    ...notAttempted(command),
    status: "blocked",
    itemsRequested: command.deploymentActivationExecution.itemsRequested,
    blockers: issues.filter((current) => current.severity === "blocker").length,
    warnings: issues.filter((current) => current.severity === "warning").length,
    issues,
    message:
      "Activation execution persistence was blocked before any execution session or item rows were written.",
  };
}

function safeError(
  command: ServerDeploymentActivationExecutionPersistenceCommand,
  message: string,
): ServerDeploymentActivationExecutionPersistenceResult {
  return {
    ...notAttempted(command),
    status: "error",
    issues: [
      issue(
        "repository_error",
        command.deploymentActivationExecution.executionKey,
        "Activation execution persistence repository failed safely.",
      ),
    ],
    blockers: 1,
    message,
  };
}

function issue(
  code: DeploymentActivationExecutionPersistenceIssue["code"],
  executionKey: string | null,
  message: string,
): DeploymentActivationExecutionPersistenceIssue {
  return {
    code,
    severity: "blocker",
    executionKey,
    executionItemKey: null,
    planItemKey: null,
    message,
  };
}

function zeroDownstream(): DeploymentActivationExecutionPersistenceDownstreamCounts {
  return {
    itemsClaimed: 0,
    itemsStarted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    itemsRolledBack: 0,
    sessionsCompleted: 0,
    sessionsFailed: 0,
    bindingsWritten: 0,
    entitiesActivated: 0,
    deploymentRunsFinalized: 0,
  };
}
