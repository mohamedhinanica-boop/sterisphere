export interface ActivationCurrentStateDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

export type ActivationCurrentState = Record<string, unknown>;

const SNAKE_TO_CAMEL_KEYS = new Map<string, string>([
  ["clinic_id", "clinicId"],
  ["deployment_run_id", "deploymentRunId"],
  ["lifecycle_state", "lifecycleState"],
  ["deployment_status", "deploymentStatus"],
  ["rollback_state", "rollbackState"],
  ["deployment_provider_key", "deploymentProviderKey"],
  ["deployment_sterilizer_key", "deploymentSterilizerKey"],
  ["deployment_workstation_key", "deploymentWorkstationKey"],
  ["deployment_hardware_key", "deploymentHardwareKey"],
  ["provisioning_source", "provisioningSource"],
  ["provisioning_status", "provisioningStatus"],
  ["operational_status", "operationalStatus"],
  ["agent_id", "agentId"],
  ["default_workstation_id", "defaultWorkstationId"],
  ["current_workstation_id", "currentWorkstationId"],
  ["assignment_key", "assignmentKey"],
  ["target_type", "targetType"],
  ["target_deployment_key", "targetDeploymentKey"],
  ["target_id", "targetId"],
  ["assignment_source", "assignmentSource"],
  ["assignment_status", "assignmentStatus"],
]);

export function buildClinicActivationCurrentState(input: {
  clinicId: string | null;
  deploymentStatus: string | null;
}): ActivationCurrentState {
  return {
    clinicId: input.clinicId,
    deploymentStatus: input.deploymentStatus,
  };
}

export function buildClinicSettingsActivationCurrentState(input: {
  clinicId: string | null;
}): ActivationCurrentState {
  return {
    clinicId: input.clinicId,
    activationMarker: "settings-no-op",
  };
}

export function buildProviderShellActivationCurrentState(input: {
  id: string | null;
  clinicId: string | null;
  deploymentProviderKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean | null;
}): ActivationCurrentState {
  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentProviderKey: input.deploymentProviderKey,
    provisioningSource: input.provisioningSource,
    provisioningStatus: input.provisioningStatus,
    active: input.active,
  };
}

export function buildSterilizerShellActivationCurrentState(input: {
  id: string | null;
  clinicId: string | null;
  deploymentSterilizerKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean | null;
}): ActivationCurrentState {
  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentSterilizerKey: input.deploymentSterilizerKey,
    provisioningSource: input.provisioningSource,
    provisioningStatus: input.provisioningStatus,
    active: input.active,
  };
}

export function buildWorkstationShellActivationCurrentState(input: {
  id: string | null;
  clinicId: string | null;
  deploymentWorkstationKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean | null;
}): ActivationCurrentState {
  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentWorkstationKey: input.deploymentWorkstationKey,
    provisioningSource: input.provisioningSource,
    provisioningStatus: input.provisioningStatus,
    active: input.active,
  };
}

export function buildHardwareShellActivationCurrentState(input: {
  id: string | null;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  provisioningSource: string | null;
  provisioningStatus: string | null;
  active: boolean | null;
  operationalStatus: string | null;
  agentId: string | null;
  defaultWorkstationId: string | null;
  currentWorkstationId: string | null;
}): ActivationCurrentState {
  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentHardwareKey: input.deploymentHardwareKey,
    provisioningSource: input.provisioningSource,
    provisioningStatus: input.provisioningStatus,
    active: input.active,
    operationalStatus: input.operationalStatus,
    agentId: input.agentId,
    defaultWorkstationId: input.defaultWorkstationId,
    currentWorkstationId: input.currentWorkstationId,
  };
}

export function buildHardwareBindingActivationCurrentState(input: {
  hardwareId: string | null;
  deploymentHardwareKey: string | null;
  targetType: string | null;
  targetDeploymentKey: string | null;
  targetId: string | null;
}): ActivationCurrentState {
  return {
    hardwareId: input.hardwareId,
    deploymentHardwareKey: input.deploymentHardwareKey,
    targetType: input.targetType,
    targetDeploymentKey: input.targetDeploymentKey,
    targetId: input.targetId,
  };
}

