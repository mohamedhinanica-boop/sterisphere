import "server-only";

import { compareActivationCurrentStates } from "./deployment-activation-current-state";
import type { DeploymentActivationExecutionPersistenceRepository } from "./deployment-activation-execution-persistence-repository";
import {
  buildItemPayloadFromPreparationItem,
  buildSessionPayloadFromPreparation,
  cloneRecord,
  cloneRollbackBoundary,
  type CreateDeploymentActivationExecutionItemPayload,
  type CreateDeploymentActivationExecutionSessionPayload,
  type DeploymentActivationExecutionItemRecord,
  type DeploymentActivationExecutionPersistenceCommand,
  type DeploymentActivationExecutionPersistenceIssue,
  type DeploymentActivationExecutionPersistenceIssueCode,
  type DeploymentActivationExecutionPersistenceResult,
  type DeploymentActivationExecutionSessionRecord,
} from "./deployment-activation-execution-persistence-types";
import type {
  DeploymentActivationExecutionItem,
  DeploymentActivationExecutionRollbackBoundary,
} from "./deployment-activation-execution-types";
import type { DeploymentActivationPlanAction } from "./deployment-activation-plan-types";

const SUPPORTED_ACTIONS = new Set<DeploymentActivationPlanAction>([
  "activate",
  "link",
  "bind",
  "finalize",
  "no_op",
]);

const PRE_EXECUTION_ITEM_STATUSES = new Set(["ready", "pending"]);

export class DeploymentActivationExecutionPersistenceService {
  constructor(
    private readonly repository: DeploymentActivationExecutionPersistenceRepository,
  ) {}

  async persistPreparedExecution(
    command: DeploymentActivationExecutionPersistenceCommand,
  ): Promise<DeploymentActivationExecutionPersistenceResult> {
    const issues = validateCommand(command);
    const preparation = command.preparation;

    if (issues.some((issue) => issue.severity === "blocker")) {
      return result({
        status: "blocked",
        sessionId: null,
        executionKey: preparation.executionKey,
        planKey: preparation.planKey,
        itemsRequested: preparation.itemsRequested,
        issues,
        message:
          "Activation execution persistence rejected preparation evidence before repository writes.",
      });
    }

    const sessionPayload = buildSessionPayloadFromPreparation(command);

    if (!sessionPayload) {
      return result({
        status: "blocked",
        sessionId: null,
        executionKey: preparation.executionKey,
        planKey: preparation.planKey,
        itemsRequested: preparation.itemsRequested,
        issues: [
          issue({
            code: "preparation_not_ready",
            executionKey: preparation.executionKey,
            message: "Prepared execution evidence is incomplete.",
          }),
        ],
        message:
          "Activation execution persistence rejected incomplete preparation evidence.",
      });
    }

    try {
      return await this.persistValidPreparedExecution(command, sessionPayload);
    } catch {
      return result({
        status: "error",
        sessionId: null,
        executionKey: preparation.executionKey,
        planKey: preparation.planKey,
        itemsRequested: preparation.itemsRequested,
        issues: [
          issue({
            code: "repository_error",
            executionKey: preparation.executionKey,
            message:
              "Activation execution persistence repository failed unexpectedly.",
          }),
        ],
        message:
          "Activation execution persistence could not complete because the repository failed unexpectedly.",
      });
    }
  }

