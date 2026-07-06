import type {
  CreatedClinic,
  CreatedDeploymentRun,
  DeploymentRepositoryBatchResult,
  DeploymentRepositoryRecordResult,
  MarkDeploymentCompletedResult,
  RollbackDeploymentResult,
} from "./deployment-repository-types";
import type {
  CreateAuditEntryPayload,
  CreateClinicPayload,
  CreateClinicSettingsPayload,
  CreateDeploymentRunPayload,
  CreateHardwarePlanPayload,
  CreateProviderPlanPayload,
  CreateSterilizersPayload,
  CreateWorkstationsPayload,
  MarkDeploymentCompletedPayload,
  RollbackDeploymentPayload,
} from "./deployment-repository-payloads";

const PERSISTENCE_NOT_IMPLEMENTED =
  "Deployment persistence has not been implemented.";

export interface DeploymentRepository {
  createClinic(input: CreateClinicPayload): Promise<CreatedClinic>;
  createDeploymentRun(
    input: CreateDeploymentRunPayload,
  ): Promise<CreatedDeploymentRun>;
  createClinicSettings(
    input: CreateClinicSettingsPayload,
  ): Promise<DeploymentRepositoryRecordResult>;
  createWorkstations(
    input: CreateWorkstationsPayload,
  ): Promise<DeploymentRepositoryBatchResult>;
  createSterilizers(
    input: CreateSterilizersPayload,
  ): Promise<DeploymentRepositoryBatchResult>;
  createProviderPlans(
    input: CreateProviderPlanPayload,
  ): Promise<DeploymentRepositoryRecordResult>;
  createHardwarePlans(
    input: CreateHardwarePlanPayload,
  ): Promise<DeploymentRepositoryRecordResult>;
  createAuditEntry(
    input: CreateAuditEntryPayload,
  ): Promise<DeploymentRepositoryRecordResult>;
  markDeploymentCompleted(
    input: MarkDeploymentCompletedPayload,
  ): Promise<MarkDeploymentCompletedResult>;
  rollbackDeployment(
    input: RollbackDeploymentPayload,
  ): Promise<RollbackDeploymentResult>;
}

export class SupabaseDeploymentRepository
  implements DeploymentRepository
{
  async createClinic(_input: CreateClinicPayload): Promise<CreatedClinic> {
    return notImplemented();
  }

  async createDeploymentRun(
    _input: CreateDeploymentRunPayload,
  ): Promise<CreatedDeploymentRun> {
    return notImplemented();
  }

  async createClinicSettings(
    _input: CreateClinicSettingsPayload,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async createWorkstations(
    _input: CreateWorkstationsPayload,
  ): Promise<DeploymentRepositoryBatchResult> {
    return notImplemented();
  }

  async createSterilizers(
    _input: CreateSterilizersPayload,
  ): Promise<DeploymentRepositoryBatchResult> {
    return notImplemented();
  }

  async createProviderPlans(
    _input: CreateProviderPlanPayload,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async createHardwarePlans(
    _input: CreateHardwarePlanPayload,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async createAuditEntry(
    _input: CreateAuditEntryPayload,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async markDeploymentCompleted(
    _input: MarkDeploymentCompletedPayload,
  ): Promise<MarkDeploymentCompletedResult> {
    return notImplemented();
  }

  async rollbackDeployment(
    _input: RollbackDeploymentPayload,
  ): Promise<RollbackDeploymentResult> {
    return notImplemented();
  }
}

function notImplemented(): never {
  throw new Error(PERSISTENCE_NOT_IMPLEMENTED);
}
