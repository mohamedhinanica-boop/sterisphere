import "server-only";

import {
  buildHardwareAssignmentPayloadsFromDraft as buildPayloads,
} from "./deployment-hardware-assignment-payload";
import {
  createDeploymentProvisionCounts,
  findDuplicateDeploymentKeys,
  resolveDeploymentProvisionStatus,
} from "./deployment-provisioning-utils";
import {
  isReusableHardwareAssignment,
} from "./deployment-hardware-assignment-integrity";
import type {
  DeploymentHardwareAssignmentProvisioningPrerequisiteRepository,
  DeploymentHardwareAssignmentRepository,
} from "./deployment-hardware-assignment-repository";
import type {
  CreateDeploymentHardwareAssignmentPayload,
  DeploymentHardwareAssignmentProvisionCommand,
  DeploymentHardwareAssignmentProvisionCounts,
  DeploymentHardwareAssignmentProvisionResult,
  DeploymentHardwareAssignmentRecord,
} from "./deployment-hardware-assignment-types";

export class DeploymentHardwareAssignmentService {
  constructor(
    private readonly repository: DeploymentHardwareAssignmentRepository &
      DeploymentHardwareAssignmentProvisioningPrerequisiteRepository,
  ) {}

  buildHardwareAssignmentPayloadsFromDraft(
    command: DeploymentHardwareAssignmentProvisionCommand,
  ): readonly CreateDeploymentHardwareAssignmentPayload[] {
    return buildPayloads(command.draft, {
      clinicId: command.clinicId,
      timestamp: command.createdAt,
    });
  }

  async provisionHardwareAssignmentsForClinic(
    command: DeploymentHardwareAssignmentProvisionCommand,
  ): Promise<DeploymentHardwareAssignmentProvisionResult> {
    const clinicId = command.clinicId.trim();

    if (!clinicId) {
      return rejectedResult(
        "Hardware assignment provisioning requires a clinic id.",
      );
    }

    const clinicExists = await this.repository.clinicExists(clinicId);

    if (!clinicExists) {
      return rejectedResult(
        "Hardware assignment provisioning requires an existing clinic root.",
      );
    }

    const clinicSettingsExist = await this.repository.clinicSettingsExist(
      clinicId,
    );

    if (!clinicSettingsExist) {
      return rejectedResult(
        "Hardware assignment provisioning requires clinic settings to be provisioned first.",
      );
    }

    const providerShellsProvisioned =
      await this.repository.providerShellsProvisioned(clinicId);

    if (!providerShellsProvisioned) {
      return rejectedResult(
        "Hardware assignment provisioning requires provider shells to be provisioned first.",
      );
    }

    const sterilizerShellsProvisioned =
      await this.repository.sterilizerShellsProvisioned(clinicId);

    if (!sterilizerShellsProvisioned) {
      return rejectedResult(
        "Hardware assignment provisioning requires sterilizer shells to be provisioned first.",
      );
    }

    const workstationShellsProvisioned =
      await this.repository.workstationShellsProvisioned(clinicId);

    if (!workstationShellsProvisioned) {
      return rejectedResult(
        "Hardware assignment provisioning requires workstation shells to be provisioned first.",
      );
    }

    const hardwareShellsProvisioned =
      await this.repository.hardwareShellsProvisioned(clinicId);

    if (!hardwareShellsProvisioned) {
      return rejectedResult(
        "Hardware assignment provisioning requires hardware shells to be provisioned first.",
      );
    }

    const payloads = this.buildHardwareAssignmentPayloadsFromDraft({
      ...command,
      clinicId,
    });
    const counts = createDeploymentProvisionCounts(payloads.length);
    const assignments: DeploymentHardwareAssignmentRecord[] = [];
    const duplicateRequestedHardwareKeys = findDuplicateDeploymentKeys(
      payloads.map((payload) => payload.deploymentHardwareKey),
    );
    const existingAssignments =
      await this.repository.listDeploymentHardwareAssignments(clinicId);
    const conflictingExistingHardwareKeys = findDuplicateDeploymentKeys(
      existingAssignments
        .map((assignment) => assignment.deploymentHardwareKey)
        .filter((key): key is string => Boolean(key)),
    );

    for (const payload of payloads) {
      if (
        duplicateRequestedHardwareKeys.has(payload.deploymentHardwareKey) ||
        conflictingExistingHardwareKeys.has(payload.deploymentHardwareKey)
      ) {
        counts.skipped += 1;
        counts.conflicts += 1;
        continue;
      }

      const existingAssignment =
        await this.repository.findAssignmentByHardwareDeploymentKey(
          clinicId,
          payload.deploymentHardwareKey,
        );

      if (existingAssignment) {
        if (isReusableHardwareAssignment(existingAssignment, payload)) {
          counts.reused += 1;
          assignments.push(existingAssignment);
          continue;
        }

        counts.skipped += 1;
        counts.conflicts += 1;
        continue;
      }

      const createResult =
        await this.repository.createHardwareAssignment(payload);

      if (createResult.ok && createResult.assignment) {
        counts.created += 1;
        assignments.push(createResult.assignment);
        continue;
      }

      counts.skipped += 1;
      counts.conflicts += 1;
    }

    return {
      ok: counts.conflicts === 0,
      status: resolveStatus(counts),
      assignments,
      counts,
      message: resolveMessage(counts),
    };
  }
}

export function createDeploymentHardwareAssignmentService(
  repository: DeploymentHardwareAssignmentRepository &
    DeploymentHardwareAssignmentProvisioningPrerequisiteRepository,
): DeploymentHardwareAssignmentService {
  return new DeploymentHardwareAssignmentService(repository);
}

export function buildHardwareAssignmentPayloadsFromDraft(
  command: DeploymentHardwareAssignmentProvisionCommand,
): readonly CreateDeploymentHardwareAssignmentPayload[] {
  return buildPayloads(command.draft, {
    clinicId: command.clinicId,
    timestamp: command.createdAt,
  });
}

function rejectedResult(
  message: string,
): DeploymentHardwareAssignmentProvisionResult {
  return {
    ok: false,
    status: "rejected",
    assignments: [],
    counts: createDeploymentProvisionCounts(0),
    message,
  };
}

function resolveStatus(
  counts: DeploymentHardwareAssignmentProvisionCounts,
): DeploymentHardwareAssignmentProvisionResult["status"] {
  return resolveDeploymentProvisionStatus<
    DeploymentHardwareAssignmentProvisionResult["status"]
  >(counts);
}

function resolveMessage(
  counts: DeploymentHardwareAssignmentProvisionCounts,
): string {
  if (counts.conflicts > 0) {
    return "Hardware assignment provisioning detected duplicate or conflicting planned assignments and skipped conflicting relationships.";
  }

  if (counts.created > 0 && counts.reused > 0) {
    return "Hardware assignment provisioning created missing planned relationships and reused existing planned relationships.";
  }

  if (counts.created > 0) {
    return "Hardware assignment provisioning created inactive planned relationships for the clinic.";
  }

  if (counts.requested === 0) {
    return "Hardware assignment provisioning requested no planned relationships.";
  }

  return "Hardware assignment provisioning reused existing planned relationships.";
}