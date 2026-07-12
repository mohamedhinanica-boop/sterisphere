import {
  buildDeploymentRunActivationCurrentState,
  buildHardwareAssignmentActivationCurrentState,
  buildHardwareBindingActivationCurrentState,
  buildHardwareShellActivationCurrentState,
  buildProviderShellActivationCurrentState,
  buildSterilizerShellActivationCurrentState,
  buildWorkstationShellActivationCurrentState,
  compareActivationCurrentStates,
} from "./deployment-activation-current-state";

export interface DeploymentActivationCurrentStateHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationCurrentStateHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationCurrentStateHarnessScenario[];
}

const CLINIC_ID = "clinic-current-state-0001";

export async function runDeploymentActivationCurrentStateHarness(): Promise<DeploymentActivationCurrentStateHarnessResult> {
  const scenarios = [
    scenarioProviderEquivalentState(),
    scenarioSterilizerEquivalentState(),
    scenarioWorkstationEquivalentState(),
    scenarioHardwareDiscoveredEquivalentState(),
    scenarioHardwareNullBindingsEquivalentState(),
    scenarioAssignmentEquivalentTargetState(),
    scenarioPropertyOrderIgnored(),
    scenarioPresentationFieldsOmittedByBuilders(),
    scenarioSnakeCaseMappingEquivalent(),
    scenarioNullAndFalseRemainDifferent(),
    scenarioActiveDriftDetected(),
    scenarioProvisioningStatusDriftDetected(),
    scenarioProvisioningSourceDriftDetected(),
    scenarioHardwareBindingDriftDetected(),
    scenarioAssignmentTargetDriftDetected(),
    scenarioEntityIdDriftDetected(),
    scenarioMissingEntityDriftDetected(),
    scenarioBindingItemExpectsPreBindingState(),
    scenarioDeploymentFinalizationStateEquivalent(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioProviderEquivalentState(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "provider plan state equals equivalent live provider state",
    buildProviderShellActivationCurrentState({
      id: "provider-row-001",
      clinicId: CLINIC_ID,
      deploymentProviderKey: "provider-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "placeholder",
      active: false,
    }),
    buildProviderShellActivationCurrentState({
      id: "provider-row-001",
      clinicId: CLINIC_ID,
      deploymentProviderKey: "provider-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "placeholder",
      active: false,
    }),
  );
}

function scenarioSterilizerEquivalentState(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "sterilizer equivalent state",
    buildSterilizerShellActivationCurrentState({
      id: "sterilizer-row-001",
      clinicId: CLINIC_ID,
      deploymentSterilizerKey: "sterilizer-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      active: false,
    }),
    buildSterilizerShellActivationCurrentState({
      id: "sterilizer-row-001",
      clinicId: CLINIC_ID,
      deploymentSterilizerKey: "sterilizer-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      active: false,
    }),
  );
}

function scenarioWorkstationEquivalentState(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "workstation equivalent state",
    buildWorkstationShellActivationCurrentState({
      id: "workstation-row-001",
      clinicId: CLINIC_ID,
      deploymentWorkstationKey: "workstation-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      active: false,
    }),
    buildWorkstationShellActivationCurrentState({
      id: "workstation-row-001",
      clinicId: CLINIC_ID,
      deploymentWorkstationKey: "workstation-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      active: false,
    }),
  );
}

function scenarioHardwareDiscoveredEquivalentState(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "hardware status discovered equivalent state",
    hardwareState(),
    hardwareState({ operationalStatus: "discovered" }),
  );
}

function scenarioHardwareNullBindingsEquivalentState(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "hardware null bindings equivalent state",
    hardwareState(),
    hardwareState({ agentId: null, defaultWorkstationId: null, currentWorkstationId: null }),
  );
}

function scenarioAssignmentEquivalentTargetState(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "assignment equivalent target state",
    assignmentState(),
    assignmentState(),
  );
}

function scenarioPropertyOrderIgnored(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "property order differences do not cause drift",
    { active: false, provisioningStatus: "planned" },
    { provisioningStatus: "planned", active: false },
  );
}

function scenarioPresentationFieldsOmittedByBuilders(): DeploymentActivationCurrentStateHarnessScenario {
  const state = buildProviderShellActivationCurrentState({
    id: "provider-row-001",
    clinicId: CLINIC_ID,
    deploymentProviderKey: "provider-001",
    provisioningSource: "setup_draft",
    provisioningStatus: "placeholder",
    active: false,
  });

  return expectScenario(
    "presentation fields are omitted from canonical builder output",
    !("name" in state) && !("displayOrder" in state),
    JSON.stringify(state),
  );
}

function scenarioSnakeCaseMappingEquivalent(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "snake_case to camelCase mapping is equivalent",
    {
      deployment_hardware_key: "hardware-001",
      provisioning_source: "setup_draft",
      provisioning_status: "planned",
      current_workstation_id: null,
    },
    {
      deploymentHardwareKey: "hardware-001",
      provisioningSource: "setup_draft",
      provisioningStatus: "planned",
      currentWorkstationId: null,
    },
  );
}

function scenarioNullAndFalseRemainDifferent(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "null versus false remains non-equivalent where safety relevant",
    { active: null },
    { active: false },
    "$.active",
  );
}