  private async persistValidPreparedExecution(
    command: DeploymentActivationExecutionPersistenceCommand,
    sessionPayload: CreateDeploymentActivationExecutionSessionPayload,
  ): Promise<DeploymentActivationExecutionPersistenceResult> {
    const preparation = command.preparation;
    const issues: DeploymentActivationExecutionPersistenceIssue[] = [];
    let sessionCreated: 0 | 1 = 0;
    let sessionReused: 0 | 1 = 0;

    const sameRunSession = await this.repository.findSessionByDeploymentRun({
      clinicId: sessionPayload.clinicId,
      deploymentRunId: sessionPayload.deploymentRunId,
    });

    if (
      sameRunSession &&
      sameRunSession.executionKey !== sessionPayload.executionKey
    ) {
      return result({
        status: "conflict",
        sessionId: sameRunSession.id,
        executionKey: sessionPayload.executionKey,
        planKey: sessionPayload.planKey,
        itemsRequested: preparation.itemsRequested,
        issues: [
          issue({
            code: "session_identity_conflict",
            executionKey: sessionPayload.executionKey,
            message:
              "Deployment run already has a different activation execution session identity.",
          }),
        ],
        message:
          "Activation execution persistence found a conflicting execution session for this deployment run.",
      });
    }

    let session = await this.repository.findSessionByIdentity({
      clinicId: sessionPayload.clinicId,
      deploymentRunId: sessionPayload.deploymentRunId,
      executionKey: sessionPayload.executionKey,
    });

    if (session) {
      const compatibility = compareSession(sessionPayload, session);

      if (compatibility.length > 0) {
        return result({
          status: "conflict",
          sessionId: session.id,
          executionKey: sessionPayload.executionKey,
          planKey: sessionPayload.planKey,
          itemsRequested: preparation.itemsRequested,
          issues: compatibility,
          message:
            "Activation execution persistence found an incompatible existing prepared session.",
        });
      }

      sessionReused = 1;
    } else {
      const created = await this.repository.createPreparedSession(sessionPayload);

      if (!created.ok || !created.session) {
        return result({
          status: "conflict",
          sessionId: created.session?.id ?? null,
          executionKey: sessionPayload.executionKey,
          planKey: sessionPayload.planKey,
          itemsRequested: preparation.itemsRequested,
          issues: [
            issue({
              code: "session_identity_conflict",
              executionKey: sessionPayload.executionKey,
              message: created.message,
            }),
          ],
          message:
            "Activation execution persistence could not create the prepared session because a conflict was detected.",
        });
      }

      session = created.session;
      sessionCreated = 1;
    }

    let itemsCreated = 0;
    let itemsReused = 0;
    let itemsConflicted = 0;
    const existingItems = await this.repository.listExecutionItemsForSession(
      session.id,
    );
    const duplicateExistingItemKeys = findDuplicates(
      existingItems.map((item) => item.executionItemKey),
    );

    for (const duplicateKey of duplicateExistingItemKeys) {
      issues.push(
        issue({
          code: "item_identity_conflict",
          executionKey: session.executionKey,
          executionItemKey: duplicateKey,
          message:
            "Duplicate durable execution item keys prevent deterministic persistence.",
        }),
      );
      itemsConflicted += 1;
    }

    if (duplicateExistingItemKeys.size === 0) {
      for (const item of [...preparation.executionItems].sort(compareItems)) {
        const payload = buildItemPayloadFromPreparationItem({
          sessionId: session.id,
          clinicId: session.clinicId,
          deploymentRunId: session.deploymentRunId,
          executionKey: session.executionKey,
          item,
          createdAt: command.createdAt,
        });
        const existing = await this.repository.findItemByExecutionItemKey({
          sessionId: session.id,
          executionItemKey: payload.executionItemKey,
        });

        if (existing) {
          const compatibility = compareItem(payload, existing);

          if (compatibility.length > 0) {
            issues.push(...compatibility);
            itemsConflicted += 1;
            continue;
          }

          itemsReused += 1;
          continue;
        }

        const created = await this.repository.createPreparedItem(payload);

        if (!created.ok || !created.item) {
          issues.push(
            issue({
              code: "item_identity_conflict",
              executionKey: session.executionKey,
              executionItemKey: payload.executionItemKey,
              planItemKey: payload.planItemKey,
              message: created.message,
            }),
          );
          itemsConflicted += 1;
          continue;
        }

        itemsCreated += 1;
      }
    }

    if (issues.some((current) => current.severity === "blocker")) {
      return result({
        status: "conflict",
        sessionId: session.id,
        executionKey: session.executionKey,
        planKey: session.planKey,
        itemsRequested: preparation.itemsRequested,
        itemsCreated,
        itemsReused,
        itemsConflicted,
        sessionCreated,
        sessionReused,
        issues,
        message:
          "Activation execution persistence found conflicting immutable execution evidence and did not repair existing rows.",
      });
    }

    const status = sessionCreated || itemsCreated ? "created" : "reused";

    return result({
      status,
      sessionId: session.id,
      executionKey: session.executionKey,
      planKey: session.planKey,
      itemsRequested: preparation.itemsRequested,
      itemsCreated,
      itemsReused,
      itemsConflicted,
      sessionCreated,
      sessionReused,
      issues,
      message:
        status === "created"
          ? "Activation execution persistence created missing prepared session or item evidence."
          : "Activation execution persistence reused existing compatible prepared session and item evidence.",
    });
  }
}

