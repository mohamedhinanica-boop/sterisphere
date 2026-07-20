import {
  DeploymentHardwareBindingRepositoryError,
  hardwareBindingRpcPayload,
  mapHardwareBindingRpcResult,
  mapHardwareBindingSnapshotRow,
  normalizeBindingKind,
} from "./deployment-hardware-binding-supabase-repository";
import type {
  DeploymentHardwareBindingAtomicCommand,
  DeploymentHardwareBindingState,
} from "./deployment-hardware-binding-types";

const COMMAND = {
  clinicId: "10000000-0000-4000-8000-000000000001",
  deploymentRunKey: "deployment-run-001",
  sessionId: "20000000-0000-4000-8000-000000000001",
  executionKey: "execution-001",
  claimantId: "setup-runtime",
  ownershipToken: "secret-token",
  expectedLeaseExpiresAt: "2026-01-01T13:00:00.000Z",
  itemId: "30000000-0000-4000-8000-000000000001",
  executionItemKey: "execution-001:binding-001",
  planItemKey: "plan-001:binding-001",
  expectedSequence: 40,
  expectedEntityType: "hardware_binding",
  expectedEntityId: "40000000-0000-4000-8000-000000000001",
  expectedAction: "bind",
  expectedItemStartedAt: "2026-01-01T12:00:00.000Z",
  expectedAttemptCount: 1,
  hardwareId: "40000000-0000-4000-8000-000000000001",
  expectedHardwareKey: "hardware-001",
  targetType: "workstation",
  targetId: "50000000-0000-4000-8000-000000000001",
  expectedTargetDeploymentKey: "workstation-001",
  expectedCurrentState: {
    deploymentHardwareKey: "hardware-001",
    hardwareId: "40000000-0000-4000-8000-000000000001",
    targetDeploymentKey: "workstation-001",
    targetId: null,
    targetType: "workstation",
  },
  targetState: {
    hardwareId: "40000000-0000-4000-8000-000000000001",
    targetDeploymentKey: "workstation-001",
    targetId: "50000000-0000-4000-8000-000000000001",
    targetType: "workstation",
  },
  proposedBoundAt: "2026-01-01T12:05:00.000Z",
} satisfies DeploymentHardwareBindingAtomicCommand;

export function runDeploymentHardwareBindingSupabaseRepositoryHarness() {
  const payload = hardwareBindingRpcPayload(COMMAND);
  const scenarios = [
    {
      name: "all RPC arguments map explicitly",
      passed: Object.keys(payload).length === 24 &&
        payload.p_ownership_token === COMMAND.ownershipToken &&
        payload.p_target_id === COMMAND.targetId &&
        payload.p_proposed_bound_at === COMMAND.proposedBoundAt,
    },
    { name: "bound response", passed: mappedStatus("bound") },
    { name: "already_bound response", passed: mappedStatus("already_bound") },
    { name: "malformed response rejected", passed: throws(() => mapHardwareBindingRpcResult([], COMMAND)) },
    { name: "unknown status rejected", passed: throws(() => mapHardwareBindingRpcResult([row("future_status")], COMMAND)) },
    { name: "malformed UUID rejected", passed: throws(() => mapHardwareBindingRpcResult([{ ...row("bound"), target_id: "bad" }], COMMAND)) },
    { name: "inconsistent identity rejected", passed: throws(() => mapHardwareBindingRpcResult([{ ...row("bound"), target_deployment_key: "workstation-999" }], COMMAND)) },
    ...bindingKinds(),
  ];
  return { passed: scenarios.every((scenario) => scenario.passed), scenarios };
}

function mappedStatus(status: "bound" | "already_bound") {
  const result = mapHardwareBindingRpcResult([row(status)], COMMAND);
  return result.ok && result.status === status && result.bindingWritten === (status === "bound");
}

function row(status: string) {
  const unbound = state();
  const bound = state({
    defaultWorkstationId: COMMAND.targetId,
    currentWorkstationId: COMMAND.targetId,
  });
  const success = status === "bound" || status === "already_bound";
  return {
    status,
    binding_written: status === "bound",
    hardware_id: COMMAND.hardwareId,
    deployment_hardware_key: COMMAND.expectedHardwareKey,
    target_id: COMMAND.targetId,
    target_type: COMMAND.targetType,
    target_deployment_key: COMMAND.expectedTargetDeploymentKey,
    previous_state: success ? (status === "already_bound" ? bound : unbound) : null,
    resulting_state: success ? bound : null,
    binding_timestamp: success ? COMMAND.proposedBoundAt : null,
    issue_code: success ? null : "blocked",
    message: "Safe RPC result.",
  };
}

function bindingKinds() {
  const workstation = COMMAND.targetId;
  const sterilizer = "60000000-0000-4000-8000-000000000001";
  const cases: Array<[string, DeploymentHardwareBindingState, string]> = [
    ["unbound", state(), "unbound"],
    ["workstation bound", state({ defaultWorkstationId: workstation, currentWorkstationId: workstation }), "workstation_bound"],
    ["sterilizer bound", state({ defaultSterilizerId: sterilizer, currentSterilizerId: sterilizer }), "sterilizer_bound"],
    ["mixed invalid", state({ defaultWorkstationId: workstation, currentWorkstationId: workstation, defaultSterilizerId: sterilizer, currentSterilizerId: sterilizer }), "invalid_mixed"],
    ["partial invalid", state({ currentWorkstationId: workstation }), "invalid_partial"],
  ];
  const snapshot = mapHardwareBindingSnapshotRow({
    id: COMMAND.hardwareId,
    clinic_id: COMMAND.clinicId,
    deployment_hardware_key: COMMAND.expectedHardwareKey,
    default_workstation_id: null,
    current_workstation_id: null,
    default_sterilizer_id: null,
    current_sterilizer_id: null,
  });
  return [
    ...cases.map(([name, value, expected]) => ({
      name: `snapshot ${name}`,
      passed: normalizeBindingKind(value) === expected,
    })),
    { name: "snapshot identity mapped", passed: snapshot.hardwareId === COMMAND.hardwareId && snapshot.bindingKind === "unbound" },
  ];
}

function state(override: Partial<DeploymentHardwareBindingState> = {}): DeploymentHardwareBindingState {
  return {
    defaultWorkstationId: null,
    currentWorkstationId: null,
    defaultSterilizerId: null,
    currentSterilizerId: null,
    ...override,
  };
}

function throws(action: () => unknown): boolean {
  try {
    action();
    return false;
  } catch (caught) {
    return caught instanceof DeploymentHardwareBindingRepositoryError;
  }
}
