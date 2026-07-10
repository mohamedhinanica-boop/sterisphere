import type { DeploymentDraft } from "./deployment-draft";
import {
  buildHardwareShellPayloadsFromDraft,
  type DeploymentHardwarePayloadContext,
} from "./deployment-hardware-payload";
import type { CreateDeploymentHardwareShellPayload } from "./deployment-hardware-types";
import type {
  CreateDeploymentHardwareAssignmentPayload,
  DeploymentHardwareAssignmentTargetType,
} from "./deployment-hardware-assignment-types";

export type DeploymentHardwareAssignmentPayloadContext =
  DeploymentHardwarePayloadContext;

export function buildHardwareAssignmentPayloadsFromDraft(
  draft: DeploymentDraft,
  context: DeploymentHardwareAssignmentPayloadContext,
): readonly CreateDeploymentHardwareAssignmentPayload[] {
  return buildHardwareAssignmentPayloadsFromHardwareShells(
    buildHardwareShellPayloadsFromDraft(draft, context),
    context,
  );
}

export function buildHardwareAssignmentPayloadsFromHardwareShells(
  hardwareShells: readonly CreateDeploymentHardwareShellPayload[],
  context: DeploymentHardwareAssignmentPayloadContext,
): readonly CreateDeploymentHardwareAssignmentPayload[] {
  const clinicId = context.clinicId.trim();

  if (!clinicId) {
    return [];
  }

  return hardwareShells.map((hardwareShell, index) => {
    const target = resolveTarget(hardwareShell);
    const displayOrder = index + 1;

    return {
      clinicId,
      deploymentHardwareAssignmentKey: `hardware-assignment-${hardwareShell.deploymentHardwareKey}`,
      deploymentHardwareKey: hardwareShell.deploymentHardwareKey,
      targetType: target.targetType,
      targetDeploymentKey: target.targetDeploymentKey,
      assignmentStatus: "planned",
      assignmentSource: "setup_draft",
      active: false,
      displayOrder,
      reason: buildAssignmentReason(target.targetType),
      metadata: {
        hardwareType: hardwareShell.hardwareType,
        capabilities: [...hardwareShell.capabilities],
      },
      ...(context.timestamp
        ? { createdAt: context.timestamp, updatedAt: context.timestamp }
        : {}),
    };
  });
}

function resolveTarget(
  hardwareShell: CreateDeploymentHardwareShellPayload,
): {
  targetType: DeploymentHardwareAssignmentTargetType;
  targetDeploymentKey: string | null;
} {
  if (hardwareShell.assignedWorkstationKey) {
    return {
      targetType: "workstation",
      targetDeploymentKey: hardwareShell.assignedWorkstationKey,
    };
  }

  if (hardwareShell.assignedSterilizerKey) {
    return {
      targetType: "sterilizer",
      targetDeploymentKey: hardwareShell.assignedSterilizerKey,
    };
  }

  return {
    targetType: "unassigned",
    targetDeploymentKey: null,
  };
}

function buildAssignmentReason(
  targetType: DeploymentHardwareAssignmentTargetType,
): string {
  if (targetType === "workstation") {
    return "Hardware shell carries a logical workstation deployment key from setup draft planning.";
  }

  if (targetType === "sterilizer") {
    return "Hardware shell carries a logical sterilizer deployment key from setup draft planning.";
  }

  return "Hardware shell has no logical deployment target and is explicitly planned as unassigned.";
}