export function createDeploymentActivationExecutionPersistenceService(
  repository: DeploymentActivationExecutionPersistenceRepository,
): DeploymentActivationExecutionPersistenceService {
  return new DeploymentActivationExecutionPersistenceService(repository);
}

function validateCommand(
  command: DeploymentActivationExecutionPersistenceCommand,
): DeploymentActivationExecutionPersistenceIssue[] {
  const preparation = command.preparation;
  const issues: DeploymentActivationExecutionPersistenceIssue[] = [];

  if (
    preparation.status !== "ready" ||
    !preparation.ok ||
    preparation.blockers !== 0 ||
    preparation.itemsBlocked !== 0
  ) {
    issues.push(
      issue({
        code: "preparation_not_ready",
        executionKey: preparation.executionKey,
        message:
          "Only ready, unblocked activation execution preparation evidence can be persisted.",
      }),
    );
  }

  if (!preparation.executionKey) {
    issues.push(issue({ code: "execution_identity_missing", message: "Execution key is required." }));
  }

  if (!preparation.planKey) {
    issues.push(issue({ code: "plan_identity_missing", executionKey: preparation.executionKey, message: "Plan key is required." }));
  }

  if (!preparation.clinicId) {
    issues.push(issue({ code: "clinic_identity_missing", executionKey: preparation.executionKey, message: "Clinic id is required." }));
  }

  if (!preparation.deploymentRunId) {
    issues.push(issue({ code: "deployment_run_identity_missing", executionKey: preparation.executionKey, message: "Deployment run id is required." }));
  }

  if (preparation.executionItems.length !== preparation.itemsRequested) {
    issues.push(
      issue({
        code: "item_count_mismatch",
        executionKey: preparation.executionKey,
        message: "Execution item count must match itemsRequested.",
      }),
    );
  }

  addDuplicateIssues(
    preparation.executionItems.map((item) => item.executionItemKey),
    "duplicate_execution_item_key",
    preparation.executionKey,
    issues,
  );
  addDuplicateIssues(
    preparation.executionItems.map((item) => item.planItemKey),
    "duplicate_plan_item_key",
    preparation.executionKey,
    issues,
  );
  addDuplicateIssues(
    preparation.executionItems.map((item) => String(item.sequence)),
    "duplicate_sequence",
    preparation.executionKey,
    issues,
  );

  for (const item of preparation.executionItems) {
    if (item.executionItemKey !== `${preparation.executionKey}:${item.planItemKey}`) {
      issues.push(
        issue({
          code: "item_identity_mismatch",
          executionKey: preparation.executionKey,
          executionItemKey: item.executionItemKey,
          planItemKey: item.planItemKey,
          message: "Execution item key must be derived from execution key and plan item key.",
        }),
      );
    }

    if (!PRE_EXECUTION_ITEM_STATUSES.has(item.executionStatus)) {
      issues.push(itemIssue("unsupported_item_status", preparation.executionKey, item, "Only ready or pending execution items can be persisted."));
    }

    if (!SUPPORTED_ACTIONS.has(item.action)) {
      issues.push(itemIssue("unsupported_action", preparation.executionKey, item, "Execution item action is unsupported."));
    }

    if (item.attemptCount !== 0) {
      issues.push(itemIssue("attempt_count_not_zero", preparation.executionKey, item, "Prepared execution items must have zero attempts."));
    }

    if (item.startedAt || item.completedAt || item.error) {
      issues.push(itemIssue("execution_timestamp_present", preparation.executionKey, item, "Prepared execution items must not include execution timestamps or errors."));
    }
  }

  if (!rollbackBoundaryValid(preparation.rollbackBoundary, preparation.executionItems)) {
    issues.push(
      issue({
        code: "rollback_boundary_invalid",
        executionKey: preparation.executionKey,
        message: "Rollback boundary does not match prepared execution items.",
      }),
    );
  }

  return issues.sort(compareIssues);
}

