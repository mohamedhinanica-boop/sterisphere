import {
  assertAtMostOne,
  externalActivationPlanEvidenceBoundary,
  mapClinicRow,
  mapDeploymentRunRow,
  mapHardwareAssignmentRow,
  mapHardwareShellRow,
  mapProviderShellRow,
  mapSterilizerShellRow,
  mapWorkstationShellRow,
} from "./deployment-activation-plan-supabase-repository";

export interface DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface DeploymentActivationPlanSupabaseRepositoryHarnessResult {
  passed: boolean;
  scenarios: readonly DeploymentActivationPlanSupabaseRepositoryHarnessScenario[];
}

export async function runDeploymentActivationPlanSupabaseRepositoryHarness(): Promise<DeploymentActivationPlanSupabaseRepositoryHarnessResult> {
  const scenarios = [
    scenarioDeploymentRunMapping(),
    scenarioClinicOwnershipMapping(),
    scenarioProviderMapping(),
    scenarioSterilizerMapping(),
    scenarioWorkstationMapping(),
    scenarioHardwareDiscoveredStatusMapping(),
    scenarioHardwareBindingFieldsPreserved(),
    scenarioHardwareAssignmentTargetFieldsPreserved(),
    scenarioNullActiveMapsUnsafe(),
    scenarioRuntimeEvidenceRemainsExternal(),
    scenarioDuplicateLookupProtection(),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioDeploymentRunMapping(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const row = mapDeploymentRunRow({
    deployment_run_id: "deployment-run-001",
    clinic_id: "clinic-001",
    lifecycle_state: "succeeded",
    deployment_status: "ready",
  });

  return expectScenario(
    "deployment run row maps activation planning identity and state",
    row.deploymentRunId === "deployment-run-001" &&
      row.clinicId === "clinic-001" &&
      row.lifecycleState === "succeeded" &&
      row.deploymentStatus === "ready",
    JSON.stringify(row),
  );
}

function scenarioClinicOwnershipMapping(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const clinic = mapClinicRow({ id: "clinic-001" });

  return expectScenario(
    "clinic row maps ownership root",
    clinic.id === "clinic-001",
    JSON.stringify(clinic),
  );
}

function scenarioProviderMapping(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const shell = mapProviderShellRow({
    id: "provider-row-001",
    clinic_id: "clinic-001",
    deployment_provider_key: "provider-001",
    provisioning_source: "setup_draft",
    provisioning_status: "placeholder",
    active: false,
  });

  return expectScenario(
    "provider shell row maps activation drift fields",
    shell.deploymentProviderKey === "provider-001" &&
      shell.provisioningSource === "setup_draft" &&
      shell.provisioningStatus === "placeholder" &&
      shell.active === false,
    JSON.stringify(shell),
  );
}

function scenarioSterilizerMapping(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const shell = mapSterilizerShellRow({
    id: "sterilizer-row-001",
    clinic_id: "clinic-001",
    deployment_sterilizer_key: "sterilizer-001",
    provisioning_source: "setup_draft",
    provisioning_status: "planned",
    active: false,
  });

  return expectScenario(
    "sterilizer shell row maps activation drift fields",
    shell.deploymentSterilizerKey === "sterilizer-001" &&
      shell.provisioningSource === "setup_draft" &&
      shell.provisioningStatus === "planned" &&
      shell.active === false,
    JSON.stringify(shell),
  );
}

function scenarioWorkstationMapping(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const shell = mapWorkstationShellRow({
    id: "workstation-row-001",
    clinic_id: "clinic-001",
    deployment_workstation_key: "workstation-001",
    provisioning_source: "setup_draft",
    provisioning_status: "planned",
    active: false,
  });

  return expectScenario(
    "workstation shell row maps activation drift fields",
    shell.deploymentWorkstationKey === "workstation-001" &&
      shell.provisioningSource === "setup_draft" &&
      shell.provisioningStatus === "planned" &&
      shell.active === false,
    JSON.stringify(shell),
  );
}

function scenarioHardwareDiscoveredStatusMapping(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const shell = mapHardwareShellRow(hardwareRow({ status: "discovered" }));

  return expectScenario(
    "hardware discovered status is preserved for activation compatibility",
    shell.status === "discovered" &&
      shell.provisioningSource === "setup_draft" &&
      shell.provisioningStatus === "planned" &&
      shell.active === false,
    JSON.stringify(shell),
  );
}

function scenarioHardwareBindingFieldsPreserved(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const shell = mapHardwareShellRow(
    hardwareRow({
      agent_id: "agent-live-001",
      default_workstation_id: "workstation-row-001",
      current_workstation_id: "workstation-row-002",
    }),
  );

  return expectScenario(
    "hardware operational binding fields are preserved for drift detection",
    shell.agentId === "agent-live-001" &&
      shell.defaultWorkstationId === "workstation-row-001" &&
      shell.currentWorkstationId === "workstation-row-002",
    JSON.stringify(shell),
  );
}

function scenarioHardwareAssignmentTargetFieldsPreserved(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const assignment = mapHardwareAssignmentRow({
    id: "assignment-row-001",
    clinic_id: "clinic-001",
    deployment_hardware_key: "hardware-001",
    assignment_key: "hardware-assignment-hardware-001",
    target_type: "sterilizer",
    target_deployment_key: "sterilizer-001",
    assignment_source: "setup_draft",
    assignment_status: "planned",
    active: false,
  });

  return expectScenario(
    "hardware assignment row preserves logical target fields exactly",
    assignment.deploymentHardwareKey === "hardware-001" &&
      assignment.assignmentKey === "hardware-assignment-hardware-001" &&
      assignment.targetType === "sterilizer" &&
      assignment.targetDeploymentKey === "sterilizer-001" &&
      assignment.assignmentSource === "setup_draft" &&
      assignment.assignmentStatus === "planned" &&
      assignment.active === false,
    JSON.stringify(assignment),
  );
}

function scenarioNullActiveMapsUnsafe(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const shell = mapHardwareShellRow(hardwareRow({ active: null }));

  return expectScenario(
    "null active state maps as unsafe active",
    shell.active === true,
    JSON.stringify(shell),
  );
}

function scenarioRuntimeEvidenceRemainsExternal(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  const boundary = externalActivationPlanEvidenceBoundary();

  return expectScenario(
    "readiness and resolution evidence remain external to durable snapshot reads",
    boundary.assignmentTargetValidation === null &&
      boundary.plannedAssignmentResolution === null,
    JSON.stringify(boundary),
  );
}

function scenarioDuplicateLookupProtection(): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  try {
    assertAtMostOne([{}, {}], "deployment_run");
  } catch (error) {
    return expectScenario(
      "duplicate singleton rows throw deterministic repository errors",
      error instanceof Error &&
        error.message.includes("Duplicate deployment_run rows"),
      error instanceof Error ? error.message : String(error),
    );
  }

  return expectScenario(
    "duplicate singleton rows throw deterministic repository errors",
    false,
    "expected duplicate lookup guard to throw",
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
): DeploymentActivationPlanSupabaseRepositoryHarnessScenario {
  return { name, passed, message };
}