export function buildHardwareAssignmentActivationCurrentState(input: {
  id: string | null;
  clinicId: string | null;
  deploymentHardwareKey: string | null;
  assignmentKey: string | null;
  targetType: string | null;
  targetDeploymentKey: string | null;
  assignmentSource: string | null;
  assignmentStatus: string | null;
  active: boolean | null;
}): ActivationCurrentState {
  return {
    id: input.id,
    clinicId: input.clinicId,
    deploymentHardwareKey: input.deploymentHardwareKey,
    assignmentKey: input.assignmentKey,
    targetType: input.targetType,
    targetDeploymentKey: input.targetDeploymentKey,
    assignmentSource: input.assignmentSource,
    assignmentStatus: input.assignmentStatus,
    active: input.active,
  };
}

export function buildDeploymentRunActivationCurrentState(input: {
  id?: string | null;
  deploymentRunId: string | null;
  clinicId: string | null;
  lifecycleState: string | null;
  deploymentStatus: string | null;
  rollbackState?: string | null;
}): ActivationCurrentState {
  return {
    id: input.id ?? null,
    deploymentRunId: input.deploymentRunId,
    clinicId: input.clinicId,
    lifecycleState: input.lifecycleState,
    deploymentStatus: input.deploymentStatus,
    rollbackState: input.rollbackState ?? null,
  };
}

export function compareActivationCurrentStates(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): {
  equivalent: boolean;
  differences: readonly ActivationCurrentStateDifference[];
} {
  const expectedState = canonicalizeActivationCurrentState(expected);
  const actualState = canonicalizeActivationCurrentState(actual);
  const differences: ActivationCurrentStateDifference[] = [];

  collectDifferences("$", expectedState, actualState, differences);

  return {
    equivalent: differences.length === 0,
    differences,
  };
}

export function canonicalizeActivationCurrentState(
  state: Record<string, unknown>,
): ActivationCurrentState {
  return sortRecord(normalizeKeys(state)) as ActivationCurrentState;
}

export function formatActivationCurrentStateDifferences(
  differences: readonly ActivationCurrentStateDifference[],
  maxDifferences = 4,
): string {
  if (differences.length === 0) {
    return "no safety-field differences";
  }

  const visible = differences
    .slice(0, maxDifferences)
    .map(
      (difference) =>
        `${difference.path}: expected ${safeValue(difference.expected)}, actual ${safeValue(difference.actual)}`,
    );
  const hidden = differences.length - visible.length;

  return hidden > 0
    ? `${visible.join("; ")}; ${hidden} more safety-field difference${hidden === 1 ? "" : "s"}`
    : visible.join("; ");
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeKeys);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      continue;
    }

    normalized[SNAKE_TO_CAMEL_KEYS.get(key) ?? key] = normalizeKeys(entry);
  }

  return normalized;
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecord);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortRecord(entry)]),
  );
}

function collectDifferences(
  path: string,
  expected: unknown,
  actual: unknown,
  differences: ActivationCurrentStateDifference[],
): void {
  if (Object.is(expected, actual)) {
    return;
  }

  if (isPlainRecord(expected) && isPlainRecord(actual)) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);

    for (const key of [...keys].sort()) {
      collectDifferences(
        `${path}.${key}`,
        expected[key],
        actual[key],
        differences,
      );
    }

    return;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);

    for (let index = 0; index < length; index += 1) {
      collectDifferences(
        `${path}[${index}]`,
        expected[index],
        actual[index],
        differences,
      );
    }

    return;
  }

  differences.push({ path, expected, actual });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeValue(value: unknown): string {
  if (value === undefined) {
    return "<missing>";
  }

  const serialized = JSON.stringify(value);

  if (!serialized) {
    return String(value);
  }

  return serialized.length > 80 ? `${serialized.slice(0, 77)}...` : serialized;
}
