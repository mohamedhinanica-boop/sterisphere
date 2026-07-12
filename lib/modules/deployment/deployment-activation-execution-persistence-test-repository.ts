import type {
  DeploymentActivationExecutionPersistenceCreateItemResult,
  DeploymentActivationExecutionPersistenceCreateSessionResult,
  DeploymentActivationExecutionPersistenceRepository,
} from "./deployment-activation-execution-persistence-repository";
import {
  cloneRecord,
  cloneRollbackBoundary,
  type CreateDeploymentActivationExecutionItemPayload,
  type CreateDeploymentActivationExecutionSessionPayload,
  type DeploymentActivationExecutionItemRecord,
  type DeploymentActivationExecutionSessionRecord,
} from "./deployment-activation-execution-persistence-types";

export interface DeploymentActivationExecutionPersistenceTestRepositoryCalls {
  findSessionByIdentity: number;
  findSessionByDeploymentRun: number;
  createPreparedSession: number;
  listExecutionItemsForSession: number;
  findItemByExecutionItemKey: number;
  createPreparedItem: number;
  forbiddenClaimWrites: 0;
  forbiddenStartWrites: 0;
  forbiddenCompletionWrites: 0;
  forbiddenRollbackWrites: 0;
  forbiddenActivationWrites: 0;
  forbiddenBindingWrites: 0;
  forbiddenDeploymentRunFinalizationWrites: 0;
}

export class InMemoryDeploymentActivationExecutionPersistenceTestRepository
  implements DeploymentActivationExecutionPersistenceRepository
{
  readonly calls: DeploymentActivationExecutionPersistenceTestRepositoryCalls = {
    findSessionByIdentity: 0,
    findSessionByDeploymentRun: 0,
    createPreparedSession: 0,
    listExecutionItemsForSession: 0,
    findItemByExecutionItemKey: 0,
    createPreparedItem: 0,
    forbiddenClaimWrites: 0,
    forbiddenStartWrites: 0,
    forbiddenCompletionWrites: 0,
    forbiddenRollbackWrites: 0,
    forbiddenActivationWrites: 0,
    forbiddenBindingWrites: 0,
    forbiddenDeploymentRunFinalizationWrites: 0,
  };

  private readonly sessionsById = new Map<string, DeploymentActivationExecutionSessionRecord>();
  private readonly itemsById = new Map<string, DeploymentActivationExecutionItemRecord>();
  private nextSessionNumber = 1;
  private nextItemNumber = 1;
  private readonly shouldThrow: boolean;

  constructor(input: {
    sessions?: readonly DeploymentActivationExecutionSessionRecord[];
    items?: readonly DeploymentActivationExecutionItemRecord[];
    shouldThrow?: boolean;
  } = {}) {
    this.shouldThrow = input.shouldThrow ?? false;
    input.sessions?.forEach((session) => this.storeSession(session));
    input.items?.forEach((item) => this.storeItem(item));
  }

  async findSessionByIdentity(input: {
    clinicId: string;
    deploymentRunId: string;
    executionKey: string;
  }): Promise<DeploymentActivationExecutionSessionRecord | null> {
    this.calls.findSessionByIdentity += 1;
    this.maybeThrow();

    const session = this.sessions.find(
      (candidate) =>
        candidate.clinicId === input.clinicId &&
        candidate.deploymentRunId === input.deploymentRunId &&
        candidate.executionKey === input.executionKey,
    );

    return session ? cloneSession(session) : null;
  }

  async findSessionByDeploymentRun(input: {
    clinicId: string;
    deploymentRunId: string;
  }): Promise<DeploymentActivationExecutionSessionRecord | null> {
    this.calls.findSessionByDeploymentRun += 1;
    this.maybeThrow();

    const session = this.sessions.find(
      (candidate) =>
        candidate.clinicId === input.clinicId &&
        candidate.deploymentRunId === input.deploymentRunId,
    );

    return session ? cloneSession(session) : null;
  }

  async createPreparedSession(
    payload: CreateDeploymentActivationExecutionSessionPayload,
  ): Promise<DeploymentActivationExecutionPersistenceCreateSessionResult> {
    this.calls.createPreparedSession += 1;
    this.maybeThrow();

    const existing = this.sessions.find(
      (session) =>
        session.clinicId === payload.clinicId &&
        session.deploymentRunId === payload.deploymentRunId &&
        session.executionKey === payload.executionKey,
    );

    if (existing) {
      return {
        ok: false,
        session: cloneSession(existing),
        message: "Prepared execution session already exists in memory.",
      };
    }

    const timestamp = payload.createdAt ?? new Date(0).toISOString();
    const session: DeploymentActivationExecutionSessionRecord = {
      ...cloneSessionPayload(payload),
      id: `activation-execution-session-${this.nextSessionNumber.toString().padStart(4, "0")}`,
      createdAt: timestamp,
      updatedAt: payload.updatedAt ?? timestamp,
    };

    this.nextSessionNumber += 1;
    this.storeSession(session);

    return {
      ok: true,
      session: cloneSession(session),
      message: "Prepared execution session created in memory.",
    };
  }

  async listExecutionItemsForSession(
    sessionId: string,
  ): Promise<readonly DeploymentActivationExecutionItemRecord[]> {
    this.calls.listExecutionItemsForSession += 1;
    this.maybeThrow();

    return this.items
      .filter((item) => item.sessionId === sessionId)
      .sort(
        (left, right) =>
          left.sequence - right.sequence ||
          left.executionItemKey.localeCompare(right.executionItemKey),
      )
      .map(cloneItem);
  }

  async findItemByExecutionItemKey(input: {
    sessionId: string;
    executionItemKey: string;
  }): Promise<DeploymentActivationExecutionItemRecord | null> {
    this.calls.findItemByExecutionItemKey += 1;
    this.maybeThrow();

    const item = this.items.find(
      (candidate) =>
        candidate.sessionId === input.sessionId &&
        candidate.executionItemKey === input.executionItemKey,
    );

    return item ? cloneItem(item) : null;
  }

  async createPreparedItem(
    payload: CreateDeploymentActivationExecutionItemPayload,
  ): Promise<DeploymentActivationExecutionPersistenceCreateItemResult> {
    this.calls.createPreparedItem += 1;
    this.maybeThrow();

    const existing = this.items.find(
      (item) =>
        item.sessionId === payload.sessionId &&
        item.executionItemKey === payload.executionItemKey,
    );

    if (existing) {
      return {
        ok: false,
        item: cloneItem(existing),
        message: "Prepared execution item already exists in memory.",
      };
    }

    const timestamp = payload.createdAt ?? new Date(0).toISOString();
    const item: DeploymentActivationExecutionItemRecord = {
      ...cloneItemPayload(payload),
      id: `activation-execution-item-${this.nextItemNumber.toString().padStart(4, "0")}`,
      createdAt: timestamp,
      updatedAt: payload.updatedAt ?? timestamp,
    };

    this.nextItemNumber += 1;
    this.storeItem(item);

    return {
      ok: true,
      item: cloneItem(item),
      message: "Prepared execution item created in memory.",
    };
  }

  get sessions(): readonly DeploymentActivationExecutionSessionRecord[] {
    return [...this.sessionsById.values()].map(cloneSession);
  }

  get items(): readonly DeploymentActivationExecutionItemRecord[] {
    return [...this.itemsById.values()].map(cloneItem);
  }

  get downstreamWriteCount(): number {
    return (
      this.calls.forbiddenClaimWrites +
      this.calls.forbiddenStartWrites +
      this.calls.forbiddenCompletionWrites +
      this.calls.forbiddenRollbackWrites +
      this.calls.forbiddenActivationWrites +
      this.calls.forbiddenBindingWrites +
      this.calls.forbiddenDeploymentRunFinalizationWrites
    );
  }

  private storeSession(session: DeploymentActivationExecutionSessionRecord): void {
    this.sessionsById.set(session.id, cloneSession(session));
  }

  private storeItem(item: DeploymentActivationExecutionItemRecord): void {
    this.itemsById.set(item.id, cloneItem(item));
  }

  private maybeThrow(): void {
    if (this.shouldThrow) {
      throw new Error("activation execution persistence repository failed");
    }
  }
}

