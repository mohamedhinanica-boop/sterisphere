import type {
  DeploymentHardwareBindingAtomicCommand,
  DeploymentHardwareBindingAtomicResult,
  DeploymentHardwareBindingSnapshot,
  DeploymentHardwareBindingSnapshotQuery,
} from "./deployment-hardware-binding-types";

export interface DeploymentHardwareBindingRepository {
  loadHardwareBindingSnapshot(
    query: DeploymentHardwareBindingSnapshotQuery,
  ): Promise<DeploymentHardwareBindingSnapshot>;

  bindHardwareAtomically(
    command: DeploymentHardwareBindingAtomicCommand,
  ): Promise<DeploymentHardwareBindingAtomicResult>;
}
