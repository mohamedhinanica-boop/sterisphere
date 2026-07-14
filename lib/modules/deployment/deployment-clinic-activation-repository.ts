import type {
  DeploymentClinicActivationAtomicCommand,
  DeploymentClinicActivationAtomicResult,
  DeploymentClinicActivationCommand,
  DeploymentClinicActivationSnapshot,
} from "./deployment-clinic-activation-types";

export type DeploymentClinicActivationSnapshotRequest = Pick<
  DeploymentClinicActivationCommand,
  | "clinicId"
  | "deploymentRunId"
  | "sessionId"
  | "executionKey"
  | "itemId"
  | "executionItemKey"
  | "planItemKey"
>;

export interface DeploymentClinicActivationRepository {
  loadClinicActivationSnapshot(
    request: DeploymentClinicActivationSnapshotRequest,
  ): Promise<DeploymentClinicActivationSnapshot>;

  activateClinicAtomically?(
    command: DeploymentClinicActivationAtomicCommand,
  ): Promise<DeploymentClinicActivationAtomicResult>;
}