function cloneSession(
  session: DeploymentActivationExecutionSessionRecord,
): DeploymentActivationExecutionSessionRecord {
  return {
    ...session,
    rollbackBoundary: cloneRollbackBoundary(session.rollbackBoundary),
    preparationEvidence: cloneRecord(session.preparationEvidence),
    executionMetadata: cloneRecord(session.executionMetadata),
  };
}

function cloneSessionPayload(
  payload: CreateDeploymentActivationExecutionSessionPayload,
): CreateDeploymentActivationExecutionSessionPayload {
  return {
    ...payload,
    rollbackBoundary: cloneRollbackBoundary(payload.rollbackBoundary),
    preparationEvidence: cloneRecord(payload.preparationEvidence),
    executionMetadata: cloneRecord(payload.executionMetadata),
  };
}

function cloneItem(
  item: DeploymentActivationExecutionItemRecord,
): DeploymentActivationExecutionItemRecord {
  return {
    ...item,
    expectedCurrentState: cloneRecord(item.expectedCurrentState),
    targetState: cloneRecord(item.targetState),
    dependencyKeys: [...item.dependencyKeys],
    executionEvidence: cloneRecord(item.executionEvidence),
  };
}

function cloneItemPayload(
  payload: CreateDeploymentActivationExecutionItemPayload,
): CreateDeploymentActivationExecutionItemPayload {
  return {
    ...payload,
    expectedCurrentState: cloneRecord(payload.expectedCurrentState),
    targetState: cloneRecord(payload.targetState),
    dependencyKeys: [...payload.dependencyKeys],
    executionEvidence: cloneRecord(payload.executionEvidence),
  };
}