function compareSession(
  payload: CreateDeploymentActivationExecutionSessionPayload,
  session: DeploymentActivationExecutionSessionRecord,
): DeploymentActivationExecutionPersistenceIssue[] {
  const issues: DeploymentActivationExecutionPersistenceIssue[] = [];

  if (session.executionStatus === "prepared") {
    if (
      session.executionOwner !== null ||
      session.ownershipToken !== null ||
      session.leaseExpiresAt !== null
    ) {
      issues.push(issue({ code: "session_state_conflict", executionKey: payload.executionKey, message: "Prepared execution session has ownership evidence." }));
    }
  } else if (session.executionStatus === "claimed") {
    if (
      !session.executionOwner ||
      !session.ownershipToken ||
      !session.leaseExpiresAt
    ) {
      issues.push(issue({ code: "session_state_conflict", executionKey: payload.executionKey, message: "Claimed execution session is missing ownership evidence." }));
    }
  } else {
    issues.push(issue({ code: "session_state_conflict", executionKey: payload.executionKey, message: "Existing execution session is not prepared or claim-owned without execution." }));
  }

  if (
    session.startedAt !== null ||
    session.completedAt !== null ||
    session.failedAt !== null
  ) {
    issues.push(issue({ code: "session_state_conflict", executionKey: payload.executionKey, message: "Existing execution session has execution lifecycle timestamps." }));
  }

  const fields: Array<keyof CreateDeploymentActivationExecutionSessionPayload> = [
    "clinicId",
    "deploymentRunId",
    "executionKey",
    "planKey",
    "payloadHash",
    "preparationStatus",
    "itemsRequested",
    "itemsReady",
    "itemsPending",
    "itemsBlocked",
    "reversibleItems",
    "irreversibleItems",
    "blockers",
    "warnings",
  ];

  for (const field of fields) {
    if (session[field] !== payload[field]) {
      issues.push(issue({ code: "immutable_evidence_conflict", executionKey: payload.executionKey, message: `Session immutable field ${field} differs.` }));
    }
  }

  if (!sameJson(session.rollbackBoundary, payload.rollbackBoundary)) {
    issues.push(issue({ code: "immutable_evidence_conflict", executionKey: payload.executionKey, message: "Session rollback boundary differs." }));
  }

  return issues.sort(compareIssues);
}
function compareItem(
  payload: CreateDeploymentActivationExecutionItemPayload,
  item: DeploymentActivationExecutionItemRecord,
): DeploymentActivationExecutionPersistenceIssue[] {
  const issues: DeploymentActivationExecutionPersistenceIssue[] = [];

  if (!["ready", "pending"].includes(item.executionStatus)) {
    issues.push(issue({ code: "item_state_conflict", executionKey: payload.executionKey, executionItemKey: payload.executionItemKey, planItemKey: payload.planItemKey, message: "Existing execution item is no longer pre-execution." }));
  }

  if (
    item.startedAt !== null ||
    item.completedAt !== null ||
    item.rolledBackAt !== null ||
    item.errorCode !== null ||
    item.errorMessage !== null
  ) {
    issues.push(issue({ code: "item_state_conflict", executionKey: payload.executionKey, executionItemKey: payload.executionItemKey, planItemKey: payload.planItemKey, message: "Existing execution item has execution, rollback, or error evidence." }));
  }

  const fields: Array<keyof CreateDeploymentActivationExecutionItemPayload> = [
    "sessionId",
    "clinicId",
    "deploymentRunId",
    "executionKey",
    "executionItemKey",
    "planItemKey",
    "sequence",
    "dependencyLevel",
    "entityType",
    "entityId",
    "deploymentKey",
    "action",
    "executionStatus",
    "attemptCount",
    "reversible",
    "rollbackAction",
    "rollbackStatus",
  ];

  for (const field of fields) {
    if (item[field] !== payload[field]) {
      const code =
        field === "action"
          ? "item_identity_conflict"
          : field === "entityId"
            ? "item_identity_conflict"
            : "immutable_evidence_conflict";
      issues.push(issue({ code, executionKey: payload.executionKey, executionItemKey: payload.executionItemKey, planItemKey: payload.planItemKey, message: `Execution item immutable field ${field} differs.` }));
    }
  }

  if (!statesEqual(item.expectedCurrentState, payload.expectedCurrentState)) {
    issues.push(issue({ code: "immutable_evidence_conflict", executionKey: payload.executionKey, executionItemKey: payload.executionItemKey, planItemKey: payload.planItemKey, message: "Execution item expected current state differs." }));
  }

  if (!statesEqual(item.targetState, payload.targetState)) {
    issues.push(issue({ code: "immutable_evidence_conflict", executionKey: payload.executionKey, executionItemKey: payload.executionItemKey, planItemKey: payload.planItemKey, message: "Execution item target state differs." }));
  }

  if (!sameStringArray(item.dependencyKeys, payload.dependencyKeys)) {
    issues.push(issue({ code: "immutable_evidence_conflict", executionKey: payload.executionKey, executionItemKey: payload.executionItemKey, planItemKey: payload.planItemKey, message: "Execution item dependency list differs." }));
  }

  return issues.sort(compareIssues);
}

