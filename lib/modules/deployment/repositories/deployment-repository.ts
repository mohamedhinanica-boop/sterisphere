import type {
  CreateAuditEntryInput,
  CreateClinicInput,
  CreateClinicSettingsInput,
  CreateDeploymentRunInput,
  CreatedClinic,
  CreatedDeploymentRun,
  CreateHardwarePlansInput,
  CreateProviderPlansInput,
  CreateSterilizersInput,
  CreateWorkstationsInput,
  DeploymentRepositoryBatchResult,
  DeploymentRepositoryRecordResult,
  MarkDeploymentCompletedInput,
  MarkDeploymentCompletedResult,
  RollbackDeploymentInput,
  RollbackDeploymentResult,
} from "./deployment-repository-types";

const PERSISTENCE_NOT_IMPLEMENTED =
  "Deployment persistence has not been implemented.";

export interface DeploymentRepository {
  createClinic(input: CreateClinicInput): Promise<CreatedClinic>;
  createDeploymentRun(
    input: CreateDeploymentRunInput,
  ): Promise<CreatedDeploymentRun>;
  createClinicSettings(
    input: CreateClinicSettingsInput,
  ): Promise<DeploymentRepositoryRecordResult>;
  createWorkstations(
    input: CreateWorkstationsInput,
  ): Promise<DeploymentRepositoryBatchResult>;
  createSterilizers(
    input: CreateSterilizersInput,
  ): Promise<DeploymentRepositoryBatchResult>;
  createProviderPlans(
    input: CreateProviderPlansInput,
  ): Promise<DeploymentRepositoryRecordResult>;
  createHardwarePlans(
    input: CreateHardwarePlansInput,
  ): Promise<DeploymentRepositoryRecordResult>;
  createAuditEntry(
    input: CreateAuditEntryInput,
  ): Promise<DeploymentRepositoryRecordResult>;
  markDeploymentCompleted(
    input: MarkDeploymentCompletedInput,
  ): Promise<MarkDeploymentCompletedResult>;
  rollbackDeployment(
    input: RollbackDeploymentInput,
  ): Promise<RollbackDeploymentResult>;
}

export class SupabaseDeploymentRepository
  implements DeploymentRepository
{
  async createClinic(_input: CreateClinicInput): Promise<CreatedClinic> {
    return notImplemented();
  }

  async createDeploymentRun(
    _input: CreateDeploymentRunInput,
  ): Promise<CreatedDeploymentRun> {
    return notImplemented();
  }

  async createClinicSettings(
    _input: CreateClinicSettingsInput,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async createWorkstations(
    _input: CreateWorkstationsInput,
  ): Promise<DeploymentRepositoryBatchResult> {
    return notImplemented();
  }

  async createSterilizers(
    _input: CreateSterilizersInput,
  ): Promise<DeploymentRepositoryBatchResult> {
    return notImplemented();
  }

  async createProviderPlans(
    _input: CreateProviderPlansInput,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async createHardwarePlans(
    _input: CreateHardwarePlansInput,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async createAuditEntry(
    _input: CreateAuditEntryInput,
  ): Promise<DeploymentRepositoryRecordResult> {
    return notImplemented();
  }

  async markDeploymentCompleted(
    _input: MarkDeploymentCompletedInput,
  ): Promise<MarkDeploymentCompletedResult> {
    return notImplemented();
  }

  async rollbackDeployment(
    _input: RollbackDeploymentInput,
  ): Promise<RollbackDeploymentResult> {
    return notImplemented();
  }
}

function notImplemented(): never {
  throw new Error(PERSISTENCE_NOT_IMPLEMENTED);
}
