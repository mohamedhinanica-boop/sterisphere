export type DeploymentHardwareBindingTargetType = "workstation" | "sterilizer";
export type DeploymentHardwareBindingStatus =
  | "bound"
  | "already_bound"
  | "blocked"
  | "conflict"
  | "not_found"
  | "error";

export type DeploymentHardwareBindingStateKind =
  | "unbound"
  | "workstation_bound"
  | "sterilizer_bound"
  | "invalid_mixed"
  | "invalid_partial";

export interface DeploymentHardwareBindingState {
  defaultWorkstationId: string | null;
  currentWorkstationId: string | null;
  defaultSterilizerId: string | null;
  currentSterilizerId: string | null;
}

export interface DeploymentHardwareBindingSnapshotQuery {
  clinicId: string;
  hardwareId: string;
  deploymentHardwareKey: string;
}

export interface DeploymentHardwareBindingSnapshot {
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  clinicId: string | null;
  currentWorkstationId: string | null;
  currentSterilizerId: string | null;
  bindingState: DeploymentHardwareBindingState | null;
  bindingKind: DeploymentHardwareBindingStateKind | null;
}

export interface DeploymentHardwareBindingAtomicCommand {
  clinicId: string;
  deploymentRunKey: string;
  sessionId: string;
  executionKey: string;
  claimantId: string;
  ownershipToken: string;
  expectedLeaseExpiresAt: string;
  itemId: string;
  executionItemKey: string;
  planItemKey: string;
  expectedSequence: number;
  expectedEntityType: "hardware_binding";
  expectedEntityId: string;
  expectedAction: "bind";
  expectedItemStartedAt: string;
  expectedAttemptCount: number;
  hardwareId: string;
  expectedHardwareKey: string;
  targetType: DeploymentHardwareBindingTargetType;
  targetId: string;
  expectedTargetDeploymentKey: string;
  expectedCurrentState: Record<string, unknown>;
  targetState: Record<string, unknown>;
  proposedBoundAt: string;
}

export interface DeploymentHardwareBindingAtomicResult {
  ok: boolean;
  status: DeploymentHardwareBindingStatus;
  bindingWritten: boolean;
  hardwareId: string;
  deploymentHardwareKey: string;
  targetType: DeploymentHardwareBindingTargetType;
  targetId: string;
  targetDeploymentKey: string;
  previousState: DeploymentHardwareBindingState | null;
  resultingState: DeploymentHardwareBindingState | null;
  bindingTimestamp: string | null;
  issueCode: string | null;
  message: string;
}

export interface DeploymentHardwareBindingEvidence
  extends DeploymentHardwareBindingAtomicResult {
  downstream: {
    executionItemsCompleted: 0;
    dependenciesProgressed: 0;
    nextItemsStarted: 0;
    deploymentsFinalized: 0;
    rollbacksExecuted: 0;
  };
}
