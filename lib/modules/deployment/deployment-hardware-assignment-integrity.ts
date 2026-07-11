import type {
  DeploymentHardwareAssignmentPersistenceResult,
} from "./deployment-hardware-assignment-repository";
import type {
  CreateDeploymentHardwareAssignmentPayload,
  DeploymentHardwareAssignmentRecord,
} from "./deployment-hardware-assignment-types";

export function validateHardwareAssignmentCreatePayload(
  payload: CreateDeploymentHardwareAssignmentPayload,
): string | null {
  if (!payload.clinicId.trim()) {
    return "Hardware assignment creation requires a clinic id.";
  }

  if (!payload.deploymentHardwareKey.trim()) {
    return "Hardware assignment creation requires a deployment hardware key.";
  }

  if (!payload.deploymentHardwareAssignmentKey.trim()) {
    return "Hardware assignment creation requires an assignment key.";
  }

  if (payload.displayOrder < 1) {
    return "Hardware assignment creation requires a positive display order.";
  }

  if (
    payload.assignmentSource !== "setup_draft" ||
    payload.assignmentStatus !== "planned" ||
    payload.active !== false
  ) {
    return "Hardware assignment creation accepts only inactive setup_draft planned assignments.";
  }

  if (payload.targetType === "unassigned") {
    return payload.targetDeploymentKey === null
      ? null
      : "Unassigned hardware assignments must not carry a target deployment key.";
  }

  if (!payload.targetDeploymentKey?.trim()) {
    return "Workstation and sterilizer hardware assignments require a logical target deployment key.";
  }

  return null;
}

export function resolveExistingHardwareAssignment(
  assignment: DeploymentHardwareAssignmentRecord,
  payload: CreateDeploymentHardwareAssignmentPayload,
): DeploymentHardwareAssignmentPersistenceResult {
  if (isReusableHardwareAssignment(assignment, payload)) {
    return {
      ok: true,
      assignment,
      message:
        "Hardware planned assignment already exists for this clinic; reuse it.",
    };
  }

  return {
    ok: false,
    assignment,
    message:
      "Hardware deployment key is already used by an incompatible assignment record.",
  };
}

export function isReusableHardwareAssignment(
  assignment: DeploymentHardwareAssignmentRecord,
  payload: CreateDeploymentHardwareAssignmentPayload,
): boolean {
  return (
    assignment.clinicId === payload.clinicId &&
    assignment.deploymentHardwareKey === payload.deploymentHardwareKey &&
    assignment.deploymentHardwareAssignmentKey ===
      payload.deploymentHardwareAssignmentKey &&
    assignment.targetType === payload.targetType &&
    assignment.targetDeploymentKey === payload.targetDeploymentKey &&
    assignment.assignmentSource === "setup_draft" &&
    assignment.assignmentStatus === "planned" &&
    assignment.active === false
  );
}
