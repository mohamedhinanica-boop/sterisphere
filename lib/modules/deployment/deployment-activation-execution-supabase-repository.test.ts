import {
  assertAtMostOne,
  executionIdentityNotPersisted,
  mapClinicCurrentState,
  mapClinicSettingsCurrentState,
  mapDeploymentRunCurrentState,
  mapDeploymentRunRow,
  mapHardwareAssignmentCurrentState,
  mapHardwareBindingCurrentState,
  mapHardwareCurrentState,
  mapHardwareOperationalBindingEvidence,
  mapProviderCurrentState,
  mapSterilizerCurrentState,
  mapWorkstationCurrentState,
} from "./deployment-activation-execution-supabase-repository";
import type {
  DeploymentActivationPlanItem,
} from "./deployment-activation-plan-types";

export interface DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationExecutionSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationExecutionSupabaseRepositoryHarnessScenario[];
}

const CLINIC_ID = "clinic-activation-execution-0001";
const OTHER_CLINIC_ID = "clinic-other-0001";
const DEPLOYMENT_RUN_ID = "deployment-run-activation-execution-0001";
const PLAN_KEY = `activation-plan-${DEPLOYMENT_RUN_ID}`;

export async function runDeploymentActivationExecutionSupabaseRepositoryHarness(): Promise<DeploymentActivationExecutionSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioDeploymentRunMapping(),
    scenarioWrongClinicRunDistinction(),
    scenarioFinalizedRunMappingPreserved(),
    scenarioExecutionIdentityAbsent(),
    scenarioProviderStateMapping(),
    scenarioSterilizerStateMapping(),
    scenarioWorkstationStateMapping(),
    scenarioHardwareStateMapping(),
    scenarioDiscoveredHardwareStatusPreserved(),
    scenarioBindingColumnsPreserved(),
    scenarioAssignmentStateMapping(),
    scenarioClinicActivationStateMapping(),
    scenarioClinicSettingsUnsupportedMapping(),
    scenarioDuplicateLookupProtection(),
    scenarioMissingEntityMapping(),
    scenarioNoMutation(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioDeploymentRunMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const run = mapDeploymentRunRow({
    deployment_run_id: DEPLOYMENT_RUN_ID,
    clinic_id: CLINIC_ID,
    lifecycle_state: "completed",
    deployment_status: "deployed",
  });
  const currentState = mapDeploymentRunCurrentState(run);

  return expectScenario(
    "deployment run maps execution identity and current state",
    run.deploymentRunId === DEPLOYMENT_RUN_ID &&
      run.clinicId === CLINIC_ID &&
      run.lifecycleState === "completed" &&
      currentState.deploymentStatus === "deployed",
    JSON.stringify({ run, currentState }),
  );
}

function scenarioWrongClinicRunDistinction(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const run = mapDeploymentRunRow({
    deployment_run_id: DEPLOYMENT_RUN_ID,
    clinic_id: OTHER_CLINIC_ID,
    lifecycle_state: "completed",
    deployment_status: "deployed",
  });

  return expectScenario(
    "wrong-clinic deployment run remains distinguishable",
    run.clinicId === OTHER_CLINIC_ID && run.clinicId !== CLINIC_ID,
    JSON.stringify(run),
  );
}

function scenarioFinalizedRunMappingPreserved(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const run = mapDeploymentRunRow({
    deployment_run_id: DEPLOYMENT_RUN_ID,
    clinic_id: CLINIC_ID,
    lifecycle_state: "finalized",
    deployment_status: "activated",
  });

  return expectScenario(
    "finalized deployment run values remain unnormalized",
    run.lifecycleState === "finalized" && run.deploymentStatus === "activated",
    JSON.stringify(run),
  );
}

function scenarioExecutionIdentityAbsent(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  return expectScenario(
    "execution identity is absent because no execution table is persisted",
    executionIdentityNotPersisted() === null,
    String(executionIdentityNotPersisted()),
  );
}

function scenarioProviderStateMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapProviderCurrentState(
    {
      id: "provider-row-001",
      clinic_id: CLINIC_ID,
      deployment_provider_key: "provider-001",
      provisioning_status: "placeholder",
      active: false,
    },
    planItem("provider_shell", "provider-001", "provider-row-001"),
  );

  return expectScenario(
    "provider shell maps compact execution drift state",
    state.provisioningStatus === "placeholder" && state.active === false,
    JSON.stringify(state),
  );
}

function scenarioSterilizerStateMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapSterilizerCurrentState(
    {
      id: "sterilizer-row-001",
      clinic_id: CLINIC_ID,
      deployment_sterilizer_key: "sterilizer-001",
      provisioning_status: "planned",
      active: false,
    },
    planItem("sterilizer_shell", "sterilizer-001", "sterilizer-row-001"),
  );

  return expectScenario(
    "sterilizer shell maps compact execution drift state",
    state.provisioningStatus === "planned" && state.active === false,
    JSON.stringify(state),
  );
}

function scenarioWorkstationStateMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapWorkstationCurrentState(
    {
      id: "workstation-row-001",
      clinic_id: CLINIC_ID,
      deployment_workstation_key: "workstation-001",
      provisioning_status: "planned",
      active: false,
    },
    planItem("workstation_shell", "workstation-001", "workstation-row-001"),
  );

  return expectScenario(
    "workstation shell maps compact execution drift state",
    state.provisioningStatus === "planned" && state.active === false,
    JSON.stringify(state),
  );
}

function scenarioHardwareStateMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapHardwareCurrentState(
    hardwareRow(),
    planItem("hardware_shell", "hardware-001", "hardware-row-001"),
  );

  return expectScenario(
    "hardware shell maps compact execution drift state",
    state.provisioningStatus === "planned" && state.active === false,
    JSON.stringify(state),
  );
}

