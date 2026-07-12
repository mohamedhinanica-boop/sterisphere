import {
  externalRuntimeEvidenceBoundary,
  mapHardwareAssignmentRow,
  mapHardwareShellRow,
  mapProviderShellRow,
} from "./deployment-activation-readiness-supabase-repository";

export interface DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationReadinessSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationReadinessSupabaseRepositoryHarnessScenario[];
}

export async function runDeploymentActivationReadinessSupabaseRepositoryHarness(): Promise<DeploymentActivationReadinessSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioProviderShellMapping(),
    scenarioHardwareDiscoveredStatusMapping(),
    scenarioHardwareBindingFieldsPreserved(),
    scenarioHardwareAssignmentMapping(),
    scenarioNullActiveMapsUnsafe(),
    scenarioRuntimeEvidenceBoundaryRemainsExternal(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioProviderShellMapping(): DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  const shell = mapProviderShellRow({
    id: "provider-row-001",
    clinic_id: "clinic-001",
    deployment_provider_key: "provider-001",
    provisioning_source: "setup_draft",
    provisioning_status: "placeholder",
    active: false,
  });

  return expectScenario(
    "provider shell row maps readiness fields",
    shell.clinicId === "clinic-001" &&
      shell.deploymentProviderKey === "provider-001" &&
      shell.provisioningStatus === "placeholder" &&
      shell.active === false,
    JSON.stringify(shell),
  );
}

function scenarioHardwareDiscoveredStatusMapping(): DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  const shell = mapHardwareShellRow(hardwareRow({ status: "discovered" }));

  return expectScenario(
    "hardware discovered status is preserved for compatibility checks",
    shell.status === "discovered" &&
      shell.provisioningSource === "setup_draft" &&
      shell.provisioningStatus === "planned" &&
      shell.active === false,
    JSON.stringify(shell),
  );
}

function scenarioHardwareBindingFieldsPreserved(): DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  const shell = mapHardwareShellRow(
    hardwareRow({
      agent_id: "agent-live-001",
      default_workstation_id: "workstation-row-001",
      current_workstation_id: "workstation-row-002",
    }),
  );

  return expectScenario(
    "hardware operational binding fields are preserved",
    shell.agentId === "agent-live-001" &&
      shell.defaultWorkstationId === "workstation-row-001" &&
      shell.currentWorkstationId === "workstation-row-002",
    JSON.stringify(shell),
  );
}

function scenarioHardwareAssignmentMapping(): DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  const assignment = mapHardwareAssignmentRow({
    id: "assignment-row-001",
    clinic_id: "clinic-001",
    deployment_hardware_key: "hardware-001",
    assignment_key: "hardware-assignment-hardware-001",
    target_type: "workstation",
    target_deployment_key: "workstation-001",
    assignment_source: "setup_draft",
    assignment_status: "planned",
    active: false,
  });

  return expectScenario(
    "hardware assignment row maps logical target fields",
    assignment.deploymentHardwareKey === "hardware-001" &&
      assignment.assignmentKey === "hardware-assignment-hardware-001" &&
      assignment.targetType === "workstation" &&
      assignment.targetDeploymentKey === "workstation-001" &&
      assignment.active === false,
    JSON.stringify(assignment),
  );
}

function scenarioNullActiveMapsUnsafe(): DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  const shell = mapHardwareShellRow(hardwareRow({ active: null }));

  return expectScenario(
    "null active state maps as unsafe active",
    shell.active === true,
    JSON.stringify(shell),
  );
}

function scenarioRuntimeEvidenceBoundaryRemainsExternal(): DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  const boundary = externalRuntimeEvidenceBoundary();

  return expectScenario(
    "runtime validation and resolution evidence remain external",
    boundary.assignmentTargetValidation === null &&
      boundary.plannedAssignmentResolution === null,
    JSON.stringify(boundary),
  );
}

function hardwareRow(
  input: Partial<Parameters<typeof mapHardwareShellRow>[0]> = {},
): Parameters<typeof mapHardwareShellRow>[0] {
  return {
    id: input.id ?? "hardware-row-001",
    clinic_id: input.clinic_id === undefined ? "clinic-001" : input.clinic_id,
    deployment_hardware_key:
      input.deployment_hardware_key === undefined
        ? "hardware-001"
        : input.deployment_hardware_key,
    provisioning_source:
      input.provisioning_source === undefined
        ? "setup_draft"
        : input.provisioning_source,
    provisioning_status:
      input.provisioning_status === undefined
        ? "planned"
        : input.provisioning_status,
    active: input.active === undefined ? false : input.active,
    agent_id: input.agent_id === undefined ? null : input.agent_id,
    default_workstation_id:
      input.default_workstation_id === undefined
        ? null
        : input.default_workstation_id,
    current_workstation_id:
      input.current_workstation_id === undefined
        ? null
        : input.current_workstation_id,
    status: input.status === undefined ? "discovered" : input.status,
  };
}

function expectScenario(
  name: string,
  passed: boolean,
  message: string,
): DeploymentActivationReadinessSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}
