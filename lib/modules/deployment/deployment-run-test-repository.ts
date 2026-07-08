import type {
  AttachDeploymentRunRollbackRecoveryPayload,
  CreateDeploymentRunPersistencePayload,
  StoreDeploymentRunAuditEvidencePayload,
} from "./deployment-run-payload";
import type { DeploymentRunRepository } from "./deployment-run-repository";
import type {
  DeploymentRunPersistenceResult,
  DeploymentRunRecord,
  DeploymentRunStatusUpdatePayload,
} from "./deployment-run-types";

export interface DeploymentRunTestRepositoryCalls {
  findByDeploymentRunId: number;
  findByIdempotencyKey: number;
  createDeploymentRun: number;
  updateLifecycleState: number;
  updateAuditEvidence: number;
  attachRollbackRecovery: number;
  markStarted: number;
  markCompleted: number;
  markFailed: number;
  markBlocked: number;
  forbiddenClinicCreates: 0;
  forbiddenTenantCreates: 0;
  forbiddenSettingsWrites: 0;
  forbiddenUserWrites: 0;
  forbiddenStageWrites: 0;
  forbiddenEngineExecutions: 0;
}

export class InMemoryDeploymentRunTestRepository
  implements DeploymentRunRepository
{
  readonly calls: DeploymentRunTestRepositoryCalls = {
    findByDeploymentRunId: 0,
    findByIdempotencyKey: 0,
    createDeploymentRun: 0,
    updateLifecycleState: 0,
    updateAuditEvidence: 0,
    attachRollbackRecovery: 0,
    markStarted: 0,
    markCompleted: 0,
    markFailed: 0,
    markBlocked: 0,
    forbiddenClinicCreates: 0,
    forbiddenTenantCreates: 0,
    forbiddenSettingsWrites: 0,
    forbiddenUserWrites: 0,
    forbiddenStageWrites: 0,
    forbiddenEngineExecutions: 0,
  };

  private readonly recordsByDeploymentRunId = new Map<
    string,
    DeploymentRunRecord
  >();
  private readonly recordsByIdempotencyKey = new Map<
    string,
    DeploymentRunRecord
  >();

  constructor(seedRecords: readonly DeploymentRunRecord[] = []) {
    seedRecords.forEach((record) => this.storeRecord(record));
  }

  async findByDeploymentRunId(
    deploymentRunId: string,
  ): Promise<DeploymentRunRecord | null> {
    this.calls.findByDeploymentRunId += 1;

    return this.recordsByDeploymentRunId.get(deploymentRunId) ?? null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<DeploymentRunRecord | null> {
    this.calls.findByIdempotencyKey += 1;

    return this.recordsByIdempotencyKey.get(idempotencyKey) ?? null;
  }

  async createDeploymentRun(
    payload: CreateDeploymentRunPersistencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.createDeploymentRun += 1;

    const existingRecord = this.recordsByIdempotencyKey.get(
      payload.idempotencyKey,
    );

    if (existingRecord) {
      return {
        ok: true,
        deploymentRun: existingRecord,
        message: "Existing in-memory deployment run reused.",
      };
    }

    const record: DeploymentRunRecord = {
      ...payload,
    };

    this.storeRecord(record);

    return {
      ok: true,
      deploymentRun: record,
      message: "In-memory deployment run evidence record created.",
    };
  }

  async storeAuditEvidence(
    payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    return this.updateAuditEvidence(payload);
  }

  async updateAuditEvidence(
    payload: StoreDeploymentRunAuditEvidencePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.updateAuditEvidence += 1;

    return this.updateRecord(payload.deploymentRunId, (record) => ({
      ...record,
      auditEvidence: payload.auditEvidence,
      lifecycleSummary: payload.lifecycleSummary,
      rollbackRecovery: payload.rollbackRecovery,
      metadata: payload.metadata,
    }));
  }

  async attachRollbackRecovery(
    payload: AttachDeploymentRunRollbackRecoveryPayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.attachRollbackRecovery += 1;

    return this.updateRecord(payload.deploymentRunId, (record) => ({
      ...record,
      rollbackRecovery: payload.rollbackRecovery,
      lifecycleSummary: payload.lifecycleSummary,
      metadata: payload.metadata,
    }));
  }

  async updateLifecycleState(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.updateLifecycleState += 1;

    return this.updateRecord(payload.deploymentRunId, (record) => ({
      ...record,
      lifecycleState: payload.lifecycleState,
      deploymentStatus: payload.deploymentStatus,
      persistenceStatus: payload.persistenceStatus,
      metadata: payload.metadata ?? record.metadata,
    }));
  }

  async markStarted(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.markStarted += 1;

    return this.updateRecord(payload.deploymentRunId, (record) => ({
      ...record,
      lifecycleState: payload.lifecycleState,
      deploymentStatus: payload.deploymentStatus,
      persistenceStatus: payload.persistenceStatus,
      startedAt: payload.updatedAt,
      metadata: payload.metadata ?? record.metadata,
    }));
  }

  async markCompleted(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.markCompleted += 1;

    return this.updateRecord(payload.deploymentRunId, (record) => ({
      ...record,
      lifecycleState: payload.lifecycleState,
      deploymentStatus: payload.deploymentStatus,
      persistenceStatus: payload.persistenceStatus,
      completedAt: payload.updatedAt,
      metadata: payload.metadata ?? record.metadata,
    }));
  }

  async markFailed(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.markFailed += 1;

    return this.updateRecord(payload.deploymentRunId, (record) => ({
      ...record,
      lifecycleState: payload.lifecycleState,
      deploymentStatus: payload.deploymentStatus,
      persistenceStatus: payload.persistenceStatus,
      failedAt: payload.updatedAt,
      metadata: payload.metadata ?? record.metadata,
    }));
  }

  async markBlocked(
    payload: DeploymentRunStatusUpdatePayload,
  ): Promise<DeploymentRunPersistenceResult> {
    this.calls.markBlocked += 1;

    return this.updateRecord(payload.deploymentRunId, (record) => ({
      ...record,
      lifecycleState: payload.lifecycleState,
      deploymentStatus: payload.deploymentStatus,
      persistenceStatus: payload.persistenceStatus,
      blockedAt: payload.updatedAt,
      metadata: payload.metadata ?? record.metadata,
    }));
  }

  get records(): readonly DeploymentRunRecord[] {
    return [...this.recordsByDeploymentRunId.values()];
  }

  private updateRecord(
    deploymentRunId: string,
    updater: (record: DeploymentRunRecord) => DeploymentRunRecord,
  ): DeploymentRunPersistenceResult {
    const existingRecord =
      this.recordsByDeploymentRunId.get(deploymentRunId) ?? null;

    if (!existingRecord) {
      return {
        ok: false,
        deploymentRun: null,
        message: "In-memory deployment run was not found.",
      };
    }

    const updatedRecord = updater(existingRecord);
    this.storeRecord(updatedRecord);

    return {
      ok: true,
      deploymentRun: updatedRecord,
      message: "In-memory deployment run evidence record updated.",
    };
  }

  private storeRecord(record: DeploymentRunRecord): void {
    this.recordsByDeploymentRunId.set(record.deploymentRunId, record);
    this.recordsByIdempotencyKey.set(record.idempotencyKey, record);
  }
}