function scenarioDiscoveredHardwareStatusPreserved(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const evidence = mapHardwareOperationalBindingEvidence(
    hardwareRow({ status: "discovered" }),
  );

  return expectScenario(
    "hardware discovered status is preserved in operational evidence",
    evidence.status === "discovered",
    JSON.stringify(evidence),
  );
}

function scenarioBindingColumnsPreserved(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const row = hardwareRow({
    agent_id: "agent-live-001",
    default_workstation_id: "workstation-row-001",
    current_workstation_id: "workstation-row-002",
  });
  const bindingState = mapHardwareBindingCurrentState(
    row,
    bindingPlanItem("workstation"),
  );
  const evidence = mapHardwareOperationalBindingEvidence(row);

  return expectScenario(
    "hardware binding state and source binding columns are preserved",
    bindingState.targetId === "workstation-row-002" &&
      evidence.agentId === "agent-live-001" &&
      evidence.defaultWorkstationId === "workstation-row-001" &&
      evidence.currentWorkstationId === "workstation-row-002",
    JSON.stringify({ bindingState, evidence }),
  );
}

function scenarioAssignmentStateMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapHardwareAssignmentCurrentState(
    {
      id: "assignment-row-001",
      clinic_id: CLINIC_ID,
      deployment_hardware_key: "hardware-001",
      assignment_key: "hardware-assignment-hardware-001",
      target_type: "workstation",
      target_deployment_key: "workstation-001",
      assignment_status: "planned",
      active: false,
    },
    planItem("hardware_assignment", "hardware-001", "assignment-row-001"),
  );

  return expectScenario(
    "hardware assignment maps execution current state",
    state.assignmentStatus === "planned" && state.active === false,
    JSON.stringify(state),
  );
}

function scenarioClinicActivationStateMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapClinicCurrentState(
    { id: CLINIC_ID, deployment_status: "draft" },
    CLINIC_ID,
  );

  return expectScenario(
    "clinic maps activation status from durable field",
    state.deploymentStatus === "draft",
    JSON.stringify(state),
  );
}

function scenarioClinicSettingsUnsupportedMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapClinicSettingsCurrentState(
    { id: "settings-row-001", clinic_id: CLINIC_ID },
    CLINIC_ID,
  );

  return expectScenario(
    "clinic settings exposes unsupported activation field explicitly",
    state.unsupportedActivationField === "not_persisted",
    JSON.stringify(state),
  );
}

function scenarioDuplicateLookupProtection(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  try {
    assertAtMostOne([{}, {}], "hardware_assignment");
  } catch (error) {
    return expectScenario(
      "duplicate lookup protection throws deterministic repository error",
      error instanceof Error &&
        error.message.includes("Duplicate hardware_assignment rows"),
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario(
    "duplicate lookup protection throws deterministic repository error",
    false,
    "duplicate rows were accepted",
  );
}

function scenarioMissingEntityMapping(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const state = mapProviderCurrentState(
    {
      id: "provider-row-002",
      clinic_id: CLINIC_ID,
      deployment_provider_key: "provider-002",
      provisioning_status: "placeholder",
      active: false,
    },
    planItem("provider_shell", "provider-001", "provider-row-001"),
  );

  return expectScenario(
    "incompatible entity id maps to drift-visible state",
    state.__incompatible === "entity_id_mismatch",
    JSON.stringify(state),
  );
}

function scenarioNoMutation(): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  const row = hardwareRow();
  const before = JSON.stringify(row);
  mapHardwareBindingCurrentState(row, bindingPlanItem("workstation"));

  return expectScenario(
    "execution mappers do not mutate source rows",
    JSON.stringify(row) === before,
    JSON.stringify(row),
  );
}

function planItem(
  entityType: DeploymentActivationPlanItem["entityType"],
  deploymentKey: string | null,
  entityId: string | null,
): DeploymentActivationPlanItem {
  return {
    planItemKey: `${PLAN_KEY}:${entityType}:${deploymentKey ?? "root"}`,
    sequence: 1,
    entityType,
    entityId,
    deploymentKey,
    clinicId: CLINIC_ID,
    action: "activate",
    currentState: {},
    targetState: {},
    dependencyKeys: [],
    reversible: true,
    rollbackAction: "restore prior state",
    status: "planned",
    blockers: [],
    warnings: [],
  };
}

function bindingPlanItem(
  targetType: "workstation" | "sterilizer",
): DeploymentActivationPlanItem {
  return {
    ...planItem("hardware_binding", "hardware-001", "hardware-row-001"),
    action: "bind",
    currentState: {
      hardwareId: "hardware-row-001",
      targetId: null,
      targetType,
    },
    targetState: {
      hardwareId: "hardware-row-001",
      targetId: `${targetType}-row-001`,
      targetType,
    },
  };
}

function hardwareRow(
  input: Partial<Parameters<typeof mapHardwareCurrentState>[0]> = {},
): Parameters<typeof mapHardwareCurrentState>[0] {
  return {
    id: input.id ?? "hardware-row-001",
    clinic_id: input.clinic_id === undefined ? CLINIC_ID : input.clinic_id,
    deployment_hardware_key:
      input.deployment_hardware_key === undefined
        ? "hardware-001"
        : input.deployment_hardware_key,
    provisioning_status:
      input.provisioning_status === undefined
        ? "planned"
        : input.provisioning_status,
    active: input.active === undefined ? false : input.active,
    status: input.status === undefined ? "planned" : input.status,
    agent_id: input.agent_id === undefined ? null : input.agent_id,
    default_workstation_id:
      input.default_workstation_id === undefined
        ? null
        : input.default_workstation_id,
    current_workstation_id:
      input.current_workstation_id === undefined
        ? null
        : input.current_workstation_id,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationExecutionSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}