function scenarioActiveDriftDetected(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "active false to true causes drift",
    hardwareState(),
    hardwareState({ active: true }),
    "$.active",
  );
}

function scenarioProvisioningStatusDriftDetected(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "provisioning status change causes drift",
    hardwareState(),
    hardwareState({ provisioningStatus: "archived" }),
    "$.provisioningStatus",
  );
}

function scenarioProvisioningSourceDriftDetected(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "provisioning source change causes drift",
    hardwareState(),
    hardwareState({ provisioningSource: "manual" }),
    "$.provisioningSource",
  );
}

function scenarioHardwareBindingDriftDetected(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "hardware binding added causes drift",
    hardwareState(),
    hardwareState({ currentWorkstationId: "workstation-row-001" }),
    "$.currentWorkstationId",
  );
}

function scenarioAssignmentTargetDriftDetected(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "assignment target changed causes drift",
    assignmentState(),
    assignmentState({ targetDeploymentKey: "sterilizer-001", targetType: "sterilizer" }),
    "$.targetDeploymentKey",
  );
}

function scenarioEntityIdDriftDetected(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "entity ID change causes drift",
    hardwareState(),
    hardwareState({ id: "hardware-row-002" }),
    "$.id",
  );
}

function scenarioMissingEntityDriftDetected(): DeploymentActivationCurrentStateHarnessScenario {
  return different(
    "missing entity causes drift",
    hardwareState(),
    {},
    "$.id",
  );
}

function scenarioBindingItemExpectsPreBindingState(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "proposed binding item does not falsely expect an existing binding",
    buildHardwareBindingActivationCurrentState({
      hardwareId: "hardware-row-001",
      deploymentHardwareKey: "hardware-001",
      targetType: "workstation",
      targetDeploymentKey: "workstation-001",
      targetId: null,
    }),
    buildHardwareBindingActivationCurrentState({
      hardwareId: "hardware-row-001",
      deploymentHardwareKey: "hardware-001",
      targetType: "workstation",
      targetDeploymentKey: "workstation-001",
      targetId: null,
    }),
  );
}

function scenarioDeploymentFinalizationStateEquivalent(): DeploymentActivationCurrentStateHarnessScenario {
  return equivalent(
    "deployment finalization current-state comparison is valid",
    buildDeploymentRunActivationCurrentState({
      deploymentRunId: "deployment-run-001",
      clinicId: CLINIC_ID,
      lifecycleState: "completed",
      deploymentStatus: "deployed",
    }),
    buildDeploymentRunActivationCurrentState({
      deploymentRunId: "deployment-run-001",
      clinicId: CLINIC_ID,
      lifecycleState: "completed",
      deploymentStatus: "deployed",
    }),
  );
}

function hardwareState(
  input: Partial<Parameters<typeof buildHardwareShellActivationCurrentState>[0]> = {},
): Record<string, unknown> {
  return buildHardwareShellActivationCurrentState({
    id: input.id ?? "hardware-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentHardwareKey: input.deploymentHardwareKey ?? "hardware-001",
    provisioningSource: input.provisioningSource ?? "setup_draft",
    provisioningStatus: input.provisioningStatus ?? "planned",
    active: input.active === undefined ? false : input.active,
    operationalStatus: input.operationalStatus ?? "discovered",
    agentId: input.agentId === undefined ? null : input.agentId,
    defaultWorkstationId:
      input.defaultWorkstationId === undefined
        ? null
        : input.defaultWorkstationId,
    currentWorkstationId:
      input.currentWorkstationId === undefined
        ? null
        : input.currentWorkstationId,
  });
}

function assignmentState(
  input: Partial<Parameters<typeof buildHardwareAssignmentActivationCurrentState>[0]> = {},
): Record<string, unknown> {
  return buildHardwareAssignmentActivationCurrentState({
    id: input.id ?? "assignment-row-001",
    clinicId: input.clinicId === undefined ? CLINIC_ID : input.clinicId,
    deploymentHardwareKey: input.deploymentHardwareKey ?? "hardware-001",
    assignmentKey: input.assignmentKey ?? "hardware-assignment-hardware-001",
    targetType: input.targetType ?? "workstation",
    targetDeploymentKey:
      input.targetDeploymentKey === undefined
        ? "workstation-001"
        : input.targetDeploymentKey,
    assignmentSource: input.assignmentSource ?? "setup_draft",
    assignmentStatus: input.assignmentStatus ?? "planned",
    active: input.active === undefined ? false : input.active,
  });
}

function equivalent(
  name: string,
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): DeploymentActivationCurrentStateHarnessScenario {
  const comparison = compareActivationCurrentStates(expected, actual);

  return expectScenario(
    name,
    comparison.equivalent,
    JSON.stringify(comparison.differences),
  );
}

function different(
  name: string,
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  expectedPath: string,
): DeploymentActivationCurrentStateHarnessScenario {
  const comparison = compareActivationCurrentStates(expected, actual);

  return expectScenario(
    name,
    !comparison.equivalent &&
      comparison.differences.some((difference) => difference.path === expectedPath),
    JSON.stringify(comparison.differences),
  );
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationCurrentStateHarnessScenario {
  return { name, passed, message };
}