function rollbackBoundaryValid(
  boundary: DeploymentActivationExecutionRollbackBoundary,
  items: readonly DeploymentActivationExecutionItem[],
): boolean {
  const itemKeys = new Set(items.map((item) => item.planItemKey));
  const boundaryKeys = [
    ...boundary.rollbackSupportedItemKeys,
    ...boundary.rollbackUnsupportedItemKeys,
  ];

  return boundaryKeys.every((key) => itemKeys.has(key));
}

function result(input: {
  status: DeploymentActivationExecutionPersistenceResult["status"];
  sessionId: string | null;
  executionKey: string | null;
  planKey: string | null;
  itemsRequested: number;
  itemsCreated?: number;
  itemsReused?: number;
  itemsConflicted?: number;
  sessionCreated?: 0 | 1;
  sessionReused?: 0 | 1;
  issues: readonly DeploymentActivationExecutionPersistenceIssue[];
  message: string;
}): DeploymentActivationExecutionPersistenceResult {
  const issues = [...input.issues].sort(compareIssues);
  const blockers = issues.filter((current) => current.severity === "blocker").length;
  const warnings = issues.filter((current) => current.severity === "warning").length;

  return {
    ok: input.status === "created" || input.status === "reused",
    status: input.status,
    sessionId: input.sessionId,
    executionKey: input.executionKey,
    planKey: input.planKey,
    sessionCreated: input.sessionCreated ?? 0,
    sessionReused: input.sessionReused ?? 0,
    itemsRequested: input.itemsRequested,
    itemsCreated: input.itemsCreated ?? 0,
    itemsReused: input.itemsReused ?? 0,
    itemsConflicted: input.itemsConflicted ?? 0,
    blockers,
    warnings,
    issues,
    downstream: zeroDownstream(),
    message: input.message,
  };
}

function itemIssue(
  code: DeploymentActivationExecutionPersistenceIssueCode,
  executionKey: string | null,
  item: DeploymentActivationExecutionItem,
  message: string,
): DeploymentActivationExecutionPersistenceIssue {
  return issue({
    code,
    executionKey,
    executionItemKey: item.executionItemKey,
    planItemKey: item.planItemKey,
    message,
  });
}

function issue(input: {
  code: DeploymentActivationExecutionPersistenceIssueCode;
  executionKey?: string | null;
  executionItemKey?: string | null;
  planItemKey?: string | null;
  message: string;
}): DeploymentActivationExecutionPersistenceIssue {
  return {
    code: input.code,
    severity: "blocker",
    executionKey: input.executionKey ?? null,
    executionItemKey: input.executionItemKey ?? null,
    planItemKey: input.planItemKey ?? null,
    message: input.message,
  };
}

function addDuplicateIssues(
  values: readonly string[],
  code: DeploymentActivationExecutionPersistenceIssueCode,
  executionKey: string | null,
  issues: DeploymentActivationExecutionPersistenceIssue[],
): void {
  for (const duplicate of findDuplicates(values)) {
    issues.push(
      issue({
        code,
        executionKey,
        executionItemKey:
          code === "duplicate_execution_item_key" ? duplicate : null,
        planItemKey: code === "duplicate_plan_item_key" ? duplicate : null,
        message: `Duplicate value ${duplicate} prevents deterministic persistence.`,
      }),
    );
  }
}

function findDuplicates(values: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return duplicates;
}

function compareItems(
  left: DeploymentActivationExecutionItem,
  right: DeploymentActivationExecutionItem,
): number {
  return left.sequence - right.sequence || left.executionItemKey.localeCompare(right.executionItemKey);
}

function compareIssues(
  left: DeploymentActivationExecutionPersistenceIssue,
  right: DeploymentActivationExecutionPersistenceIssue,
): number {
  return (
    left.code.localeCompare(right.code) ||
    String(left.executionItemKey ?? "").localeCompare(String(right.executionItemKey ?? "")) ||
    String(left.planItemKey ?? "").localeCompare(String(right.planItemKey ?? ""))
  );
}

function statesEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return compareActivationCurrentStates(left, right).equivalent;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function zeroDownstream() {
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
  } as const;
}
